#!/usr/bin/env node
/**
 * ui-health-checks.mjs — the STATIC CHECKS 1–22 of a generated CAP + Fiori app (no server needed).
 *
 * Runs every scripted static check (application-sanity-check SKILL.md lists static checks 1–35;
 * 23–35 are done by the agent) and prints ONE table, always in number order. Agents paste the table
 * verbatim and fix only what it reports — never re-define, renumber or skip a check (that is how
 * broken apps were once reported "PASS"). The runtime checks 1–10 are smoke-check.mjs --render.
 *
 * Every check asks CAP itself (cds env / cds compile) instead of grepping config files: a
 * misplaced block can contain the right word and still be ignored by CAP.
 *
 * Usage:   node <this-skill>/scripts/ui-health-checks.mjs <cap-project-root>
 * Exit:    0 = no FAIL (WARN allowed) · 1 = at least one FAIL · 2 = usage / setup error
 * Needs:   node_modules installed in <cap-project-root> — the project's own @sap/cds-dk is run
 *          directly with node (no npx, no shell, nothing is ever downloaded).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

// Exact Windows spelling (drive letter + folder case): CAP compares paths as strings, and a "c:\…" root
// (how VS Code passes the workspace) makes it see the same files twice — see smoke-check.mjs.
const root = (() => { const p = path.resolve(process.argv[2] || "."); try { return fs.realpathSync.native(p); } catch { return p; } })();
if (!fs.existsSync(path.join(root, "package.json"))) {
  console.error("usage: node ui-health-checks.mjs <cap-project-root>  (no package.json in " + root + ")");
  process.exit(2);
}

const results = [];
const add = (id, title, status, detail, fix = "") => results.push({ id, title, status, detail, fix });
// Static check numbers — fixed, documented in application-sanity-check SKILL.md, printed in this order.
const CHECK = {
  cdsLocal: 1, cdsSingleRoot: 2, watchScript: 3, noBandAid: 4, vscodeTask: 5, stackVersions: 6,
  middlewares: 7, noAppreload: 8, watchOpens: 9, devAuth: 10, namespace: 11, serviceUri: 12,
  destinationUri: 13, generatorSnapshot: 14, i18nKeys: 15, filterLabels: 16, initialLoad: 17,
  bootstrapUrl: 18, formContent: 19, buildModel: 20, annotationFiles: 21, usedAnnotations: 22
};
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const exists = (f) => fs.existsSync(f);

/** The project's local cds CLI (@sap/cds-dk/bin/cds.js), or null when it is not installed. */
const cdsBin = (() => {
  try {
    const req = createRequire(path.join(root, "package.json"));
    const pkgFile = req.resolve("@sap/cds-dk/package.json");
    const bin = JSON.parse(fs.readFileSync(pkgFile, "utf8")).bin;
    return path.join(path.dirname(pkgFile), typeof bin === "string" ? bin : bin.cds);
  } catch { return null; }
})();
// CAP project → every check; standalone UI5 / Fiori app (freestyle-ui5, external-fe) → the UI checks,
// with the CAP-only rows reported as SKIP.
const rootPkg = readJson(path.join(root, "package.json"));
const CAP = !!{ ...rootPkg.dependencies, ...rootPkg.devDependencies }["@sap/cds"] || exists(path.join(root, "srv")) || exists(path.join(root, "db"));
if (!cdsBin && CAP) {
  console.error("ui-health-checks: @sap/cds-dk is not installed in " + root + " — run npm install there first (it is a devDependency pinned by stack.json).");
  process.exit(2);
}

/** Run a cds CLI command (argument array) in the project root; returns stdout ("" on failure). */
function cds(args) {
  try {
    return execFileSync(process.execPath, [cdsBin, ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 300000, windowsHide: true }).trim();
  } catch (e) {
    return (e.stdout || "").trim();
  }
}

/** Collect the files below dir, skipping dependency/build folders. */
function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "gen", ".git", "dist", "resources"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

const files = walk(root);
const manifests = files.filter((f) => /[\\/]webapp[\\/]manifest\.json$/.test(f));
const cdsFiles = files.filter((f) => f.endsWith(".cds"));
const rel = (f) => path.relative(root, f).replace(/\\/g, "/");

// ── Static 1–5 · Toolchain & resolution integrity (no @sap/cds dual-load) ──────────────────────
// @sap/cds-dk bundles its own @sap/cds (node_modules/@sap/cds-dk/node_modules/@sap/cds): always
// present, harmless, never reported. gen/ carries its own copy too and is excluded.
if (!CAP) for (const id of [1, 2, 3, 4, 5]) add(id, ["CAP tools installed locally, same major", "Only one @sap/cds copy", "Plain watch script", "No exit_on_multi_install, no @sap/cds overrides", "VS Code task runs npm run watch"][id - 1], "SKIP", "standalone UI app — no CAP toolchain");
else {
  const pkg = rootPkg;
  const ver = (p) => { try { return readJson(p).version; } catch { return null; } };
  const cdsV = ver(path.join(root, "node_modules", "@sap", "cds", "package.json"));
  const dkV = ver(path.join(root, "node_modules", "@sap", "cds-dk", "package.json"));
  const major = (v) => String(v).split(".")[0];
  add(CHECK.cdsLocal, "CAP tools installed locally, same major", cdsV && dkV && major(cdsV) === major(dkV) ? "PASS" : "FAIL",
    "@sap/cds " + (cdsV || "missing") + " · @sap/cds-dk " + (dkV || "missing"),
    "node .claude/skills/sap-conventions/scripts/stack.mjs apply <app> --scope cap, then npm install (major mismatch: also stack.mjs clean <app> --node-modules first)");
  const copies = [];
  const scan = (nm) => {
    if (!exists(nm)) return;
    for (const e of fs.readdirSync(nm, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const pkgs = e.name.startsWith("@") ? fs.readdirSync(path.join(nm, e.name), { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => path.join(nm, e.name, x.name)) : [path.join(nm, e.name)];
      for (const p of pkgs) {
        if (/[\\/]@sap[\\/]cds-dk$/.test(p)) continue;                       // bundled copy — harmless
        const nested = path.join(p, "node_modules", "@sap", "cds", "package.json");
        if (exists(nested)) copies.push(rel(path.dirname(nested)));
      }
    }
  };
  scan(path.join(root, "node_modules"));
  if (exists(path.join(root, "app"))) for (const e of fs.readdirSync(path.join(root, "app"), { withFileTypes: true })) {
    const own = path.join(root, "app", e.name, "node_modules", "@sap", "cds", "package.json");
    if (e.isDirectory() && exists(own)) copies.push(rel(path.dirname(own)));
  }
  add(CHECK.cdsSingleRoot, "Only one @sap/cds copy", copies.length ? "FAIL" : "PASS", copies.length ? "extra copies: " + copies.join(", ") : "only the project root copy (+ the bundled cds-dk copy)",
    copies.length ? "node .claude/skills/sap-conventions/scripts/stack.mjs clean <app> --node-modules, then npm install from the CAP root" : "");
  const watch = pkg.scripts?.watch;
  add(CHECK.watchScript, "Plain watch script", typeof watch === "string" && /^cds watch\b/.test(watch) ? "PASS" : "FAIL", "scripts.watch = " + (watch === undefined ? "missing" : JSON.stringify(watch)),
    "add \"watch\": \"cds watch\" to the root package.json scripts (npm pkg set scripts.watch=\"cds watch\")");
  const cdsrc = exists(path.join(root, ".cdsrc.json")) ? fs.readFileSync(path.join(root, ".cdsrc.json"), "utf8") : "";
  const bandAid = /exit_on_multi_install/.test(cdsrc) || /exit_on_multi_install/.test(JSON.stringify(pkg.cds || {}));
  const overrides = pkg.overrides && /@sap\/cds"/.test(JSON.stringify(pkg.overrides));
  add(CHECK.noBandAid, "No exit_on_multi_install, no @sap/cds overrides", bandAid ? "FAIL" : overrides ? "WARN" : "PASS",
    bandAid ? "server.exit_on_multi_install is set — it hides the dual-load fault" : overrides ? "overrides targets @sap/cds (a no-op against bundleDependencies)" : "none",
    bandAid || overrides ? "remove the key / the overrides entry (CLAUDE.md hard rule 5)" : "");
  const tasks = path.join(root, ".vscode", "tasks.json");
  const bare = exists(tasks) && /"command"\s*:\s*"cds watch"/.test(fs.readFileSync(tasks, "utf8"));
  add(CHECK.vscodeTask, "VS Code task runs npm run watch", !exists(tasks) ? "SKIP" : bare ? "WARN" : "PASS", !exists(tasks) ? "no .vscode/tasks.json" : bare ? "bare `cds watch` task (generated by cds init)" : "ok",
    bare ? "node .claude/skills/sap-conventions/scripts/stack.mjs apply <app> --scope cap (never edit .vscode/* with Edit/Write — protected path)" : "");
}

// ── Static 10 · Effective dev auth must be dummy ───────────────────────────────────────────────────
if (!CAP) add(CHECK.devAuth, "Dev auth is dummy (effective)", "SKIP", "standalone UI app — authentication belongs to the backend / destination");
else {
  const kind = cds(["env", "requires.auth.kind", "--profile", "development"]).split(/\r?\n/).pop();
  const cdsrc = path.join(root, ".cdsrc.json");
  const cdsrcHasAuth = exists(cdsrc) && /"auth"\s*:/.test(fs.readFileSync(cdsrc, "utf8"));
  if (kind === "dummy") {
    add(CHECK.devAuth, "Dev auth is dummy (effective)", cdsrcHasAuth ? "WARN" : "PASS",
      "cds env → " + kind + (cdsrcHasAuth ? " · .cdsrc.json also defines auth (second source — move it to package.json)" : ""),
      cdsrcHasAuth ? "Delete the auth block from .cdsrc.json; keep the canonical block in package.json (bootstrapping.md P-03)." : "");
  } else {
    add(CHECK.devAuth, "Dev auth is dummy (effective)", "FAIL",
      "cds env → " + (kind || "(no output)") + " — browser OData calls get 401 → blank page" + (cdsrcHasAuth ? " · .cdsrc.json defines auth" : ""),
      "Apply the canonical auth block from sap-conventions/references/bootstrapping.md P-03 to package.json cds.requires; remove every other auth block (.cdsrc.json, auth.[development] variants).");
  }
}

// ── Static 12 / 13 · Manifest dataSource URI vs the path CAP actually serves ─────────────────────
let served = [];
let services = [];
if (CAP) try {
  services = JSON.parse(cds(["compile", "srv", "--to", "serviceinfo"]) || "[]");
  served = services.map((s) => "/" + String(s.urlPath).replace(/^\//, "").replace(/\/?$/, "/"));
} catch { /* reported below */ }
if (!manifests.length) {
  add(CHECK.serviceUri, "Manifest URI matches served CAP path", "SKIP", "no app/*/webapp/manifest.json");
  add(CHECK.destinationUri, "Destination-prefixed URI has no leading /", "SKIP", "no manifest");
} else {
  for (const mf of manifests) {
    const m = readJson(mf);
    const uri = m["sap.app"]?.dataSources?.mainService?.uri;
    const norm = uri ? "/" + uri.replace(/^\//, "") : "";
    // The SOURCE manifest of a CAP app keeps the absolute "/odata/…" the generator writes. Any relative form
    // (bare odata/v4/<svc>/ or destination-prefixed <dest>/odata/…) is requested under the app path
    // (/<app>/…), which CAP does not serve → 404 → blank page. The deployed app gets the relative form from
    // the relative-odata-uri build task (deploy-config.mjs) — in the built manifest only.
    const firstSeg = (uri || "").replace(/^\//, "").split("/")[0];
    const prefixed = !!uri && firstSeg && firstSeg !== "odata" && !/^https?:/.test(uri);
    const relativeCap = !!uri && !uri.startsWith("/") && !/^https?:/.test(uri);
    const ok = !!uri && !relativeCap && served.some((p) => norm === p);
    if (!CAP) add(CHECK.serviceUri, "Manifest URI matches served CAP path", "SKIP", "" + rel(mf) + ": standalone UI app — uri=" + (uri ?? "(none)") + " is served by the mock / destination (runtime check 2 probes it)");
    else add(CHECK.serviceUri, "Manifest URI matches served CAP path", !served.length ? "FAIL" : ok ? "PASS" : "FAIL",
      "" + rel(mf) + ": uri=" + (uri ?? "(missing)") + " · served=" + (served.join(", ") || "(cds compile failed — model does not compile?)") +
        (relativeCap ? " — relative URI: the browser requests /<app>/" + uri + ", which CAP does not serve → blank page" : ""),
      ok ? "" : relativeCap
        ? "Set the source URI back to the absolute served path (" + (served[0] || "/odata/v4/<service>/") + ") exactly as the generator wrote it. Never make it relative for deployment: the relative-odata-uri build task (deploy-config.mjs) writes the relative form into the built app only."
        : "Set sap.app.dataSources.mainService.uri to the served path (configure_service … force:true, or a single-key Edit). Never derive it by lowercasing the service name.");
    if (CAP) add(CHECK.destinationUri, "Destination-prefixed URI has no leading /", prefixed ? "FAIL" : "SKIP",
      "" + rel(mf) + ": " + (prefixed ? "prefix \"" + firstSeg + "\" in a CAP source manifest (blank page locally — static check 12)" : "CAP app: no destination prefix (the built app gets the relative form from the relative-odata-uri build task)"),
      prefixed ? "Use the absolute served path in the source manifest; deploy-config.mjs makes the deployed URI relative." : "");
    else add(CHECK.destinationUri, "Destination-prefixed URI has no leading /", !prefixed ? "SKIP" : uri.startsWith("/") ? "FAIL" : "PASS",
      "" + rel(mf) + ": " + (prefixed ? "prefix \"" + firstSeg + "\"" : "no destination prefix"),
      prefixed && uri.startsWith("/") ? "Strip the leading / (Workzone mounts apps under a GUID path)." : "");
  }
}

// ── Static 14 · Generator snapshot guard ────────────────────────────────────────────────────────────
const facts = (m) => {
  const f = [];
  for (const [n, s] of Object.entries(m?.["sap.app"]?.dataSources || {})) {
    f.push("ds:" + n);
    if (s?.uri) f.push("uri:" + n + "=" + s.uri);   // exact value — a removed leading "/" is a real change (blank page)
    for (const a of s?.settings?.annotations || []) f.push("annotation:" + n + "/" + a);
    if (s?.settings?.localUri) f.push("localUri:" + n);
  }
  for (const [n, x] of Object.entries(m?.["sap.ui5"]?.models || {})) if (x?.dataSource) f.push("model:\"" + n + "\"=" + x.dataSource);
  return f;
};
if (!manifests.length) add(CHECK.generatorSnapshot, "No generator metadata lost (snapshot)", "SKIP", "no webapp/manifest.json");
for (const mf of manifests) {
  const snap = path.join(path.dirname(path.dirname(mf)), ".intent2code", "manifest.generated.json");
  if (!exists(snap)) { add(CHECK.generatorSnapshot, "No generator metadata lost (snapshot)", "SKIP", "" + rel(mf) + ": no .intent2code/manifest.generated.json"); continue; }
  const now = new Set(facts(readJson(mf)));
  const missing = facts(readJson(snap)).filter((x) => !now.has(x));
  add(CHECK.generatorSnapshot, "No generator metadata lost (snapshot)", missing.length ? "FAIL" : "PASS",
    missing.length ? "" + rel(mf) + ": missing " + missing.join(", ") : "" + rel(mf) + ": all generator dataSources/annotations/models present",
    missing.length ? "Restore exactly the missing entries from the snapshot with single-key Edits; never copy the snapshot over the manifest." : "");
}

// ── Static 15 · Every {i18n>key} used in CDS resolves in a CAP-side bundle ─────────────────────────
// CAP resolves {i18n>…} from i18n folders (_i18n, i18n, assets/i18n) next to the .cds file or in
// any parent up to the project root — NOT from app/*/webapp/i18n (that bundle is UI5-only).
{
  const folders = ["_i18n", "i18n", "assets/i18n"];
  const bundleKeys = (dir) => {
    const keys = new Set();
    for (const fd of folders) {
      const f = path.join(dir, fd, "i18n.properties");
      if (exists(f)) for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
        const mm = line.match(/^\s*([^#!=:\s][^=:\s]*)\s*[=:]/);
        if (mm) keys.add(mm[1]);
      }
    }
    return keys;
  };
  const unresolved = [];
  let used = 0;
  for (const f of cdsFiles) {
    const keys = [...fs.readFileSync(f, "utf8").matchAll(/\{i18n>([A-Za-z0-9_.-]+)\}/g)].map((x) => x[1]);
    if (!keys.length) continue;
    used += keys.length;
    const available = new Set();
    for (let d = path.dirname(f); ; d = path.dirname(d)) {
      for (const k of bundleKeys(d)) available.add(k);
      if (path.resolve(d) === root || path.dirname(d) === d) break;
    }
    for (const k of new Set(keys)) if (!available.has(k)) unresolved.push("" + k + " (" + rel(f) + ")");
  }
  add(CHECK.i18nKeys, "CDS {i18n>key} labels resolve (CAP bundle)", !used ? "SKIP" : unresolved.length ? "FAIL" : "PASS",
    !used ? "no {i18n>…} keys in .cds files" : unresolved.length ? "unresolved → UI shows raw keys: " + unresolved.slice(0, 12).join(", ") + (unresolved.length > 12 ? " …" : "") : "" + used + " key uses, all defined",
    unresolved.length ? "Add the keys to <cap-root>/_i18n/i18n.properties (CAP never reads app/*/webapp/i18n). Then restart cds watch (it does not reload on .properties changes)." : "");
}

// ── Static 16 · Every filter-bar field (UI.SelectionFields) has a property label ───────────────────
{
  const missing = [];
  let checked = 0;
  for (const s of services) {
    const edmx = cds(["compile", "*", "--to", "edmx", "--service", s.name]);
    if (!edmx) continue;
    const labelled = new Set([...edmx.matchAll(/<Annotations Target="([^"]+)">([\s\S]*?)<\/Annotations>/g)]
      .filter((a) => /Term="Common\.Label"/.test(a[2])).map((a) => a[1]));
    for (const a of edmx.matchAll(/<Annotations Target="([^"/]+)">([\s\S]*?)<\/Annotations>/g)) {
      const sel = a[2].match(/Term="UI\.SelectionFields">([\s\S]*?)<\/Annotation>/);
      if (!sel) continue;
      for (const p of sel[1].matchAll(/<PropertyPath>([^<]+)<\/PropertyPath>/g)) {
        checked++;
        if (!labelled.has("" + a[1] + "/" + p[1])) missing.push("" + a[1].split(".").pop() + "." + p[1]);
      }
    }
  }
  add(CHECK.filterLabels, "Filter-bar fields have property labels", !checked ? "SKIP" : missing.length ? "FAIL" : "PASS",
    !checked ? "no UI.SelectionFields" : missing.length ? "filter shows raw property name: " + missing.join(", ") : "" + checked + " filter fields labelled",
    missing.length ? "Annotate each property: `<prop> @title: '{i18n>key}'` (or @Common.Label) in the annotations file; LineItem labels do NOT apply to the filter bar." : "");
}

// ── Static 17 · List Report loads data on open ──────────────────────────────────────────────────────
let listReports = 0;
for (const mf of manifests) {
  const targets = readJson(mf)["sap.ui5"]?.routing?.targets || {};
  for (const [name, t] of Object.entries(targets)) {
    if (!/ListReport|AnalyticalListPage/.test(t?.name || "")) continue;
    listReports++;
    const il = t?.options?.settings?.initialLoad;
    add(CHECK.initialLoad, "List Report loads data on open", il === "Enabled" ? "PASS" : "WARN",
      "" + rel(mf) + " → " + name + ": initialLoad=" + (il ?? "(not set → empty table until 'Go')"),
      il === "Enabled" ? "" : "Set options.settings.initialLoad: \"Enabled\" when the FD lists all records and the default dataset is small; otherwise record why it stays off (TDD).");
  }
}
if (!listReports) add(CHECK.initialLoad, "List Report loads data on open", "SKIP", "no List Report / ALP target");

// ── Static 7 · UI5 tooling middlewares in ui5.yaml are installed (freestyle / TypeScript apps) ─────
// cds-plugin-ui5 serves each app/* module through its own ui5.yaml. A middleware that cannot be
// resolved from the app folder (e.g. ui5-tooling-transpile when the generator added no root
// "workspaces") means Component.ts is never transpiled → Component.js 404 → blank page.
{
  const MIDDLEWARE_PKG = {
    "ui5-tooling-transpile-middleware": "ui5-tooling-transpile",
    "fiori-tools-proxy": "@sap/ux-ui5-tooling",
    "fiori-tools-appreload": "@sap/ux-ui5-tooling",
    "fiori-tools-preview": "@sap/ux-ui5-tooling",
    "fiori-tools-servestatic": "@sap/ux-ui5-tooling",
    "sap-fe-mockserver": "@sap-ux/ui5-middleware-fe-mockserver"
  };
  const yamls = files.filter((f) => /^(app\/[^/]+\/)?ui5\.yaml$/.test(rel(f)));   // CAP app/* modules or a standalone app root
  if (!yamls.length) add(CHECK.middlewares, "UI5 tooling and app dependencies installed", "SKIP", "no ui5.yaml");
  /** pkg installed in appDir or a parent node_modules up to the project root (npm workspaces hoist to the root) */
  const installedFrom = (appDir, pkg) => {
    for (let d = appDir; ; d = path.dirname(d)) {
      if (exists(path.join(d, "node_modules", ...pkg.split("/"), "package.json"))) return true;
      if (path.resolve(d) === root || path.dirname(d) === d) return false;
    }
  };
  for (const y of yamls) {
    const appDir = path.dirname(y);
    const block = (fs.readFileSync(y, "utf8").split(/^customMiddleware:|^\s+customMiddleware:/m)[1] || "").split(/^\S/m)[0];
    const names = [...block.matchAll(/^\s*-\s*name:\s*([\w@/.-]+)/gm)].map((m) => m[1]);
    const missing = [...new Set(names)].filter((n) => !installedFrom(appDir, MIDDLEWARE_PKG[n] || n)).map((n) => "" + n + " (" + (MIDDLEWARE_PKG[n] || n) + ")");
    // The UI5 tooling resolves EVERY package declared in the module's package.json (to find extensions):
    // one declared but not installed — e.g. ui5-task-zipper added by `cds add mta` / deploy config without a
    // following npm install — stops the dev server ("Unable to locate module … via resolve logic").
    let declared = [];
    try { const pj = readJson(path.join(appDir, "package.json")); declared = Object.keys({ ...pj.dependencies, ...pj.devDependencies }); } catch { /* no package.json */ }
    const notInstalled = declared.filter((pkg) => !installedFrom(appDir, pkg));
    const isTs = exists(path.join(appDir, "webapp", "Component.ts"));
    const tsProblem = isTs && !names.includes("ui5-tooling-transpile-middleware");
    add(CHECK.middlewares, "UI5 tooling and app dependencies installed", missing.length || notInstalled.length || tsProblem ? "FAIL" : names.length || declared.length ? "PASS" : "SKIP",
      "" + rel(y) + ": " + (missing.length ? "not installed → app not served/transpiled (blank page): " + missing.join(", ")
        : notInstalled.length ? "declared in " + rel(path.join(appDir, "package.json")) + " but not installed → the dev server does not start: " + notInstalled.join(", ")
        : tsProblem ? "Component.ts present but no ui5-tooling-transpile-middleware → .ts never transpiled (blank page)"
        : "" + names.length + " middleware(s) and " + declared.length + " declared package(s) resolvable" + (isTs ? " · TypeScript transpile configured" : "")),
      missing.length || notInstalled.length ? "Add \"workspaces\": [\"app/*\"] to the root package.json and run npm install at the CAP root (installs every app's devDependencies in one step)."
        : tsProblem ? "Add ui5-tooling-transpile-middleware to the app's ui5.yaml and ui5-tooling-transpile to its devDependencies (the generator does this when enableTypeScript is true)." : "");
  }
}

// ── Static 18 · UI5 bootstrap URL exists on the CDN ─────────────────────────────────────────────────
// A guessed patch version (e.g. 1.136.1) 404s on both SAP CDNs → sap-ui-core.js never loads → blank. // stack-ignore
{
  const htmls = files.filter((f) => /^(app\/[^/]+\/)?webapp\/index\.html$/.test(rel(f)));
  if (!htmls.length) add(CHECK.bootstrapUrl, "UI5 bootstrap URL exists", "SKIP", "no webapp/index.html");
  for (const h of htmls) {
    const src = (fs.readFileSync(h, "utf8").match(/id=["']sap-ui-bootstrap["'][\s\S]*?src=["']([^"']+)["']|src=["']([^"']*sap-ui-core\.js)["']/) || []).slice(1).find(Boolean);
    if (!src) { add(CHECK.bootstrapUrl, "UI5 bootstrap URL exists", "WARN", "" + rel(h) + ": no sap-ui-core.js bootstrap found"); continue; }
    if (!/^https?:/.test(src)) { add(CHECK.bootstrapUrl, "UI5 bootstrap URL exists", "SKIP", "" + rel(h) + ": relative bootstrap " + src + " (served by UI5 tooling)"); continue; }
    // Only SAP's UI5 CDNs are ever contacted — a bootstrap pointing anywhere else is a finding, not a fetch.
    let host = "";
    try { const u = new URL(src); host = u.protocol === "https:" ? u.hostname.toLowerCase() : ""; } catch { /* reported below */ }
    if (!["sapui5.hana.ondemand.com", "ui5.sap.com"].includes(host)) {
      add(CHECK.bootstrapUrl, "UI5 bootstrap URL exists", "FAIL", "" + rel(h) + ": " + src + " is not an https URL on an SAP UI5 CDN (sapui5.hana.ondemand.com, ui5.sap.com)", "Bootstrap UI5 from the SAP CDN set by stack.json — node <stack.mjs> apply <app>.");
      continue;
    }
    let code = 0;
    try { code = (await fetch(src, { method: "HEAD", signal: AbortSignal.timeout(20000) })).status; } catch (e) { code = -1; }
    add(CHECK.bootstrapUrl, "UI5 bootstrap URL exists", code === 200 ? "PASS" : code === -1 ? "WARN" : "FAIL",
      "" + rel(h) + ": " + src + " → " + (code === -1 ? "network unreachable (not verified)" : code),
      code === 200 || code === -1 ? "" : "Use a UI5 version that exists on the CDN (resolve it with ui5_get_version_info, or read https://sapui5.hana.ondemand.com/resources/sap-ui-version.json) — never guess a patch number.");
  }
}

// ── Static 19 · Form + ColumnLayout only contains valid form fields ────────────────────────────────
// sap.ui.layout.form ColumnLayout throws "Element sap.m.HBox … is not a valid Form content" at
// runtime and the whole page (route) fails to render. Value help belongs on the Input itself.
{
  const xmls = files.filter((f) => /[\\/]webapp[\\/].*\.(view|fragment)\.xml$/.test(f));
  const bad = [];
  for (const x of xmls) {
    const src = fs.readFileSync(x, "utf8");
    for (const fieldsBlock of src.matchAll(/<(?:\w+:)?fields>([\s\S]*?)<\/(?:\w+:)?fields>/g)) {
      const m = fieldsBlock[1].match(/<(?:\w+:)?(HBox|VBox|FlexBox|HorizontalLayout|VerticalLayout|Toolbar|Panel|Table)\b/);
      if (m) bad.push("" + rel(x) + ": <" + m[1] + "> inside <fields>");
    }
  }
  add(CHECK.formContent, "Form fields are valid form content", !xmls.length ? "SKIP" : bad.length ? "FAIL" : "PASS",
    !xmls.length ? "no XML views" : bad.length ? "" + bad.join(", ") + " → page crashes with \"not a valid Form content\"" : "" + xmls.length + " view/fragment file(s) clean",
    bad.length ? "Put one form control per field (Input, Text, Select, ComboBox, DatePicker, StepInput, ObjectStatus…). For a value help use <Input showValueHelp=\"true\" valueHelpRequest=\".onValueHelp\"/> instead of an Input/Text + Button in an HBox." : "");
}

// ── Static 9 · Watch script opens the cds-plugin-ui5 mount path ──────────────────────────────────
// cds-plugin-ui5 mounts each app at /<ui5.yaml metadata.name>/; /<module>/webapp/index.html is CAP's
// raw static folder (TypeScript not transpiled → Component.js 404 → blank page).
{
  const pkg = readJson(path.join(root, "package.json"));
  const scripts = pkg.scripts || {};
  const yamls = files.filter((f) => /[\\/]app[\\/][^\\/]+[\\/]ui5\.yaml$/.test(f));
  if (!yamls.length) add(CHECK.watchOpens, "Watch script opens the served app URL", "SKIP", "no app/*/ui5.yaml (no UI module served by cds-plugin-ui5)");
  for (const y of yamls) {
    const name = (fs.readFileSync(y, "utf8").match(/^metadata:\s*\n\s+name:\s*([\w.-]+)/m) || [])[1];
    if (!name) continue;
    const opens = Object.entries(scripts).filter(([, v]) => /cds watch/.test(v) && /--open/.test(v));
    const ok = opens.some(([, v]) => v.includes("--open " + name + "/index.html"));
    add(CHECK.watchOpens, "Watch script opens the served app URL", ok ? "PASS" : "WARN",
      ok ? "" + opens.find(([, v]) => v.includes(name))[0] + " → /" + name + "/index.html" : "no \"cds watch --open " + name + "/index.html\" script (served URL: http://localhost:4004/" + name + "/index.html)",
      ok ? "" : "Add \"watch-" + path.basename(path.dirname(y)) + "\": \"cds watch --open " + name + "/index.html?sap-ui-xx-viewCache=false --livereload false\" and print exactly that URL in STEP 10 — never /<module>/webapp/index.html.");
  }
}

// ── Static 8 · No fiori-tools-appreload in apps served by cds-plugin-ui5 ─────────────────────────
// Its own live-reload port stays bound across `cds watch` restarts → "listen EADDRINUSE" → the dev
// server dies on every backend change.
{
  const pkg = readJson(path.join(root, "package.json"));
  const viaPlugin = !!(pkg.devDependencies?.["cds-plugin-ui5"] || pkg.dependencies?.["cds-plugin-ui5"]);
  const yamls = files.filter((f) => /[\\/]app[\\/][^\\/]+[\\/]ui5\.yaml$/.test(f));
  if (!yamls.length) add(CHECK.noAppreload, "No appreload middleware under cds-plugin-ui5", "SKIP", "no app/*/ui5.yaml");
  for (const y of yamls) {
    const has =/^\s*-\s*name:\s*fiori-tools-appreload\b/m.test(fs.readFileSync(y, "utf8"));
    add(CHECK.noAppreload, "No appreload middleware under cds-plugin-ui5", !viaPlugin ? "SKIP" : has ? "FAIL" : "PASS",
      !viaPlugin ? "app not served by cds-plugin-ui5" : "" + rel(y) + ": " + (has ? "fiori-tools-appreload present → cds watch restart crashes with EADDRINUSE" : "not present"),
      has ? "Remove the fiori-tools-appreload middleware from ui5.yaml (cds watch already live-reloads) and point any middleware that ran after it (e.g. fiori-tools-preview) to afterMiddleware: compression." : "");
  }
}

// ── Static 11 · Namespace identical in all four places (CLAUDE.md hard rule 1) ─────────────────────
// Component.(js|ts) · manifest sap.app.id · index.html resource-roots · ui5.yaml metadata.name.
// One mismatch → "failed to load Component.js" → blank page. Deterministic replacement for the
// validate_namespace MCP tool when the MCP server is unavailable.
if (!manifests.length) add(CHECK.namespace, "Namespace identical in all 4 places", "SKIP", "no webapp/manifest.json");
for (const mf of manifests) {
  const dir = path.dirname(path.dirname(mf));
  const id = (() => { try { return readJson(mf)["sap.app"]?.id || ""; } catch { return ""; } })();
  const found = [];
  const comp = ["Component.ts", "Component.js"].map((c) => path.join(dir, "webapp", c)).find(exists);
  if (comp) {
    const t = fs.readFileSync(comp, "utf8");
    const ns = (t.match(/\.extend\(\s*["'`]([\w.]+)\.Component["'`]/) || t.match(/@namespace\s+([\w.]+)/) || [])[1];
    found.push([rel(comp), ns || "(not found)"]);
  }
  const html = path.join(dir, "webapp", "index.html");
  if (exists(html)) {
    const t = fs.readFileSync(html, "utf8").replace(/&quot;/g, '"');
    const m = t.match(/data-sap-ui-resource-?roots\s*=\s*(['"])(\{[\s\S]*?\})\1/i);
    let ns = "(not found)";
    if (m) { try { ns = Object.keys(JSON.parse(m[2]))[0] || ns; } catch { ns = (m[2].match(/"([\w.]+)"\s*:/) || [])[1] || ns; } }
    found.push([rel(html), ns]);
  }
  const y = path.join(dir, "ui5.yaml");
  if (exists(y)) found.push([rel(y), (fs.readFileSync(y, "utf8").match(/^metadata:\s*\r?\n\s+name:\s*["']?([^"'\s]+)/m) || [])[1] || "(not found)"]);
  const bad = found.filter(([, ns]) => ns.toLowerCase() !== id.toLowerCase());
  add(CHECK.namespace, "Namespace identical in all 4 places", !id ? "FAIL" : bad.length ? "FAIL" : "PASS",
    "" + rel(mf) + " sap.app.id=" + (id || "(missing)") + (bad.length ? " · mismatch: " + bad.map(([f, ns]) => "" + f + "=" + ns).join(", ") : " · " + found.length + " other place(s) match"),
    bad.length || !id ? "Make Component namespace, manifest sap.app.id, index.html data-sap-ui-resource-roots key and ui5.yaml metadata.name identical (single-key Edits)." : "");
}

// ── Static 6 · Project versions match stack.json (the single source of truth) ────────────────────
// Delegates to sap-conventions/scripts/stack.mjs (same rules as `stack.mjs check`): CDS/driver
// ranges, engines.node, app tooling, UI5 line + published patch, specVersion, mta schema.
{
  const stackCli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "sap-conventions", "scripts", "stack.mjs");
  if (!exists(stackCli)) add(CHECK.stackVersions, "Versions match stack.json", "SKIP", "sap-conventions/scripts/stack.mjs not found");
  else {
    try {
      const lib = await import(pathToFileURL(stackCli).href);
      const loaded = lib.loadStack();
      const proj = lib.discoverProject(root);
      let resolved;
      try { resolved = await lib.resolveStack(loaded, { skipUi5: !proj.modules.length }); }
      catch (e) { resolved = await lib.resolveStack(loaded, { skipUi5: true }); add(CHECK.stackVersions, "Versions match stack.json", "WARN", "UI5 line " + loaded.stack.ui5.line + " not resolvable (" + e.message + ") — UI5 versions not checked"); }
      const res = lib.checkProject(proj, resolved, {});
      const groups = [...new Set(res.rows.map((r) => r.group))];
      for (const g of groups) {
        const rs = res.rows.filter((r) => r.group === g);
        const bad = rs.filter((r) => r.status === "FAIL"), warn = rs.filter((r) => r.status === "WARN");
        const status = bad.length ? "FAIL" : warn.length ? "WARN" : "PASS";
        const show = (bad.length ? bad : warn).slice(0, 4).map((r) => "" + r.file + " " + r.key + ": " + r.current + " → " + r.expected + " (" + r.note + ")").join(" · ");
        add(CHECK.stackVersions, "Versions match stack.json (" + g + ")", status,
          status === "PASS" ? "" + rs.length + " item(s) match (CDS " + resolved.cap.cdsMajor + (resolved.ui5.version ? ", UI5 " + resolved.ui5.version : "") + ")" : show,
          status === "PASS" ? "" : "node \"" + stackCli + "\" apply \"" + root + "\"  — then npm install (stack.json is the only place versions are set)");
      }
      if (!groups.length) add(CHECK.stackVersions, "Versions match stack.json", "SKIP", "nothing governed by stack.json found");
    } catch (e) { add(CHECK.stackVersions, "Versions match stack.json", "WARN", "stack check could not run: " + e.message); }
  }
}

// ── Static 20 · The production build includes app/ (where the UI annotations live) ────────────────
// cds watch always loads app/, so a model list in cds.build.tasks that leaves app/ out works locally and
// ships a $metadata without UI annotations: empty Fiori pages, sap.fe.macros throw
// "Cannot read properties of undefined (reading includes)" — only after deployment.
let prodModel = ["db", "srv", "app"];
{
  const appCds = cdsFiles.filter((f) => rel(f).startsWith("app/"));
  const cdsrcFile = path.join(root, ".cdsrc.json");
  let cdsrcJson = {};
  if (exists(cdsrcFile)) { try { cdsrcJson = readJson(cdsrcFile); } catch { /* invalid .cdsrc.json is reported by cds itself */ } }
  const tasks = [...(rootPkg.cds?.build?.tasks || []), ...(cdsrcJson.build?.tasks || [])];
  const modelOf = (tk) => [].concat(tk?.options?.model ?? []).map(String);
  const nodeTasks = tasks.filter((tk) => /^node(js)?(-cf)?$/.test(String(tk.for || "")) && modelOf(tk).length);
  if (nodeTasks.length) prodModel = modelOf(nodeTasks[0]);
  const withoutApp = nodeTasks.filter((tk) => !modelOf(tk).some((m) => /^(\.\/)?app(\/|$)/.test(m)));
  add(CHECK.buildModel, "Production build includes app/ (UI annotations)", !CAP || !appCds.length ? "SKIP" : withoutApp.length ? "FAIL" : "PASS",
    !CAP ? "standalone UI app" : !appCds.length ? "no .cds files in app/" : nodeTasks.length
      ? "nodejs build task model: [" + modelOf(nodeTasks[0]).join(", ") + "]" + (withoutApp.length ? " — app/ is missing: the deployed $metadata has no UI annotations" : "")
      : "default build model (db, srv, app)",
    withoutApp.length ? "Remove options.model from the nodejs task in cds.build.tasks (the CAP default already includes db, srv and app) or add \"app\" to it, rebuild and redeploy." : "");
}

// ── Static 21 · Every app annotation file is imported ──────────────────────────────────────────
// CAP loads a folder through its index.cds or its top-level .cds files — never its sub-folders.
// app/<module>/annotations.cds reaches the model only through a using-import (the Fiori generator
// writes it into app/services.cds). Without it the annotations are missing locally AND deployed.
{
  const appCds = cdsFiles.filter((f) => rel(f).startsWith("app/"));
  const reached = new Set();
  const load = (f) => {
    const p = path.resolve(f);
    if (reached.has(p) || !exists(p) || !fs.statSync(p).isFile()) return;
    reached.add(p);
    for (const m of fs.readFileSync(p, "utf8").matchAll(/\busing\b[^;]*?\bfrom\s+["']([^"']+)["']/g)) {
      if (!m[1].startsWith(".")) continue;                                  // @sap/cds/common and other packages
      const base = path.resolve(path.dirname(p), m[1]);
      const hit = [base, base + ".cds", path.join(base, "index.cds")].find((c) => exists(c) && fs.statSync(c).isFile());
      if (hit) load(hit);
    }
  };
  const loadRoot = (m) => {
    const p = path.join(root, m);
    if (exists(p) && fs.statSync(p).isFile()) return load(p);
    if (exists(p + ".cds")) return load(p + ".cds");
    if (!exists(p) || !fs.statSync(p).isDirectory()) return;
    const idx = path.join(p, "index.cds");
    if (exists(idx)) return load(idx);
    for (const e of fs.readdirSync(p)) if (e.endsWith(".cds")) load(path.join(p, e));
  };
  for (const m of new Set(["db", "srv", "app", "schema", "services", ...prodModel])) loadRoot(m);
  const unreached = appCds.filter((f) => !reached.has(path.resolve(f)));
  add(CHECK.annotationFiles, "App annotation files are imported", !CAP || !appCds.length ? "SKIP" : unreached.length ? "FAIL" : "PASS",
    !CAP ? "standalone UI app" : !appCds.length ? "no .cds files in app/" : unreached.length ? "never loaded: " + unreached.map(rel).join(", ") : appCds.length + " app .cds file(s) reached from db/srv/app",
    unreached.length ? "Add using from \"./<module>/annotations\"; for each listed file to app/services.cds (create the file if it is missing)." : "");
}

// ── Static 22 · Every UI annotation the app uses exists in the production build ────────────────
// List Report / ALP targets need UI.LineItem; sap.fe.macros building blocks (Table, FilterBar, Chart)
// need the exact term + qualifier of their metaPath on their contextPath entity. The production model
// (static 20) is compiled to EDMX — the $metadata the deployed service returns — and every use is resolved.
{
  const termOf = (mp) => { const m = String(mp || "").match(/@(?:com\.sap\.vocabularies\.UI\.v1|UI)\.([A-Za-z]+)(?:#([\w-]+))?\s*$/); return m ? { term: m[1], qualifier: m[2] || "" } : null; };
  const uses = [];
  for (const mf of manifests) {
    let man; try { man = readJson(mf); } catch { continue; }
    const appId = man["sap.app"]?.id || "";
    for (const [tn, tg] of Object.entries(man["sap.ui5"]?.routing?.targets || {})) {
      const st = tg?.options?.settings || {};
      const entity = String(st.contextPath || (st.entitySet ? "/" + st.entitySet : "")).replace(/^\//, "").split("/")[0];
      if (/sap\.fe\.templates\.(ListReport|AnalyticalListPage)/.test(tg?.name || "") && entity) {
        const qual = Object.keys(st.controlConfiguration || {}).map(termOf).filter((x) => x && x.term === "LineItem");
        for (const k of qual.length ? qual : [{ term: "LineItem", qualifier: "" }]) uses.push({ mf, entity, term: k.term, qualifier: k.qualifier, where: rel(mf) + " target " + tn });
      }
      if (/sap\.fe\.core\.fpm/.test(tg?.name || "") && st.viewName && st.viewName.startsWith(appId + ".")) {
        const vf = path.join(path.dirname(mf), ...st.viewName.slice(appId.length + 1).split(".")) + ".view.xml";
        if (!exists(vf)) continue;
        const xml = fs.readFileSync(vf, "utf8");
        const pfx = (xml.match(/xmlns:(\w+)\s*=\s*"sap\.fe\.macros"/) || [])[1];
        if (!pfx) continue;
        for (const el of xml.matchAll(new RegExp("<" + pfx + ":(Table|FilterBar|Chart)\\b([^>]*)>", "g"))) {
          const tq = termOf((el[2].match(/\bmetaPath\s*=\s*"([^"]+)"/) || [])[1]);
          if (!tq) continue;                                                    // navigation / non-UI metaPath
          const cp = (el[2].match(/\bcontextPath\s*=\s*"([^"]+)"/) || [])[1];
          uses.push({ mf, entity: cp ? cp.replace(/^\//, "").split("/")[0] : entity, term: tq.term, qualifier: tq.qualifier, where: rel(vf) + " " + pfx + ":" + el[1] });
        }
      }
    }
  }
  const label = (u) => u.entity + " @UI." + u.term + (u.qualifier ? "#" + u.qualifier : "") + " (" + u.where + ")";
  if (!CAP) add(CHECK.usedAnnotations, "UI annotations used by the app exist in the production build", "SKIP", "standalone UI app — annotations come from the service or a local annotation file");
  else if (!uses.length) add(CHECK.usedAnnotations, "UI annotations used by the app exist in the production build", "SKIP", "no List Report / ALP target and no sap.fe.macros building block");
  else {
    const modelArgs = prodModel.filter((m) => exists(path.join(root, m)) || exists(path.join(root, m + ".cds")));
    const edmxOf = new Map();
    const missing = [];
    for (const u of uses) {
      const uri = (() => { try { return readJson(u.mf)["sap.app"]?.dataSources?.mainService?.uri || ""; } catch { return ""; } })();
      const norm = "/" + uri.replace(/^\//, "");
      const svc = services.find((s) => norm.endsWith("/" + String(s.urlPath).replace(/^\//, "").replace(/\/?$/, "/")));
      if (!svc) { missing.push(label(u) + " — the manifest URI matches no served service (static check 12)"); continue; }
      if (!edmxOf.has(svc.name)) edmxOf.set(svc.name, cds(["compile", ...modelArgs, "--to", "edmx", "--service", svc.name]));
      // local annotation files of the app (rare in CAP apps) are part of what Fiori Elements reads
      let local = "";
      try {
        for (const ds of Object.values(readJson(u.mf)["sap.app"]?.dataSources || {})) {
          if (ds?.type === "ODataAnnotation" && ds.uri && !/^(\/|https?:)/.test(ds.uri) && exists(path.join(path.dirname(u.mf), ds.uri))) local += fs.readFileSync(path.join(path.dirname(u.mf), ds.uri), "utf8");
        }
      } catch { /* manifest already reported elsewhere */ }
      const found = [...(edmxOf.get(svc.name) + local).matchAll(/<Annotations\s+Target="([^"]+)"[^>]*>([\s\S]*?)<\/Annotations>/g)]
        .filter((a) => a[1] === svc.name + "." + u.entity || a[1].endsWith("." + u.entity))
        .some((a) => [...a[2].matchAll(/<Annotation\b([^>]*)>/g)].some((x) => {
          const term = (x[1].match(/\bTerm="([^"]+)"/) || [])[1] || "";
          const q = (x[1].match(/\bQualifier="([^"]+)"/) || [])[1] || "";
          return /(^|\.)UI\.([A-Za-z]+)$|^com\.sap\.vocabularies\.UI\.v1\./.test(term) && term.split(".").pop() === u.term && q === u.qualifier;
        }));
      if (!found) missing.push(label(u));
    }
    add(CHECK.usedAnnotations, "UI annotations used by the app exist in the production build", missing.length ? "FAIL" : "PASS",
      missing.length ? "missing from the deployed $metadata: " + missing.join(" · ") : uses.length + " use(s) resolved in the production model [" + modelArgs.join(", ") + "]",
      missing.length ? "Fix static checks 20 and 21 first if they fail. Otherwise make metaPath / contextPath (view) or controlConfiguration (manifest) match the annotation term, qualifier and entity set exactly. After deploying, open <app-url>/<service-path>/$metadata and search for the term." : "");
  }
}

// ── Report (always in number order) ───────────────────────────────────────────────────────────
results.sort((a, b) => a.id - b.id);
const icon = { PASS: "✅ PASS", FAIL: "❌ FAIL", WARN: "⚠️ WARN", SKIP: "— SKIP" };
console.log("Static checks — " + root + "\n");
console.log("| # | Check | Result | Detail |");
console.log("|---|---|---|---|");
for (const r of results) console.log("| " + r.id + " | " + r.title + " | " + icon[r.status] + " | " + r.detail.replace(/\|/g, "\\|") + " |");
const fails = results.filter((r) => r.status === "FAIL");
const warns = results.filter((r) => r.status === "WARN");
if (fails.length || warns.length) {
  console.log("\nFixes:");
  for (const r of [...fails, ...warns]) if (r.fix) console.log("- Static " + r.id + " (" + r.status + "): " + r.fix);
}
console.log("\nSummary: " + fails.length + " FAIL · " + warns.length + " WARN · " + results.filter((r) => r.status === "PASS").length + " PASS");
process.exit(fails.length ? 1 : 0);
