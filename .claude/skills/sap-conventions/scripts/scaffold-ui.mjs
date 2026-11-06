#!/usr/bin/env node
/**
 * scaffold-ui.mjs — the /intent UI scaffold (STEP 7.5 + the generator part of STEP 8) as ONE command:
 *
 *   1. builds the SAP Fiori generator headless config from the gate answers (floorplan names, data source and
 *      EDMX escaping exactly as in the validated builds; UI5 version + config version from stack.json)
 *   2. runs `yo @sap/fiori:headless <config> --force --no-insight --skipInstall` (stdin closed, no shell)
 *   3. checks the generated webapp/manifest.json
 *   4. snapshots the untouched generator manifest (stack.mjs snapshot — static check 14 compares against it)
 *   5. aligns versions with stack.json (stack.mjs apply) and, for CAP, adds "workspaces": ["app/*"] and removes the
 *      fiori-tools-appreload middleware from ui5.yaml (it crashes cds watch restarts — static check 8)
 *   6. prints the one command still to run: `cd <app> && npm install` — it is NOT run here, so an organisation
 *      policy that asks before npm install still asks.
 *
 * Usage (from the workspace root):
 *   CAP app      node .claude/skills/sap-conventions/scripts/scaffold-ui.mjs <cap-root> --type cap-fe-lrop|cap-fe-alp|cap-fe-op|cap-fpm|cap-freestyle
 *                  --module <ui-module> --namespace <ns> --title "<title>" [--description "<text>"] --entity <MainEntity> [--nav <NavEntity>] [--service <ServiceName>]
 *   standalone   node … scaffold-ui.mjs <workspace-dir> --type external-fe|freestyle-ui5 --module <app-name> --namespace <ns> --title "<title>"
 *                  [--edmx <metadata.xml> --service-path </odata/v4/…/> --entity <MainEntity> [--nav <NavEntity>]]   (external-fe)
 *   freestyle    --lang ts|js (cap-freestyle, freestyle-ui5): UI language from Gate C — ts (default) or js.
 *                Fiori Elements apps are always JavaScript (the option does not apply).
 * Needs: CAP apps — `npm install` done in <cap-root> (the service path comes from the local cds compiler).
 * Exit:  0 scaffolded (run the printed npm install) · 1 generator failed (log path printed) · 2 usage / input error
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const stackCli = path.join(here, "stack.mjs");
const argv = process.argv.slice(2);
const flag = (k) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : undefined; };
const target = argv[0] && !argv[0].startsWith("--") ? path.resolve(argv[0]) : null;
const fail = (code, msg) => { console.error("scaffold-ui: " + msg); process.exit(code); };
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, ""));
const canonical = (p) => { try { return fs.realpathSync.native(p); } catch { return p; } };   // exact drive-letter case (see smoke-check.mjs)

const FLOORPLAN = { "cap-fe-lrop": "FE_LROP", "cap-fe-alp": "FE_ALP", "cap-fe-op": "FE_FEOP", "cap-fpm": "FE_FPM", "cap-freestyle": "FF_SIMPLE", "external-fe": "FE_LROP", "freestyle-ui5": "FF_SIMPLE" };
const type = flag("type"), mod = flag("module"), ns = flag("namespace"), title = flag("title");
if (!target || !FLOORPLAN[type] || !mod || !ns || !title) {
  fail(2, "usage: scaffold-ui.mjs <cap-root|workspace-dir> --type <" + Object.keys(FLOORPLAN).join("|") + "> --module <name> --namespace <ns> --title \"<title>\" [--entity <Main>] [--nav <Nav>] [--service <Name>] [--edmx <file>] [--description \"<text>\"] [--lang ts|js]");
}
if (!/^[a-z0-9][a-z0-9-]*$/i.test(mod)) fail(2, "--module must be a plain folder name (letters, digits, -): " + mod);
const root = canonical(target);
const isCap = type.startsWith("cap-");
const floorplan = FLOORPLAN[type];
const entity = flag("entity"), nav = flag("nav");
if (floorplan !== "FF_SIMPLE" && !entity) fail(2, "--entity <MainEntity> is required for " + type);
const lang = (flag("lang") || "ts").toLowerCase();
if (!["ts", "js"].includes(lang)) fail(2, "--lang must be ts or js: " + lang);
if (lang === "js" && floorplan !== "FF_SIMPLE") console.log("scaffold-ui: --lang applies to freestyle apps only — " + type + " is generated as JavaScript");
const typescript = floorplan === "FF_SIMPLE" && lang === "ts";

// ── stack.json: UI5 version + headless config version ────────────────────────────────────────
const { loadStack, resolveStack } = await import(pathToFileURL(path.join(here, "stack", "core.mjs")).href);
const loaded = loadStack();
const resolved = await resolveStack(loaded, {});
const ui5Version = resolved.ui5.version;
if (!ui5Version) fail(2, "stack.json UI5 line is not resolvable (offline, no cache) — run preflight.mjs");
const configVersion = String(resolved.generator?.headlessConfigVersion || "0.2");

// ── data source ──────────────────────────────────────────────────────────────────────────────
let service = null;
if (isCap) {
  if (!fs.existsSync(path.join(root, "package.json"))) fail(2, root + " is not a CAP project (no package.json)");
  const cdsBin = path.join(root, "node_modules", "@sap", "cds-dk", "bin", "cds.js");
  if (!fs.existsSync(cdsBin)) fail(2, "@sap/cds-dk is not installed in " + root + " — run: cd " + path.basename(root) + " && npm install");
  let infos = [];
  try { infos = JSON.parse(execFileSync(process.execPath, [cdsBin, "compile", "srv", "--to", "serviceinfo"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300000, windowsHide: true }) || "[]"); }
  catch (e) { fail(2, "cds compile srv --to serviceinfo failed — the model does not compile: " + String(e.stderr || e.message).split(/\r?\n/).slice(0, 3).join(" ")); }
  const odata = infos.filter((s) => (s.endpoints || []).some((x) => /odata/i.test(x.kind || "")));
  const want = flag("service");
  const svc = want ? odata.find((s) => s.name === want || s.name.endsWith("." + want)) : odata.length === 1 ? odata[0] : null;
  if (!svc) fail(2, want ? "service " + want + " not found; served: " + odata.map((s) => s.name).join(", ") : "several OData services (" + odata.map((s) => s.name).join(", ") + ") — pass --service <Name>");
  service = { servicePath: "/" + String(svc.urlPath).replace(/^\//, "").replace(/\/?$/, "/"),
    capService: { projectPath: root.replace(/\\/g, "/"), serviceName: svc.name, serviceCdsPath: String(svc.location?.file || "srv/service.cds").replace(/\\/g, "/") } };
} else if (type === "external-fe") {
  const edmxFile = flag("edmx");
  if (!edmxFile || !fs.existsSync(edmxFile)) fail(2, "--edmx <metadata.xml> is required for external-fe (the offline metadata of the service)");
  // Without servicePath the generator binds the app to /sap/opu/odata/ (static check 13 then fails): pass the
  // backend OData path recorded at Gate B.
  const servicePath = flag("service-path");
  if (!servicePath || !servicePath.startsWith("/")) fail(2, "--service-path </odata/…/ or /sap/opu/…/> is required for external-fe (the backend OData path from Gate B)");
  service = { servicePath: servicePath.replace(/\/?$/, "/"), edmx: fs.readFileSync(edmxFile, "utf8"), metadataFilename: "metadata.xml" };   // JSON.stringify escapes the EDMX
}
// freestyle-ui5: no service in the generator (the UI builder wires the mock / proxy) — as in the validated build

const appDir = isCap ? path.join(root, "app", mod) : path.join(root, mod);
const manifest = path.join(appDir, "webapp", "manifest.json");
if (fs.existsSync(manifest)) fail(2, path.relative(process.cwd(), manifest) + " already exists — the generator runs once per module (a second run duplicates the root sapux entry). Use a new --module or remove the module with stack.mjs clean <app> --generated " + mod);

const config = {
  version: configVersion,
  floorplan,
  project: { name: mod, title, description: flag("description") || title, namespace: ns, ui5Version,
    sapux: floorplan.startsWith("FE_"), enableTypeScript: typescript,
    targetFolder: (isCap ? path.join(root, "app") : root).replace(/\\/g, "/") },
  service,
  entityConfig: entity ? { mainEntity: { entityName: entity }, ...(nav ? { navigationEntity: { entityName: nav } } : {}) } : null,
  deployConfig: null, flpConfig: null
};
const work = path.join(root, ".intent2code");
fs.mkdirSync(path.join(work, "logs"), { recursive: true });
if (!fs.existsSync(path.join(work, "logs", ".gitignore"))) fs.writeFileSync(path.join(work, "logs", ".gitignore"), "*\n");
const configFile = path.join(work, "generator-" + mod + ".json");
fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");

// ── run the generator (global yo, no shell) ──────────────────────────────────────────────────
/**
 * Global node_modules without reading any npm configuration file: the npm prefix variable, else the platform
 * default when it holds yo, else npm itself answers once (`npm root -g`, started with this node binary — no shell).
 * @returns {string} absolute path of the global node_modules folder
 */
function globalRoot() {
  const win = process.platform === "win32";
  const fromPrefix = (p) => (win ? path.join(p, "node_modules") : path.join(p, "lib", "node_modules"));
  const env = process.env.npm_config_prefix || process.env.NPM_CONFIG_PREFIX;
  if (env) return fromPrefix(env);
  const def = fromPrefix(win ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "npm") : path.dirname(path.dirname(process.execPath)));
  if (fs.existsSync(path.join(def, "yo", "package.json"))) return def;
  const npmCli = win ? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
    : path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
  try { return execFileSync(process.execPath, [npmCli, "root", "-g"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60000, windowsHide: true }).trim() || def; }
  catch { return def; }
}
const yoPkg = path.join(globalRoot(), "yo", "package.json");
if (!fs.existsSync(yoPkg)) fail(2, "yo is not installed globally — run preflight.mjs and its FIX commands");
const yoCli = path.join(path.dirname(yoPkg), readJson(yoPkg).bin?.yo || "lib/cli.js");
const logFile = path.join(work, "logs", "generator-" + mod + ".log");
const t0 = Date.now();
const genCode = await new Promise((resolve) => {
  const log = fs.openSync(logFile, "w");
  const child = spawn(process.execPath, [yoCli, "@sap/fiori:headless", configFile, "--force", "--no-insight", "--skipInstall"],
    { cwd: root, stdio: ["ignore", log, log], windowsHide: true, env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } });
  const timer = setTimeout(() => child.kill(), 600000);
  child.on("close", (c) => { clearTimeout(timer); fs.closeSync(log); resolve(c ?? 1); });
  child.on("error", () => { clearTimeout(timer); resolve(1); });
});
const secs = Math.round((Date.now() - t0) / 1000);
const logTail = () => fs.readFileSync(logFile, "utf8").replace(/\x1b\[[0-9;]*m/g, "").trim().split(/\r?\n/).slice(-8).join("\n  ");
if (!fs.existsSync(manifest)) fail(1, "the generator did not create " + path.relative(root, manifest) + " (exit " + genCode + ", " + secs + " s). Log: " + path.relative(process.cwd(), logFile) + "\n  " + logTail() + "\nFallback: STEP 8 built-in scaffold (scaffold_app / reference app) — record scaffold_method: built-in (fallback).");

// ── CAP apps: no fiori-tools-appreload under cds-plugin-ui5 (static check 8 — EADDRINUSE on every restart) ──
let appreload = "n/a (standalone app)";
if (isCap) {
  const y = path.join(appDir, "ui5.yaml");
  const t = fs.existsSync(y) ? fs.readFileSync(y, "utf8") : "";
  if (/- name:\s*fiori-tools-appreload/.test(t)) {
    const out = []; let skip = null;
    for (const l of t.split(/\r?\n/)) {
      const m = l.match(/^(\s*)- name:\s*fiori-tools-appreload\s*$/);
      if (m) { skip = m[1].length; continue; }
      if (skip !== null) { if (l.trim() && l.match(/^(\s*)/)[1].length <= skip) skip = null; else continue; }
      out.push(l.replace(/(afterMiddleware:\s*)fiori-tools-appreload\b/, "$1compression"));   // what ran after it now runs after compression
    }
    fs.writeFileSync(y, out.join(t.includes("\r\n") ? "\r\n" : "\n"));
    appreload = "removed from ui5.yaml";
  } else appreload = "not present";
}

// ── TypeScript app inside CAP: npm workspaces install @sapui5/types in the ROOT node_modules, but the generated
//    tsconfig.json looks only in the app folder → `tsc --noEmit` (the prebuild of npm run build, so mbt build)
//    fails with "Cannot find module sap/..." although cds watch works. Add the root paths. ──
let typeRoots = "n/a";
if (isCap && typescript) {
  const tc = path.join(appDir, "tsconfig.json");
  try {
    const text = fs.readFileSync(tc, "utf8");
    const j = JSON.parse(text.replace(/^\uFEFF/, ""));
    const roots = (j.compilerOptions && j.compilerOptions.typeRoots) || [];
    const add = ["../../node_modules/@types", "../../node_modules/@sapui5/types"].filter((r) => !roots.includes(r));
    if (add.length) {
      j.compilerOptions = { ...(j.compilerOptions || {}), typeRoots: [...roots, ...add] };
      const nl = text.includes("\r\n") ? "\r\n" : "\n";
      fs.writeFileSync(tc, JSON.stringify(j, null, 2).replace(/\n/g, nl) + nl);
      typeRoots = "root node_modules type paths added (npm workspaces)";
    } else typeRoots = "already set";
  } catch (e) { typeRoots = "❌ tsconfig.json not updated: " + e.message; }
}

// ── standalone freestyle: the offline mock server the UI builder always wires (start:mock, runtime checks in
//    UI mode). Declared here so the one npm install after this script covers it — no second install later. ──
let mockServer = "n/a";
if (type === "freestyle-ui5") {
  const pj = path.join(appDir, "package.json");
  const text = fs.readFileSync(pj, "utf8");
  const j = JSON.parse(text.replace(/^\uFEFF/, ""));
  const name = "@sap-ux/ui5-middleware-fe-mockserver";
  if (j.devDependencies && j.devDependencies[name]) mockServer = "already declared";
  else {
    let range = "2";
    try { const v = loaded.stack.packages.app[name]; range = typeof v === "string" ? v : (v && v.range) || range; } catch { /* stack.json default */ }
    j.devDependencies = { ...(j.devDependencies || {}), [name]: range };
    const nl = text.includes("\r\n") ? "\r\n" : "\n";
    fs.writeFileSync(pj, JSON.stringify(j, null, 2).replace(/\n/g, nl) + nl);
    mockServer = "devDependency " + name + " " + range + " added";
  }
}

// ── snapshot + versions + workspaces ─────────────────────────────────────────────────────────
const stackRun = (args) => { try { return { ok: true, out: execFileSync(process.execPath, [stackCli, ...args], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300000, windowsHide: true }) }; } catch (e) { return { ok: false, out: String(e.stdout || "") + String(e.stderr || "") }; } };
const snap = stackRun(["snapshot", appDir]);
const appRoot = isCap ? root : appDir;
const apply = stackRun(["apply", appRoot]);
let workspaces = "n/a (standalone app)";
if (isCap) {
  const pj = path.join(root, "package.json");
  const text = fs.readFileSync(pj, "utf8");
  const j = JSON.parse(text.replace(/^\uFEFF/, ""));
  const ws = Array.isArray(j.workspaces) ? j.workspaces : [];
  if (ws.includes("app/*")) workspaces = "already set";
  else {
    j.workspaces = [...ws, "app/*"];
    const indent = (text.match(/^\{\r?\n([ \t]+)"/) || [, "  "])[1];
    fs.writeFileSync(pj, JSON.stringify(j, null, indent) + (text.endsWith("\n") ? (text.includes("\r\n") ? "\r\n" : "\n") : ""));
    workspaces = "added \"app/*\"";
  }
}
const appRel = path.relative(process.cwd(), appRoot).replace(/\\/g, "/") || ".";
console.log("scaffold-ui — " + type + " → " + path.relative(process.cwd(), appDir).replace(/\\/g, "/") + "\n");
console.log("| Step | Result |\n|---|---|");
console.log("| Generator config | " + path.relative(process.cwd(), configFile).replace(/\\/g, "/") + " · floorplan " + floorplan + (floorplan === "FF_SIMPLE" ? (typescript ? " (TypeScript)" : " (JavaScript)") : "") + " · UI5 " + ui5Version + (service?.servicePath ? " · service " + service.servicePath : service?.edmx ? " · EDMX data source" : " · no service (freestyle)") + " |");
console.log("| Generator | ✅ webapp/manifest.json created in " + secs + " s (log " + path.relative(process.cwd(), logFile).replace(/\\/g, "/") + ") |");
console.log("| Snapshot (static check 14) | " + (snap.ok ? "✅ written" : "❌ " + snap.out.trim().split(/\r?\n/).pop()) + " |");
console.log("| stack.json versions | " + (apply.ok ? "✅ " + ((apply.out.match(/(\d+) change\(s\)/) || [, "0"])[1]) + " change(s)" : "❌ " + apply.out.trim().split(/\r?\n/).pop()) + " |");
console.log("| Root workspaces | " + workspaces + " |");
console.log("| fiori-tools-appreload (static check 8) | " + appreload + " |");
if (type === "freestyle-ui5") console.log("| Offline mock server | " + mockServer + " |");
if (isCap && typescript) console.log("| tsconfig typeRoots | " + typeRoots + " |");
console.log("\nNEXT (run it as its own command — an organisation policy may ask before npm install):\n  cd " + appRel + " && npm install");
process.exit(snap.ok && apply.ok ? 0 : 1);
