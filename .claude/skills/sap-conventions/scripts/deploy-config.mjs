#!/usr/bin/env node
/**
 * deploy-config.mjs — the /intent deployment descriptor step as ONE command (CAP projects).
 *
 *   1. `cds add mta,workzone-standard` with the @sap/cds-dk installed in the project (CAP service only: `cds add mta`).
 *      That is the SAP layout for the HTML5 Application Repository + SAP Build Work Zone: CAP service, db
 *      deployer, one html5 module per UI app, app deployer (app-host content + the srv-api destination with
 *      HTML5.ForwardAuthToken), destination content, xsuaa / hdi / destination / html5-repo-host resources,
 *      plus xs-app.json, the UI build (ui5-task-zipper), sap.cloud.service and the launchpad inbound per app.
 *   2. mta.yaml additions the plugin rules require: forwardAuthToken on srv-api (hard rule 3), an explicit
 *      service-name on every managed service, a real description; schema version and the build line through
 *      stack.mjs apply --scope deploy.
 *   3. Per UI app: the build task relative-odata-uri. cds watch needs the absolute data source URI
 *      /odata/v4/<svc>/ (static check 12); the HTML5 Application Runtime needs the relative odata/v4/<svc>/
 *      (an absolute URI loses the app path in Work Zone → 404). The task writes the relative form into the
 *      BUILT app only (dist + Component-preload) — the source manifest never changes. The task is a local
 *      extension package app/<module>/ui5-tasks/relative-odata-uri (file: devDependency + one customTasks entry).
 *      html5 modules of npm workspace apps also lose their own `npm ci` (see wsGlobs).
 *   4. Prints `cd <app> && npm install` only when a package.json changed (new devDependencies such as
 *      ui5-task-zipper), else "No npm install needed". Never run here, so an organisation policy that asks
 *      before npm install still asks. In /intent it runs right after the UI scaffold, so ONE install covers both.
 *
 * Usage (from the workspace root):  node .claude/skills/sap-conventions/scripts/deploy-config.mjs <cap-root>
 * Exit: 0 written · 1 a step failed (printed) · 2 usage / not a CAP project / @sap/cds-dk not installed
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fail = (code, msg) => { console.error("deploy-config: " + msg); process.exit(code); };
const canonical = (p) => { try { return fs.realpathSync.native(p); } catch { return p; } };
if (!process.argv[2]) fail(2, "usage: deploy-config.mjs <cap-root>");
const root = canonical(path.resolve(process.argv[2]));
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, ""));
const pkgFile = path.join(root, "package.json");
if (!fs.existsSync(pkgFile) || !(fs.existsSync(path.join(root, "srv")) || fs.existsSync(path.join(root, "db")))) fail(2, root + " is not a CAP project");
const cdsBin = path.join(root, "node_modules", "@sap", "cds-dk", "bin", "cds.js");
if (!fs.existsSync(cdsBin)) fail(2, "@sap/cds-dk is not installed in " + root + " — run: cd " + path.basename(root) + " && npm install");

const uiApps = fs.existsSync(path.join(root, "app")) ? fs.readdirSync(path.join(root, "app"), { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, "app", e.name, "webapp", "manifest.json"))).map((e) => e.name) : [];
const rows = [];
// every package.json this step may change — an npm install is needed only when one of them changed
const pkgFiles = [pkgFile, ...uiApps.map((a) => path.join(root, "app", a, "package.json"))];
const pkgBefore = pkgFiles.map((f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : ""));

// ── 1. SAP generator ─────────────────────────────────────────────────────────────────────────
const facets = uiApps.length ? "mta,workzone-standard" : "mta";
try {
  execFileSync(process.execPath, [cdsBin, "add", facets], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300000, windowsHide: true });
  rows.push(["cds add " + facets, "✅ mta.yaml" + (uiApps.length ? ", xs-app.json, UI build, launchpad inbound for " + uiApps.join(", ") : "")]);
} catch (e) { fail(1, "cds add " + facets + " failed: " + String(e.stderr || e.message).trim().split(/\r?\n/).slice(-3).join(" ")); }

// ── 2. mta.yaml additions (line edits — comments and layout stay) ─────────────────────────────
const mtaFile = path.join(root, "mta.yaml");
if (!fs.existsSync(mtaFile)) fail(1, "cds add did not write mta.yaml");
const mtaText = fs.readFileSync(mtaFile, "utf8");
const nl = mtaText.includes("\r\n") ? "\r\n" : "\n";
const lines = mtaText.split(/\r?\n/);
const out = [];
let section = null, resName = null, resManaged = false, resHasName = false, inSrvApi = false, fwd = 0, names = 0;
let modType = null, modPath = null, ciDropped = 0;
const pkg = readJson(pkgFile);
// npm workspaces of the CAP root (scaffold-ui.mjs adds "app/*"): the before-all `npm ci` already installs every
// workspace app. A second `npm ci` inside a workspace app reinstalls the WHOLE tree with only the packages of that app —
// after `mbt build` the root has no @sap/cds / @sap/cds-dk any more and `npm run watch` fails (verified).
const wsGlobs = (Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces && pkg.workspaces.packages) || [])
  .map((g) => new RegExp("^" + String(g).replace(/^\.\//, "").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+") + "/?$"));
const inWorkspace = (p) => !!p && wsGlobs.some((re) => re.test(p.replace(/^\.\//, "").replace(/\\/g, "/")));
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (/^\S/.test(l)) { section = l.replace(/:.*$/, ""); inSrvApi = false; }
  if (/^description:\s*"?A simple CAP project\.?"?\s*$/.test(l)) {
    const d = pkg.description && !/simple CAP project/i.test(pkg.description) ? pkg.description : pkg.name + " — SAP CAP service" + (uiApps.length ? " with SAP Fiori UI" : "");
    out.push("description: " + JSON.stringify(d));
    continue;
  }
  if (section === "modules") {
    if (/^  - name:\s*\S/.test(l)) { modType = null; modPath = null; }
    const mt = l.match(/^    type:\s*(\S+)/); if (mt) modType = mt[1];
    const mp = l.match(/^    path:\s*(\S+)/); if (mp) modPath = mp[1];
    if (/^\s+- name: srv-api\b/.test(l)) inSrvApi = true;
    else if (inSrvApi && /^\s+- name: /.test(l)) inSrvApi = false;
    // html5 module of a workspace app: drop its own `npm ci` (see wsGlobs above), keep `npm run build`
    if (modType === "html5" && inWorkspace(modPath) && /^\s+- npm ci\s*$/.test(l)) { ciDropped++; continue; }
    out.push(l);
    // forwardAuthToken right after srv-url inside the srv-api provides block (CLAUDE.md hard rule 3)
    if (inSrvApi && /^\s+srv-url:/.test(l)) {
      const block = lines.slice(i + 1, i + 6).join("\n");
      if (!/forwardAuthToken:\s*true/.test(block)) { out.push(l.match(/^(\s*)/)[1] + "forwardAuthToken: true"); fwd++; }
    }
    continue;
  }
  if (section === "resources") {
    const m = l.match(/^  - name:\s*(\S+)/);
    if (m) { resName = m[1]; resManaged = false; resHasName = false; }
    if (/^\s+type:\s*org\.cloudfoundry\.managed-service/.test(l)) resManaged = true;
    if (/^\s+service-name:/.test(l)) resHasName = true;
    out.push(l);
    // explicit service-name next to `service:` (destination content references instances by name)
    if (resName && resManaged && !resHasName && /^      service:\s*\S/.test(l)) {
      const rest = lines.slice(i + 1).findIndex((x) => /^  - name:|^\S/.test(x));
      const block = lines.slice(i + 1, rest < 0 ? undefined : i + 1 + rest).join("\n");
      if (!/service-name:/.test(block)) { out.push("      service-name: " + resName); names++; resHasName = true; }
    }
    continue;
  }
  out.push(l);
}
fs.writeFileSync(mtaFile, out.join(nl));
rows.push(["mta.yaml additions", "forwardAuthToken on srv-api: " + (fwd ? "added" : "present") + " · service-name added to " + names + " resource(s) · description"]);
if (wsGlobs.length) rows.push(["html5 module build", ciDropped ? "`npm ci` removed from " + ciDropped + " workspace app(s) — the before-all `npm ci` installs them; keeps the root install intact after mbt build" : "no workspace `npm ci` to remove"]);
try {
  const r = execFileSync(process.execPath, [path.join(here, "stack.mjs"), "apply", root, "--scope", "deploy"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300000, windowsHide: true });
  rows.push(["stack.json (schema version, build line)", "✅ " + ((r.match(/(\d+) change\(s\)/) || [, "0"])[1]) + " change(s)"]);
} catch (e) { rows.push(["stack.json (schema version, build line)", "❌ " + String(e.stdout || e.message).trim().split(/\r?\n/).pop()]); }

// ── 3. per UI app: relative data source URI in the built app only ─────────────────────────────
const TASK = [
  "/**",
  " * relative-odata-uri — UI5 build task added by Intent2Code (deploy-config.mjs). cds watch needs the absolute",
  " * data source URI /odata/v4/<service>/; the deployed app runs behind the HTML5 Application Runtime (SAP Build",
  " * Work Zone), which needs the relative odata/v4/<service>/ (an absolute URI loses the app path → 404). This task",
  " * rewrites the BUILT manifest only (dist, Component-preload); the source manifest is never changed.",
  " */",
  "module.exports = async function ({ workspace, log }) {",
  "  for (const res of await workspace.byGlob(\"**/manifest.json\")) {",
  "    const json = JSON.parse(await res.getString());",
  "    let changed = 0;",
  "    for (const ds of Object.values((json[\"sap.app\"] || {}).dataSources || {})) {",
  "      if (typeof ds.uri === \"string\" && ds.uri.startsWith(\"/odata/\")) { ds.uri = ds.uri.slice(1); changed++; }",
  "    }",
  "    if (changed) { res.setString(JSON.stringify(json, null, 2)); await workspace.write(res); log.info(\"relative data source URI in \" + res.getPath()); }",
  "  }",
  "};",
  ""
].join("\n");
// The task is a local extension package (own ui5.yaml, kind: extension) referenced as a file: devDependency —
// found by the UI5 tooling like ui5-task-zipper. The app ui5.yaml stays ONE yaml document: a second document
// there makes every later `cds add` fail (its yaml parser reads a single document — verified).
const TASK_PKG = "ui5-task-relative-odata-uri", TASK_DIR = "ui5-tasks/relative-odata-uri";
// ui5-task-zipper range from the plugin stack.json (packages.app), "^3" when it cannot be read
const ZIPPER_RANGE = (() => {
  try {
    const z = readJson(path.resolve(here, "..", "..", "..", "..", "stack.json")).packages.app["ui5-task-zipper"];
    return typeof z === "string" ? z : (z && z.range) || "^3";
  } catch { return "^3"; }
})();
const TASK_YAML = ["specVersion: \"4.0\"", "kind: extension", "type: task", "metadata:", "  name: relative-odata-uri", "task:", "  path: task.cjs", ""].join("\n");
const TASK_JSON = JSON.stringify({ name: TASK_PKG, version: "1.0.0", private: true, description: "UI5 build task: relative OData data source URI in the built app (added by Intent2Code deploy-config.mjs)" }, null, 2) + "\n";
for (const app of uiApps) {
  const dir = path.join(root, "app", app);
  const tdir = path.join(dir, ...TASK_DIR.split("/"));
  fs.mkdirSync(tdir, { recursive: true });
  fs.writeFileSync(path.join(tdir, "task.cjs"), TASK);
  fs.writeFileSync(path.join(tdir, "ui5.yaml"), TASK_YAML);
  fs.writeFileSync(path.join(tdir, "package.json"), TASK_JSON);
  const changes = [];
  // devDependency (file:) in the app package.json — JSON edit that keeps 2-space layout and line endings
  const pf = path.join(dir, "package.json");
  const ptext = fs.readFileSync(pf, "utf8");
  const ap = JSON.parse(ptext.replace(/^\uFEFF/, ""));
  let pkgChanged = false;
  const addDev = (name, range) => {
    if (ap.devDependencies && ap.devDependencies[name]) return;
    ap.devDependencies = { ...(ap.devDependencies || {}), [name]: range };
    pkgChanged = true; changes.push("devDependency " + name);
  };
  // customTasks entries in the app ui5.yaml (single document)
  const y = path.join(dir, "ui5.yaml");
  const ytext = fs.readFileSync(y, "utf8");
  const ynl = ytext.includes("\r\n") ? "\r\n" : "\n";
  const ls = ytext.split(/\r?\n/);
  let yamlChanged = false;
  const addTask = (name, entry) => {
    if (ls.some((l) => new RegExp("^\\s+- name:\\s*" + name + "\\s*$").test(l))) return;
    const b = ls.findIndex((l) => /^builder:\s*$/.test(l));
    const c = b < 0 ? -1 : ls.findIndex((l, k) => k > b && /^  customTasks:\s*$/.test(l));
    if (c > 0) ls.splice(c + 1, 0, ...entry);
    else if (b >= 0) ls.splice(b + 1, 0, "  customTasks:", ...entry);
    else { while (ls.length && ls[ls.length - 1] === "") ls.pop(); ls.push("builder:", "  customTasks:", ...entry, ""); }
    yamlChanged = true; changes.push("ui5.yaml task " + name);
  };
  addDev(TASK_PKG, "file:" + TASK_DIR);
  addTask("relative-odata-uri", ["    - name: relative-odata-uri", "      beforeTask: generateComponentPreload"]);
  // ui5-task-zipper: `cds add workzone-standard` adds it only to apps it sees as UI5 apps (root package.json
  // "sapux", which the Fiori generator writes for Fiori Elements apps only). A freestyle app would ship no zip
  // and mbt build stops at the missing artifact. Same entry as the cds-dk html5-repo template.
  const hadZipper = ls.some((l) => /^\s+- name:\s*ui5-task-zipper\s*$/.test(l));
  addTask("ui5-task-zipper", ["    - name: ui5-task-zipper", "      afterTask: generateVersionInfo", "      configuration:",
    "        archiveName: " + app, "        relativePaths: true", "        additionalFiles:", "          - xs-app.json"]);
  if (!hadZipper) addDev("ui5-task-zipper", ZIPPER_RANGE);
  if (pkgChanged) {
    const pnl = ptext.includes("\r\n") ? "\r\n" : "\n";
    fs.writeFileSync(pf, (ptext.startsWith("\uFEFF") ? "\uFEFF" : "") + JSON.stringify(ap, null, 2).replace(/\n/g, pnl) + pnl);
  }
  if (yamlChanged) fs.writeFileSync(y, ls.join(ynl));
  rows.push(["app/" + app, changes.length ? "UI build: " + changes.join(", ") : "UI build already configured (relative-odata-uri, ui5-task-zipper)"]);
}

const rel = path.relative(process.cwd(), root).replace(/\\/g, "/") || ".";
console.log("deploy-config — " + rel + "\n");
console.log("| Step | Result |\n|---|---|");
for (const [a, b] of rows) console.log("| " + a + " | " + b + " |");
// compare without line endings: cds add rewrites some package.json files with other line endings only
const norm = (s) => s.replace(/\r\n/g, "\n");
const changedPkgs = pkgFiles.filter((f, i) => norm(fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "") !== norm(pkgBefore[i]));
if (changedPkgs.length) console.log("\nNEXT (run it as its own command — an organisation policy may ask before npm install):\n  cd " + rel + " && npm install" +
  "\n  (changed: " + changedPkgs.map((f) => path.relative(root, f).replace(/\\/g, "/")).join(", ") + ")");
else console.log("\nNo npm install needed — no package.json changed.");
process.exit(rows.some(([, b]) => b.startsWith("❌")) ? 1 : 0);
