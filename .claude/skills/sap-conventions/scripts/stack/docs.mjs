/**
 * stack/docs.mjs — keep the plugin's own docs in sync with stack.json, and lint the plugin.
 *
 * sync-docs rewrites, from stack.json:
 *   • the generated version table — the block that starts with the visible caption line
 *       > Generated from **`stack.json`** by `stack.mjs sync-docs` …
 *     (older copies used hidden stack:table begin/end comment markers; they are migrated on the next run)
 *   • inside fenced code   "<pkg>": "<range>" · specVersion · _schema-version · minUI5Version →
 *                          {RECOMMENDED_UI5_VERSION} · UI5 CDN URLs · framework.version
 *   • inline code          `<pkg> <range>` · `<pkg>@<range>`
 * lint reports everything sync-docs would change and UI5 patch literals that need a human decision.
 * (Security patterns are checked by the maintainer kit's package scan and Skillspector gate.)
 *
 * Reviewed exceptions live in <plugin-root>/stack.lint-allow.json (file + exact line text +
 * rules + reason) — markdown never carries hidden marker comments. Code files (.js/.mjs/.sh) may
 * still mark a line with a `stack-ignore` code comment.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveStack, registeredPackages, EXIT } from "./core.mjs";

const INCLUDE_DIRS = [".claude/agents", ".claude/commands", ".claude/skills", "reference-apps", "mcp-server/tools", "mcp-server/lib", "hooks"];
const INCLUDE_FILES = ["CLAUDE.md", "README.md", "USER_GUIDE.md", "mcp-server/index.js", "mcp-server/smoke-test.js", ".vscode/launch.json", ".vscode/tasks.json"];
const EXCLUDE = [/node_modules/, /[\\/]tools[\\/]/, /UPDATE\.md$/, /CHANGELOG\.md$/, /package-lock\.json$/];
const PLACEHOLDER = "{RECOMMENDED_UI5_VERSION}";
export const TABLE_CAPTION = "> Generated from **`stack.json`** by `stack.mjs sync-docs`";
export const ALLOW_FILE = "stack.lint-allow.json";
const LEGACY_BEGIN = /<!--\s*stack:table:begin\s*-->/;
const LEGACY_END = /<!--\s*stack:table:end\s*-->/;

export function docFiles(root) {
  const out = [];
  const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (EXCLUDE.some((r) => r.test(p))) continue;
    if (e.isDirectory()) walk(p); else if (/\.(md|js|mjs|sh)$/.test(e.name)) out.push(p);
  } };
  for (const d of INCLUDE_DIRS) walk(path.join(root, d));
  for (const f of INCLUDE_FILES) if (fs.existsSync(path.join(root, f))) out.push(path.join(root, f));
  return [...new Set(out)].filter((f) => !EXCLUDE.some((r) => r.test(f)));
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Markdown block for the generated version table (starts with TABLE_CAPTION). */
export function renderStackTable(r) {
  const c = r.cap.packages, a = r.packages.app, rt = r.packages.root;
  const rows = [
    ["CAP runtime", "`@sap/cds`", "`" + c["@sap/cds"].range + "` (cdsMajor " + r.cap.cdsMajor + ")"],
    ["CAP build tool", "`@sap/cds-dk`", "`" + c["@sap/cds-dk"].range + "` (same major as runtime, local devDependency)"],
    ["HANA driver (prod)", "`@cap-js/hana`", "`" + (c["@cap-js/hana"]?.range) + "`"],
    ["SQLite driver (dev)", "`@cap-js/sqlite`", "`" + (c["@cap-js/sqlite"]?.range) + "`"],
    ["Node.js (engines)", "`node`", "`" + r.cap.node + "`"],
    ["UI5 CLI", "`@ui5/cli`", "`" + (a["@ui5/cli"]?.range) + "`"],
    ["UI5 linter", "`@ui5/linter`", "`" + (a["@ui5/linter"]?.range) + "` (devDependency of every UI module — run with `npm exec --no -- ui5lint`)"],
    ["CAP ↔ UI5 bridge", "`cds-plugin-ui5`", "`" + (rt["cds-plugin-ui5"]?.range) + "`"],
    ["Fiori tools", "`@sap/ux-ui5-tooling`", "`" + (a["@sap/ux-ui5-tooling"]?.range) + "`"],
    ["Mock server", "`@sap-ux/ui5-middleware-fe-mockserver`", "`" + (a["@sap-ux/ui5-middleware-fe-mockserver"]?.range) + "`"],
    ["TypeScript (freestyle only)", "`typescript` · `ui5-tooling-transpile` · `@sapui5/types`", "`" + (a.typescript?.range) + "` · `" + (a["ui5-tooling-transpile"]?.range) + "` · `" + (a["@sapui5/types"]?.range) + "`"],
    ["Test runner", "`jest`", "`" + (rt.jest?.range) + "`"],
    ["OData version", "V4", "—"],
    ["UI5 runtime", "SAPUI5 line `" + r.ui5.line + "`", "newest **verified** patch of the line, resolved at build time by `stack.mjs resolve` — never a guessed patch"],
    ["UI5 theme", "`" + r.ui5.theme + "`", "—"],
    ["ui5.yaml / MTA", "`specVersion` · `_schema-version`", "`" + r.ui5Tooling.specVersion + "` · `\"" + r.deploy.mtaSchemaVersion + "\"`"],
    ["Fiori generator", "`yo` · `@sap/generator-fiori`", "`" + r.generator.yo + "` · `" + r.generator.fioriGenerator + "` (headless config `" + r.generator.headlessConfigVersion + "`)"]
  ].filter((x) => !String(x[2]).startsWith("`undefined`"));
  return [
    "" + TABLE_CAPTION + " — edit `stack.json`, never this table.",
    "> Change the CAP stack with `cap.cdsMajor`, UI5 with `ui5.line`; existing apps: `stack.mjs apply <app>`.",
    "",
    "| Layer | Technology | Version |",
    "|---|---|---|",
    ...rows.map((x) => "| " + x.join(" | ") + " |")
  ].join("\n");
}

// ───────────────────────────────── allowlist ──────────────────────────────────────────────────
/** Load stack.lint-allow.json → { entries[], errors[] }. Every entry needs a reason. */
export function loadAllow(root) {
  const f = path.join(root, ALLOW_FILE);
  if (!fs.existsSync(f)) return { entries: [], errors: [] };
  try {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    const all = j.allow || [];
    const entries = all.filter((e) => e && e.file && e.reason && (e.contains || (e.from && e.to)));
    const errors = all.filter((e) => !e?.reason || !e?.file || !(e.contains || (e.from && e.to))).map((e) => "" + ALLOW_FILE + ": incomplete entry " + JSON.stringify(e).slice(0, 80) + " (file, contains or from/to, reason are required)");
    return { entries, errors };
  } catch (e) { return { entries: [], errors: ["" + ALLOW_FILE + ": " + e.message] }; }
}
/** predicate(lineNo, lineText, rule) → is this finding a reviewed exception for relFile? */
export function allowFor(entries, relFile, lines) {
  const mine = entries.filter((e) => e.file === relFile);
  const regions = [];
  for (const e of mine.filter((x) => x.from && x.to)) {
    const a = lines.findIndex((l) => l.includes(e.from));
    const b = a < 0 ? -1 : lines.findIndex((l, i) => i >= a && l.includes(e.to));
    if (a >= 0 && b >= 0) regions.push({ a: a + 1, b: b + 1, rules: e.rules });
  }
  const ruleOk = (rules, rule) => !rules || rules.includes("*") || rules.includes(rule);
  return (ln, text, rule) =>
    mine.some((e) => e.contains && text.includes(e.contains) && ruleOk(e.rules, rule)) ||
    regions.some((g) => ln >= g.a && ln <= g.b && ruleOk(g.rules, rule));
}

/** Transform one document. Returns { text, findings[] } — findings carry {line, rule, msg, fixable}. */
export function transformDoc(text, file, r, pkgs, allowed = () => false) {
  const isMd = file.endsWith(".md");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const findings = [];
  let inFence = false, inTable = null, inFramework = false;
  const pkgNames = Object.keys(pkgs).sort((a, b) => b.length - a.length);
  const pkgAlt = pkgNames.map(esc).join("|");
  const reJsonPkg = new RegExp("(\"(" + pkgAlt + ")\"\\s*:\\s*\")([^\"]+)(\")", "g");
  const reInlinePkg = new RegExp("`(" + pkgAlt + ")(\\s+|@)([\\^~>=<]*\\d[\\w.\\-]*|latest)`", "g");
  const reCdn = /(https:\/\/(?:sapui5\.hana\.ondemand\.com|ui5\.sap\.com)\/)(\d+\.\d+\.\d+)(\/(?:resources|test-resources)\/)/g;
  const out = [];
  const flag = (ln, rule, msg, line) => { if (!allowed(ln, line, rule)) findings.push({ line: ln, rule, msg, fixable: false }); };

  for (let n = 0; n < lines.length; n++) {
    let line = lines[n];
    const ln = n + 1;

    // ── generated table: drop the old block (it was re-rendered at its caption) ────────────────
    if (inTable === "legacy") { if (LEGACY_END.test(line)) inTable = null; continue; }
    if (inTable === "caption") { if (/^>/.test(line) || line.trim() === "") continue; if (/^\|/.test(line)) { inTable = "rows"; continue; } inTable = null; }
    if (inTable === "rows") { if (/^\|/.test(line)) continue; inTable = null; }
    if (isMd && !inFence && (LEGACY_BEGIN.test(line) || line.startsWith(TABLE_CAPTION))) {
      const legacy = LEGACY_BEGIN.test(line);
      const fresh = renderStackTable(r).split("\n");
      out.push(...fresh);
      inTable = legacy ? "legacy" : "caption";
      if (legacy) findings.push({ line: ln, rule: "SYNC", msg: "hidden stack:table markers → visible caption", fixable: true });
      else {
        // report a stale table so `sync-docs --check` / lint see it
        let k = n, old = [];
        while (k < lines.length && (/^>/.test(lines[k]) || lines[k].trim() === "" || /^\|/.test(lines[k]))) {
          if (/^\|/.test(lines[k]) || /^>/.test(lines[k]) || (old.length && lines[k].trim() === "")) old.push(lines[k]);
          if (/^\|/.test(lines[k]) && !/^\|/.test(lines[k + 1] ?? "")) break;
          k++;
        }
        const norm = (a) => a.filter((x) => x.trim() !== "").join("\n");
        if (norm(old) !== norm(fresh)) findings.push({ line: ln, rule: "SYNC", msg: "generated stack table is stale", fixable: true });
      }
      continue;
    }

    const fenceM = isMd && line.match(/^\s*(\x60{3,}|~{3,})\s*([\w-]*)/);   // \x60 = backtick (code fence)
    if (fenceM) { inFence = !inFence; inFramework = false; out.push(line); continue; }

    const codeIgnore = !isMd && /stack-ignore/.test(line);

    if (codeIgnore) { out.push(line); continue; }
    const before = line;
    const code = !isMd || inFence;            // .js/.mjs are all "code"
    const skipSync = allowed(ln, before, "SYNC");

    if (!skipSync) {
      // F1 "<pkg>": "<range>" (fenced md, and JS objects)
      if (code) line = line.replace(reJsonPkg, (all, pre, name, range, post) => {
        if (/^(file:|link:|git|github:|https?:|npm:|workspace:)/.test(range)) return all;
        return range === pkgs[name] ? all : "" + pre + pkgs[name] + post;
      });
      // F7 inline `pkg range` / `pkg@range` (md prose + inline code)
      if (isMd && !inFence) line = line.replace(reInlinePkg, (all, name, sep, range) => (range === pkgs[name] ? all : "`" + name + sep + pkgs[name] + "`"));
      if (isMd && inFence) {
        // F2 specVersion (yaml) — only ui5.yaml style 'specVersion:' at line start
        if (r.ui5Tooling.specVersion) line = line.replace(/^(\s*specVersion:\s*)(["']?)(\d+\.\d+)(["']?)/, (all, pre, q1, v, q2) => (v === r.ui5Tooling.specVersion ? all : "" + pre + (q1 || '"') + r.ui5Tooling.specVersion + (q2 || '"')));
        // F3 _schema-version (mta)
        line = line.replace(/^(\s*_schema-version:\s*)(["']?)(\d+(?:\.\d+){1,2})(["']?)\s*$/, (all, pre, q1, v, q2) => {
          const ok = q1 && (v === r.deploy.mtaSchemaVersion || v === "" + r.deploy.mtaSchemaVersion + ".0");
          return ok ? all : "" + pre + "\"" + r.deploy.mtaSchemaVersion + "\"";
        });
        // F4 minUI5Version literal → placeholder
        line = line.replace(/("minUI5Version"\s*:\s*")(\d+\.\d+\.\d+)(")/, "$1" + PLACEHOLDER + "$3");
        // F6 framework.version inside a yaml framework: block
        if (/^framework:\s*$/.test(line) || /^\s+framework:\s*$/.test(line)) inFramework = true;
        else if (inFramework && /^\S/.test(line)) inFramework = false;
        if (inFramework) line = line.replace(/^(\s+version:\s*)(["']?)(\d+\.\d+\.\d+)(["']?)/, "$1$2" + PLACEHOLDER + "$4");
      }
      // F5 CDN URL literal version → placeholder (md anywhere; js reported only)
      if (isMd) line = line.replace(reCdn, "$1" + PLACEHOLDER + "$3");
    }

    if (line !== before) findings.push({ line: ln, rule: "SYNC", msg: "" + before.trim().slice(0, 110) + "  →  " + line.trim().slice(0, 110), fixable: true });
    else {
      // human-decision findings (not auto-fixed)
      if (!isMd && /\b1\.1\d\d\.\d+\b/.test(line)) flag(ln, "L8", "UI5 patch literal in code — read it from stack.json (or mark the line // stack-ignore): " + line.trim().slice(0, 110), line);
      if (!isMd && reCdn.test(line)) flag(ln, "L4", "versioned UI5 CDN URL in code: " + line.trim().slice(0, 110), line);
      reCdn.lastIndex = 0;
      if (isMd && !inFence && /(?<![\w.])1\.1\d\d\.\d+(?![\w.])/.test(line)) flag(ln, "L9", "UI5 patch literal in prose — rewrite to \"the stack.json line\" or add a reviewed entry to " + ALLOW_FILE + ": " + line.trim().slice(0, 110), line);
    }
    out.push(line);
  }
  return { text: out.join(eol), findings };
}

async function resolvedForDocs(loaded, opts) { return resolveStack(loaded, { ...opts, skipUi5: true }); }
const relOf = (root, f) => path.relative(root, f).split(path.sep).join("/");

function runAll(loaded, r, pkgs) {
  const { entries, errors } = loadAllow(loaded.root);
  const results = [];
  for (const f of docFiles(loaded.root)) {
    const text = fs.readFileSync(f, "utf8");
    const rel = relOf(loaded.root, f);
    results.push({ f, rel, text, res: transformDoc(text, f, r, pkgs, allowFor(entries, rel, text.split(/\r?\n/))) });
  }
  return { results, errors };
}

export async function syncDocsCmd(loaded, flags, opts) {
  const r = await resolvedForDocs(loaded, opts);
  const pkgs = registeredPackages(r);
  let changedFiles = 0, edits = 0;
  for (const { f, rel, text, res } of runAll(loaded, r, pkgs).results) {
    const n = res.findings.filter((x) => x.fixable).length;
    if (res.text !== text) {
      changedFiles++; edits += n;
      console.log("" + (flags.check ? "would update" : "updated") + " " + rel + " (" + n + " line(s))");
      if (!flags.check) fs.writeFileSync(f, res.text);
    }
  }
  console.log("\n" + changedFiles + " file(s) " + (flags.check ? "out of sync" : "synced") + " · " + edits + " line(s)");
  return flags.check && changedFiles ? EXIT.FINDINGS : EXIT.OK;
}

export async function lintCmd(loaded, flags, opts) {
  const r = await resolvedForDocs(loaded, opts);
  const pkgs = registeredPackages(r);
  const { results, errors } = runAll(loaded, r, pkgs);
  const all = [];
  for (const { rel, res } of results) for (const x of res.findings) all.push({ file: rel, ...x });
  for (const e of errors) all.push({ file: ALLOW_FILE, line: 1, rule: "S0", msg: e, fixable: false });
  const shown = flags.docs ? all.filter((x) => x.fixable) : all;
  if (flags.json) console.log(JSON.stringify(shown, null, 2));
  else {
    for (const x of shown) console.log("" + x.file + ":" + x.line + "  [" + x.rule + (x.fixable ? " · sync-docs fixes" : "") + "]  " + x.msg);
    const fix = shown.filter((x) => x.fixable).length;
    console.log("\n" + shown.length + " finding(s) — " + fix + " fixed automatically by `stack.mjs sync-docs`, " + (shown.length - fix) + " need a human decision (rewrite, or a reviewed entry in " + ALLOW_FILE + ").");
  }
  return shown.length ? EXIT.FINDINGS : EXIT.OK;
}
