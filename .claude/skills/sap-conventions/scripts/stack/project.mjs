/**
 * stack/project.mjs — apply stack.json to a generated project, or check it for drift.
 *
 * apply: deterministic value edits only (package.json ranges, engines.node, manifest
 *        minUI5Version, UI5 CDN URLs in webapp/**\/*.html, ui5*.yaml specVersion/framework.version,
 *        mta.yaml _schema-version). Idempotent. Never runs npm; prints the install commands.
 * check: read-only; FAIL / WARN / PASS per item, exit 1 on any FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { JsonDoc, yamlGetTop, yamlSetTop, yamlGetFrameworkVersion, yamlSetFrameworkVersion, findCdnUrls, rewriteBootstrapHtml } from "./edit.mjs";
import { satisfies, isSubset, intersects, parseVersion, cmp, isExactVersion, StackError, EXIT } from "./core.mjs";

const exists = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, "utf8");
const readJson = (p) => JSON.parse(read(p).replace(/^\uFEFF/, ""));
const SECTIONS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const NON_REGISTRY = /^(file:|link:|git\+|git:|github:|https?:|npm:|workspace:)/;

/** Find the parts of a project the stack governs. */
export function discoverProject(projectDir) {
  const root = path.resolve(projectDir);
  const rootPkgFile = path.join(root, "package.json");
  if (!exists(rootPkgFile)) throw new StackError("" + root + ": no package.json — not a project root");
  const rootPkg = readJson(rootPkgFile);
  const allDeps = Object.assign({}, ...SECTIONS.map((s) => rootPkg[s] || {}));
  const isCap = !!allDeps["@sap/cds"] || exists(path.join(root, "srv")) || exists(path.join(root, "db"));
  const modules = [];
  const addModule = (dir) => {
    const webapp = path.join(dir, "webapp");
    if (!exists(path.join(webapp, "manifest.json"))) return;
    const htmls = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (["node_modules", "dist", "localService"].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith(".html")) htmls.push(p);
    } };
    walk(webapp);
    const yamls = fs.readdirSync(dir).filter((f) => /^ui5.*\.ya?ml$/.test(f)).map((f) => path.join(dir, f));
    modules.push({ dir, pkg: exists(path.join(dir, "package.json")) && dir !== root ? path.join(dir, "package.json") : null,
      manifest: path.join(webapp, "manifest.json"), htmls, yamls, ownLock: exists(path.join(dir, "package-lock.json")) && dir !== root });
  };
  const appDir = path.join(root, "app");
  if (exists(appDir)) for (const e of fs.readdirSync(appDir, { withFileTypes: true })) if (e.isDirectory()) addModule(path.join(appDir, e.name));
  addModule(root); // standalone UI app
  const standaloneUi = modules.some((m) => m.dir === root);
  return { root, rootPkgFile, rootPkg, isCap, modules, standaloneUi, capWithUi: isCap && modules.some((m) => m.dir !== root),
    mta: exists(path.join(root, "mta.yaml")) ? path.join(root, "mta.yaml") : null };
}

function sectionOf(pkg, name) { return SECTIONS.find((s) => pkg[s] && name in pkg[s]); }
const rel = (root, f) => path.relative(root, f).split(path.sep).join("/") || ".";

/** Build the list of governed items (shared by apply and check). */
export function planProject(proj, resolved, scope = "all") {
  const items = [];
  const want = (s) => scope === "all" || scope === s;
  const rootPkg = proj.rootPkg;

  if (want("cap") && proj.isCap) {
    for (const [name, spec] of Object.entries(resolved.cap.packages)) {
      const sec = sectionOf(rootPkg, name);
      if (sec) items.push({ group: "cap", file: proj.rootPkgFile, keys: [sec, name], expected: spec.range, kind: "range", pkg: name, installRoot: proj.root });
      else if (spec.required) items.push({ group: "cap", file: proj.rootPkgFile, keys: [spec.section, name], expected: spec.range, kind: "range", pkg: name, required: true, installRoot: proj.root });
    }
    items.push({ group: "cap", file: proj.rootPkgFile, keys: ["engines", "node"], expected: resolved.cap.node, kind: "engines", required: true });
    // `cds init` writes a VS Code task running bare `cds watch` (hard rule 5: npm run watch, cwd pinned).
    const tasks = path.join(proj.root, ".vscode", "tasks.json");
    if (exists(tasks) && BARE_CDS_TASK.test(read(tasks))) items.push({ group: "cap", file: tasks, keys: ["tasks", "cds watch"], expected: "npm run watch (cwd pinned)", kind: "vscodeTask" });
  }
  if ((want("cap") || want("ui")) && (proj.isCap || proj.standaloneUi)) {
    for (const [name, spec] of Object.entries(resolved.packages.root)) {
      const sec = sectionOf(rootPkg, name);
      if (sec) items.push({ group: "root", file: proj.rootPkgFile, keys: [sec, name], expected: spec.range, kind: "range", pkg: name, installRoot: proj.root });
      else if (spec.required === "capWithUi" && proj.capWithUi) items.push({ group: "root", file: proj.rootPkgFile, keys: [spec.section || "devDependencies", name], expected: spec.range, kind: "range", pkg: name, required: true, installRoot: proj.root });
    }
  }
  if (want("ui")) {
    for (const m of proj.modules) {
      const pkgFile = m.pkg || (m.dir === proj.root ? proj.rootPkgFile : null);
      if (pkgFile) {
        const pkg = readJson(pkgFile);
        for (const [name, spec] of Object.entries(resolved.packages.app)) {
          const sec = sectionOf(pkg, name);
          if (sec) items.push({ group: "ui", file: pkgFile, keys: [sec, name], expected: spec.range, kind: "range", pkg: name, installRoot: m.dir, fallbackInstallRoot: proj.root });
          else if (spec.required === "uiModule") items.push({ group: "ui", file: pkgFile, keys: [spec.section || "devDependencies", name], expected: spec.range, kind: "range", pkg: name, required: true, installRoot: m.dir, fallbackInstallRoot: proj.root });
        }
      }
      const manifest = readJson(m.manifest);
      const deps = manifest["sap.ui5"]?.dependencies;
      if (deps && typeof deps === "object") items.push({ group: "ui", file: m.manifest, keys: ["sap.ui5", "dependencies", "minUI5Version"], expected: resolved.ui5.minUI5Version, kind: "ui5", policy: "minUI5" });
      for (const h of m.htmls) if (findCdnUrls(read(h)).length) items.push({ group: "ui", file: h, keys: ["<UI5 CDN URL>"], expected: resolved.ui5.version, kind: "html" });
      for (const y of m.yamls) {
        const text = read(y);
        if (yamlGetTop(text, "specVersion") && resolved.ui5Tooling.specVersion) items.push({ group: "ui", file: y, keys: ["specVersion"], expected: resolved.ui5Tooling.specVersion, kind: "yamlTop" });
        if (yamlGetFrameworkVersion(text)) items.push({ group: "ui", file: y, keys: ["framework.version"], expected: resolved.ui5.version, kind: "yamlFramework" });
      }
    }
  }
  if (want("deploy") && proj.mta && resolved.deploy.mtaSchemaVersion) items.push({ group: "deploy", file: proj.mta, keys: ["_schema-version"], expected: resolved.deploy.mtaSchemaVersion, kind: "mta" });
  if (want("deploy") && proj.mta && CDS_BUILD_LINE.test(read(proj.mta))) items.push({ group: "deploy", file: proj.mta, keys: ["before-all", "cds build"], expected: SAFE_CDS_BUILD, kind: "mtaBuild" });
  return items;
}

// `cds add mta` writes an npx-based cds build line. Through npx, npm installs a package when the project has no
// local @sap/cds-dk — and the npm package literally named "cds" is an unrelated project. `npm exec
// --no` runs the local bin or fails; it never downloads.
const SAFE_CDS_BUILD = "npm exec --no -- cds build";
const BARE_CDS_TASK = /"command"\s*:\s*"cds watch"/;
const CDS_BUILD_LINE = /^\s*-\s*(?:npx\s+(?:(?:-p|--package)[ =]@sap\/cds-dk(?:@\S+)?\s+)?(?:--yes\s+|-y\s+)?|npm exec --no -- )cds\s+build\b/m;
const NPX_CDS_BUILD = /^(\s*-\s*)npx\s+(?:(?:-p|--package)[ =]@sap\/cds-dk(?:@\S+)?\s+)?(?:--yes\s+|-y\s+)?cds(\s+build\b.*)$/gm;
function mtaBuildCommands(text) {
  return [...text.matchAll(/^\s*-\s*((?:npx|npm exec)[^\r\n]*\bcds\s+build\b[^\r\n]*)$/gm)].map((m) => m[1].trim());
}

function currentValue(item) {
  const text = read(item.file);
  switch (item.kind) {
    case "range": case "engines": { const d = JSON.parse(text.replace(/^\uFEFF/, "")); let v = d; for (const k of item.keys) v = v?.[k]; return v; }
    case "ui5": { const d = JSON.parse(text.replace(/^\uFEFF/, "")); return d["sap.ui5"]?.dependencies?.minUI5Version; }
    case "html": return findCdnUrls(text).map((u) => u.version);
    case "yamlTop": return yamlGetTop(text, item.keys[0])?.value;
    case "yamlFramework": return yamlGetFrameworkVersion(text);
    case "mta": { const g = yamlGetTop(text, "_schema-version"); return g ? "" + g.quote + g.value + g.quote : undefined; }
    case "mtaBuild": return mtaBuildCommands(text).join(" ; ");
    case "vscodeTask": return BARE_CDS_TASK.test(text) ? "cds watch (bare, no cwd)" : "npm run watch (cwd pinned)";
  }
}
function mtaEquivalent(cur, expected) {
  if (!cur) return false;
  const quoted = /^["'].*["']$/.test(cur), bare = cur.replace(/^["']|["']$/g, "");
  const parts = bare.split(".");
  if (parts.length === 2 && !quoted) return false;   // unquoted 3.3 is a YAML float, not a string
  const a = parseVersion(bare), b = parseVersion(expected);
  return !!a && !!b && cmp(a, b) === 0;
}

// ───────────────────────────────── check ──────────────────────────────────────────────────────
function installedVersion(dirs, name) {
  for (const d of dirs.filter(Boolean)) {
    const p = path.join(d, "node_modules", ...name.split("/"), "package.json");
    if (exists(p)) { try { return readJson(p).version; } catch { /* ignore */ } }
  }
  return null;
}
function ui5Verdict(v, resolved, policy) {
  if (v == null) return ["WARN", "no version (unversioned CDN URL — not reproducible)"];
  if (v === "{RECOMMENDED_UI5_VERSION}") return ["FAIL", "unresolved {RECOMMENDED_UI5_VERSION} placeholder — run apply"];
  if (Array.isArray(v)) return ["WARN", "array value — skipped"];
  const pv = parseVersion(v);
  if (!pv || !isExactVersion(v)) return ["FAIL", "not an exact version: " + v];
  const line = "" + pv[0] + "." + pv[1];
  if (line !== resolved.ui5.line) return ["FAIL", "line " + line + " ≠ stack ui5.line " + resolved.ui5.line];
  const patches = resolved.ui5.patches || [];
  if (patches.length && !patches.includes(v)) return ["FAIL", "" + v + " is not a published patch (CDN 404) — run apply"];
  if (policy === "minUI5" && resolved.ui5.minUI5Version === "" + line + ".0") return v === "" + line + ".0" ? ["PASS", ""] : ["PASS", "any patch of the line satisfies minUI5Version=line"];
  if (resolved.ui5.version && v === resolved.ui5.version) return ["PASS", ""];
  if (resolved.ui5.version && cmp(pv, parseVersion(resolved.ui5.version)) < 0) return ["WARN", "older patch — " + resolved.ui5.version + " available (run apply)"];
  return ["PASS", ""];
}

export function checkProject(proj, resolved, { scope = "all", strict = false, installed = true } = {}) {
  const rows = [];
  for (const it of planProject(proj, resolved, scope)) {
    const cur = currentValue(it);
    let status = "PASS", note = "";
    if (it.kind === "range" || it.kind === "engines") {
      if (cur === undefined) [status, note] = it.required ? ["FAIL", "missing (required)"] : ["PASS", ""];
      else if (typeof cur !== "string") [status, note] = ["WARN", "non-string value — skipped"];
      else if (NON_REGISTRY.test(cur)) [status, note] = ["WARN", "non-registry spec " + cur + " — not governed"];
      else if (cur === it.expected) [status, note] = ["PASS", ""];
      else if (isSubset(cur, it.expected)) [status, note] = strict ? ["FAIL", "narrower than stack (strict)"] : ["PASS", "narrower than " + it.expected + ", compatible"];
      else if (intersects(cur, it.expected)) [status, note] = strict ? ["FAIL", "overlaps but differs (strict)"] : ["WARN", "overlaps " + it.expected + " but is not contained — run apply"];
      else [status, note] = ["FAIL", "outside stack range " + it.expected];
      if (installed && it.kind === "range" && cur !== undefined && status !== "FAIL") {
        const v = installedVersion([it.installRoot, it.fallbackInstallRoot], it.pkg);
        if (v == null) { if (status === "PASS") [status, note] = ["WARN", (note ? note + "; " : "") + "not installed (npm install)"]; }
        else if (!satisfies(v, it.expected) || (typeof cur === "string" && !satisfies(v, cur))) [status, note] = ["FAIL", "installed " + v + " does not satisfy " + it.expected + " — run npm install"];
        else note = (note ? note + "; " : "") + "installed " + v;
      }
    } else if (it.kind === "ui5") [status, note] = ui5Verdict(cur, resolved, "minUI5");
    else if (it.kind === "html") {
      const verdicts = (cur || []).map((v) => ui5Verdict(v, resolved, "exact"));
      const worst = verdicts.find((x) => x[0] === "FAIL") || verdicts.find((x) => x[0] === "WARN") || ["PASS", ""];
      [status, note] = worst;
      rows.push(row(proj, it, [...new Set(cur)].join(", "), status, note));
      continue;
    } else if (it.kind === "yamlFramework") [status, note] = ui5Verdict(cur, resolved, "exact");
    else if (it.kind === "yamlTop") [status, note] = cur === it.expected ? ["PASS", ""] : ["FAIL", "" + cur + " ≠ " + it.expected];
    else if (it.kind === "mta") [status, note] = mtaEquivalent(cur, it.expected) ? ["PASS", ""] : ["FAIL", "" + (cur ?? "missing") + " — must be \"" + it.expected + "\" (quoted)"];
    else if (it.kind === "vscodeTask") [status, note] = /^cds watch/.test(cur) ? ["WARN", "VS Code task runs bare cds watch without cwd (hard rule 5) — run apply"] : ["PASS", ""];
    else if (it.kind === "mtaBuild") [status, note] = /\bnpx\b/.test(cur) ? ["WARN", "an npx-based build can download an unrelated npm package named \"cds\" — run apply (→ npm exec --no -- cds build)"] : ["PASS", ""];
    rows.push(row(proj, it, cur, status, note));
  }
  return { rows, fails: rows.filter((r) => r.status === "FAIL").length, warns: rows.filter((r) => r.status === "WARN").length };
}
function row(proj, it, cur, status, note) {
  return { group: it.group, file: rel(proj.root, it.file), key: it.keys.join("."), current: cur === undefined ? "—" : String(cur), expected: String(it.expected), status, note };
}

// ───────────────────────────────── apply ──────────────────────────────────────────────────────
export function reviewLockPath(dirs) {
  return dirs.map((d) => path.join(d, ".intent2code", "review.lock")).find(exists) || null;
}

export function applyProject(proj, resolved, { scope = "all", dryRun = false, keepCompatible = false, pluginRoot = null } = {}) {
  const lock = reviewLockPath([proj.root, process.cwd(), pluginRoot].filter(Boolean));
  if (lock) throw new StackError("review HARD STOP is active (" + lock + ") — run /modify first", EXIT.REFUSED);
  const items = planProject(proj, resolved, scope);
  const rows = [];
  const majorChanges = [];
  const docs = new Map();            // file → JsonDoc
  const texts = new Map();           // file → string (yaml / html)
  const getDoc = (f) => { if (!docs.has(f)) docs.set(f, new JsonDoc(read(f), rel(proj.root, f))); return docs.get(f); };
  const getText = (f) => (texts.has(f) ? texts.get(f) : read(f));

  for (const it of items) {
    let status = "ok", from;
    if (it.kind === "range" || it.kind === "engines") {
      const doc = getDoc(it.file);
      from = doc.get(it.keys);
      if (typeof from === "string" && NON_REGISTRY.test(from)) status = "skipped:non-registry";
      else if (keepCompatible && typeof from === "string" && from !== it.expected && isSubset(from, it.expected)) status = "skipped:compatible";
      else status = doc.set(it.keys, it.expected);
      if (status === "changed" && it.pkg && ["@sap/cds", "@sap/cds-dk"].includes(it.pkg)) {
        const a = parseVersion(String(from).replace(/^[\^~>=<\s]+/, "")), b = parseVersion(it.expected.replace(/^[\^~>=<\s]+/, ""));
        if (a && b && a[0] !== b[0]) majorChanges.push("" + it.pkg + " " + from + " → " + it.expected);
      }
    } else if (it.kind === "ui5") {
      if (!resolved.ui5.version) { rows.push(row(proj, it, "—", "skipped:ui5 unresolved", "")); continue; }
      const doc = getDoc(it.file);
      from = doc.get(it.keys);
      status = Array.isArray(from) ? "skipped:array" : doc.set(it.keys, it.expected);
    } else if (it.kind === "html") {
      if (!resolved.ui5.version) continue;
      const r = rewriteBootstrapHtml(getText(it.file), resolved.ui5.cdn, resolved.ui5.version);
      from = [...new Set(findCdnUrls(getText(it.file)).map((u) => u.version))].join(", ");
      if (r.changes.length) { texts.set(it.file, r.text); status = "changed"; }
    } else if (it.kind === "yamlTop") {
      const r = yamlSetTop(getText(it.file), it.keys[0], it.expected); from = r.from;
      if (r.status === "changed") { texts.set(it.file, r.text); status = "changed"; }
    } else if (it.kind === "yamlFramework") {
      if (!resolved.ui5.version) continue;
      const r = yamlSetFrameworkVersion(getText(it.file), resolved.ui5.version); from = r.from;
      if (r.status === "changed") { texts.set(it.file, r.text); status = "changed"; }
    } else if (it.kind === "mta") {
      const cur = currentValue(it); from = cur;
      if (!mtaEquivalent(cur, it.expected)) { const r = yamlSetTop(getText(it.file), "_schema-version", it.expected, '"'); texts.set(it.file, r.text); status = "changed"; }
    } else if (it.kind === "vscodeTask") {
      // fixed, value-only rewrite of the task cds init generated — no other key is touched
      const t = getText(it.file);
      from = "cds watch (bare, no cwd)";
      const next = t.replace(BARE_CDS_TASK, '"command": "npm run watch",\n      "options": { "cwd": "${workspaceFolder}" }');
      if (next !== t) { texts.set(it.file, next); status = "changed"; }
    } else if (it.kind === "mtaBuild") {
      const t = getText(it.file);
      from = mtaBuildCommands(t).join(" ; ");
      const next = t.replace(NPX_CDS_BUILD, (all, pre, rest) => "" + pre + SAFE_CDS_BUILD.replace(/ build$/, "") + rest);
      if (next !== t) { texts.set(it.file, next); status = "changed"; }
    }
    rows.push(row(proj, it, from, status, ""));
  }

  const written = [];
  if (!dryRun) {
    for (const [f, doc] of docs) if (doc.changed) { fs.writeFileSync(f, doc.toString()); written.push(rel(proj.root, f)); }
    for (const [f, t] of texts) if (t !== read(f)) { fs.writeFileSync(f, t); written.push(rel(proj.root, f)); }
    if (written.length) {
      const recDir = path.join(proj.root, ".intent2code");
      fs.mkdirSync(recDir, { recursive: true });
      fs.writeFileSync(path.join(recDir, "stack.applied.json"), JSON.stringify({ pluginVersion: resolved.plugin.version, appliedAt: new Date().toISOString(),
        cdsMajor: resolved.cap.cdsMajor, ui5: { line: resolved.ui5.line, version: resolved.ui5.version }, files: written }, null, 2) + "\n");
    }
  } else for (const [, doc] of docs) doc.toString(); // still run the guard in dry-run

  const pkgTouched = rows.some((r) => ["changed", "added"].includes(r.status) && r.file.endsWith("package.json"));
  const next = [];
  if (majorChanges.length) next.push("CDS major changed (" + majorChanges.join("; ") + "): delete node_modules/, app/*/node_modules/ and gen/ first (P-04).");
  if (pkgTouched) {
    next.push("npm install            (or: npm --prefix \"" + proj.root + "\" install)");
    const ws = proj.rootPkg.workspaces;
    for (const m of proj.modules) if (m.ownLock && !(Array.isArray(ws) && ws.length)) next.push("npm --prefix \"" + m.dir + "\" install   (module has its own lockfile and the root has no workspaces)");
  }
  return { rows, written, next, changed: rows.filter((r) => ["changed", "added"].includes(r.status)).length };
}

// ───────────────────────────────── snapshot ───────────────────────────────────────────────────
/**
 * Keep the untouched generator manifest: <module>/webapp/manifest.json →
 * <module>/.intent2code/manifest.generated.json (sanity static check 14 compares against it). The
 * by-hand fallback for `patch_manifest { mode: "snapshot" }` when the MCP server is unavailable —
 * one pre-approved command instead of mkdir + cp. Never overwrites an existing snapshot without
 * `force` (the snapshot must stay the generator's output, not a later edited manifest).
 */
export function snapshotManifest(moduleDir, { force = false } = {}) {
  const dir = path.resolve(moduleDir);
  const src = path.join(dir, "webapp", "manifest.json");
  if (!exists(src)) throw new StackError("" + dir + ": no webapp/manifest.json — pass the UI module folder (e.g. <app>/app/<module>)");
  JSON.parse(read(src).replace(/^\uFEFF/, ""));   // refuse to snapshot a broken manifest
  const dst = path.join(dir, ".intent2code", "manifest.generated.json");
  if (exists(dst) && !force) return { src, dst, status: "kept (exists — pass --force to replace)" };
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return { src, dst, status: "written" };
}

// ───────────────────────────────── clean ──────────────────────────────────────────────────────
/**
 * Guarded delete of gen/ and of a half-generated UI module — the only delete the agents use.
 * Deletes only fixed folders inside <project> (gen/, optionally node_modules/ + app/* /node_modules/,
 * or exactly one app/<module>), never follows a path outside the project, refuses on folders that
 * are not CAP / UI5 projects and while a review HARD STOP is active.
 */
export function cleanProject(projectDir, { nodeModules = false, generated = null, dryRun = false, pluginRoot = null } = {}) {
  const root = path.resolve(projectDir);
  const pkgFile = path.join(root, "package.json");
  if (!exists(pkgFile)) throw new StackError("" + root + ": no package.json — refusing to clean a folder that is not a project root");
  const deps = Object.assign({}, ...SECTIONS.map((s) => readJson(pkgFile)[s] || {}));
  const isProject = deps["@sap/cds"] || deps["@sap/cds-dk"] || exists(path.join(root, "webapp", "manifest.json")) || exists(path.join(root, "ui5.yaml"));
  if (!isProject) throw new StackError("" + root + ": not a CAP or UI5 project (no @sap/cds dependency, no webapp/manifest.json) — refusing to clean");
  const lock = reviewLockPath([root, pluginRoot].filter(Boolean));
  if (lock) throw new StackError("review HARD STOP is active (" + lock + ") — run /modify first", EXIT.REFUSED);

  const targets = [];
  if (generated !== null && generated !== undefined) {
    const name = String(generated).replace(/^app[\\/]/, "").replace(/[\\/]+$/, "");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) throw new StackError("--generated \"" + generated + "\": must be one folder name under app/ (letters, digits, . _ -)");
    targets.push(path.join(root, "app", name));
  } else {
    targets.push(path.join(root, "gen"));
    if (nodeModules) {
      targets.push(path.join(root, "node_modules"));
      const app = path.join(root, "app");
      if (exists(app)) for (const e of fs.readdirSync(app, { withFileTypes: true })) if (e.isDirectory()) targets.push(path.join(app, e.name, "node_modules"));
    }
  }
  const rows = [];
  for (const t of targets) {
    const r = path.relative(root, t);
    if (!r || r.startsWith("..") || path.isAbsolute(r)) throw new StackError("refusing to delete " + t + ": not inside " + root);
    let st;
    try { st = fs.lstatSync(t); } catch { rows.push({ path: rel(root, t), status: "absent" }); continue; }
    if (st.isSymbolicLink() || !st.isDirectory()) { rows.push({ path: rel(root, t), status: "skipped (not a real folder)" }); continue; }
    if (!dryRun) fs.rmSync(t, { recursive: true, maxRetries: 3 });
    rows.push({ path: rel(root, t), status: dryRun ? "would delete" : "deleted" });
  }
  return { root, rows };
}
