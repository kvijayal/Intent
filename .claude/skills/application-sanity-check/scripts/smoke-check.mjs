#!/usr/bin/env node
/**
 * smoke-check.mjs — the RUNTIME CHECKS 1–10 of a generated app as ONE deterministic command.
 *
 * Replaces hand-run steps (port check, background `cds watch`, log polling, HTTP probes,
 * port killing). Starts the project's own dev server on a free port, probes what a browser needs, and
 * always stops the server again. Nothing is downloaded (no npx, no curl) and nothing outside
 * localhost is contacted.
 *
 * Two modes, picked automatically:
 *   CAP  (a CAP project: local @sap/cds-dk) — `cds serve all --with-mocks --in-memory?`, i.e. what
 *        `npm run watch` runs without file watching, livereload or --open, cwd = project root, so the
 *        same single @sap/cds resolution root as `npm run watch` (CLAUDE.md hard rule 5).
 *   UI   (a standalone UI5 / Fiori app: webapp/manifest.json + ui5*.yaml, no CAP) — the local
 *        `fiori run` (or `ui5 serve`) with ui5-mock.yaml (else ui5-local.yaml, else ui5.yaml): the
 *        offline mock server answers the OData calls.
 *
 *   1   server starts (READY) and the startup log has no fatal error (this also proves the model compiles)
 *   2   every OData service answers $metadata with 200 (CAP: `cds compile --to serviceinfo`;
 *       UI: manifest dataSources — absolute URLs are external and not probed)
 *   3   the main entity set returns 200 (from the manifest route, else the first entity set)
 *   4   every UI is served: CAP /<ui5.yaml metadata.name>/index.html · UI /index.html (else /test/flp.html)
 *   5–10 (--render) ui-render-check.mjs in headless Chrome/Edge against that URL, merged into this table —
 *       for the start page AND every other Fiori Elements list page of the manifest ("Departments:?query:"
 *       → #/Departments), plus each --route; one set of rows 5–10 per page
 *
 * Usage:   node <this-skill>/scripts/smoke-check.mjs <project-root> [--port 4004] [--entity Name] [--render] [--route "#/Hash"]… [--timeout 420]
 * Exit:    0 = no FAIL · 1 = FAIL · 2 = usage / setup error
 */
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
/**
 * The path exactly as Windows stores it (drive letter + folder case). VS Code hands the workspace to
 * Claude Code as "c:\…"; CAP compares file paths as strings, so a server started from "c:\…" sees db/data
 * once as "c:\…" and once (from the loaded model files) as "C:\…" — every seed CSV is imported twice
 * ("UNIQUE constraint failed") and the outbox model is added. Measured on CAP 9.9.
 */
const canonical = (p) => { try { return fs.realpathSync.native(p); } catch { return p; } };
const root = canonical(path.resolve(argv.find((a, i) => !a.startsWith("--") && !["--port", "--entity", "--timeout", "--route"].includes(argv[i - 1])) || "."));
const wantRender = argv.includes("--render");
/** Extra screens for the browser checks, e.g. --route "#/Settings" (repeatable). */
const extraRoutes = argv.flatMap((a, i) => (a === "--route" && argv[i + 1] ? ["#" + argv[i + 1].replace(/^#/, "")] : []));
// the first `fiori run` with the mock server can take several minutes on a cold machine (measured 211 s)
const TIMEOUT_DEFAULT = 420;   // + probes + browser check stays under the 10-minute Bash tool limit
const TIMEOUT = Number(opt("timeout", TIMEOUT_DEFAULT)) * 1000;
if (!fs.existsSync(path.join(root, "package.json"))) { console.error("usage: node smoke-check.mjs <project-root> [--port N] [--entity Name] [--render]  (no package.json in " + root + ")"); process.exit(2); }

const results = [];
const add = (id, title, status, detail) => results.push({ id, title, status, detail });
const BROWSER_TITLES = { 5: "UI5 core loaded", 6: "A page rendered", 7: "No fatal console errors", 8: "No failed requests (>= 400)", 9: "First row opens its detail page", 10: "Save (empty partial update) accepted" };
/** Runtime checks 5–10 not run: one row each, so every number is always reported (never as PASS). */
const browserSkip = (why, status = "SKIP") => { for (const id of [5, 6, 7, 8, 9, 10]) add(id, BROWSER_TITLES[id], id === 5 ? status : "SKIP", id === 5 ? why : "not run"); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, ""));
const exists = (f) => fs.existsSync(f);

/** `<pkg>`'s bin script installed in root or an ancestor's node_modules (never npx); null if missing. */
function localBin(pkg, binName) {
  for (let d = root; ; d = path.dirname(d)) {
    const pj = path.join(d, "node_modules", ...pkg.split("/"), "package.json");
    if (exists(pj)) {
      try { const bin = readJson(pj).bin; const r = typeof bin === "string" ? bin : bin?.[binName]; return r ? path.join(path.dirname(pj), r) : null; }
      catch { return null; }
    }
    if (path.dirname(d) === d) return null;
  }
}

// ── mode ─────────────────────────────────────────────────────────────────────────────────────
const rootPkg = readJson(path.join(root, "package.json"));
const deps = { ...rootPkg.dependencies, ...rootPkg.devDependencies };
const cdsBin = localBin("@sap/cds-dk", "cds");
const capProject = !!deps["@sap/cds"] || exists(path.join(root, "srv")) || exists(path.join(root, "db"));
const uiYaml = ["ui5-mock.yaml", "ui5-local.yaml", "ui5.yaml"].find((f) => exists(path.join(root, f)));
const mode = capProject ? "CAP" : (exists(path.join(root, "webapp", "manifest.json")) && uiYaml ? "UI" : null);
if (!mode) { console.error("smoke-check: " + root + " is neither a CAP project nor a standalone UI5 app (webapp/manifest.json + ui5*.yaml)."); process.exit(2); }
if (mode === "CAP" && !cdsBin) { console.error("smoke-check: @sap/cds-dk is not installed in " + root + " — run npm install there first."); process.exit(2); }
const uiBin = mode === "UI" ? (localBin("@sap/ux-ui5-tooling", "fiori") ? { bin: localBin("@sap/ux-ui5-tooling", "fiori"), cmd: "run" } : localBin("@ui5/cli", "ui5") ? { bin: localBin("@ui5/cli", "ui5"), cmd: "serve" } : null) : null;
if (mode === "UI" && !uiBin) { console.error("smoke-check: neither @sap/ux-ui5-tooling (fiori) nor @ui5/cli (ui5) is installed in " + root + " — run npm install there first."); process.exit(2); }

// ── free port (never kills anything: an occupied port is simply skipped) ─────────────────────
// Bind the way the servers do (all interfaces): a 127.0.0.1-only probe misses an IPv6 :: listener on Windows.
const isFree = (p) => new Promise((res) => { const s = net.createServer().once("error", () => res(false)).once("listening", () => s.close(() => res(true))).listen(p); });
let port = Number(opt("port", mode === "CAP" ? 4004 : 8080));
if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error("smoke-check: --port must be 1-65535"); process.exit(2); }
for (let i = 0; i < 50 && !(await isFree(port)); i++) port++;
const base = "http://localhost:" + port;
/** Join URL parts with exactly one "/" between them (keeps a trailing "/" only on the last part). */
const joinUrl = (...parts) => parts.map((p, i) => {
  const s = String(p);
  return i === 0 ? s.replace(/\/+$/, "") : i === parts.length - 1 ? s.replace(/^\/+/, "") : s.replace(/^\/+|\/+$/g, "");
}).filter((s, i) => i === 0 || s !== "").join("/");

// ── what to probe ────────────────────────────────────────────────────────────────────────────
/** UI modules: CAP → app/*; UI → the root itself. */
const uiModules = [];
const addModule = (dir, folder) => {
  const mf = path.join(dir, "webapp", "manifest.json");
  if (!exists(mf)) return;
  const y = path.join(dir, "ui5.yaml");
  const name = exists(y) ? (fs.readFileSync(y, "utf8").match(/^metadata:\s*\r?\n\s+name:\s*["']?([^"'\s]+)/m) || [])[1] : null;
  uiModules.push({ folder, dir, name, manifest: mf });
};
if (mode === "CAP") { const appDir = path.join(root, "app"); if (exists(appDir)) for (const e of fs.readdirSync(appDir, { withFileTypes: true })) if (e.isDirectory()) addModule(path.join(appDir, e.name), e.name); }
else addModule(root, ".");

/** OData services: CAP → serviceinfo; UI → manifest dataSources (relative URIs only, served by the mock / proxy). */
let services = [];
if (mode === "CAP") {
  try {
    const out = execFileSync(process.execPath, [cdsBin, "compile", "srv", "--to", "serviceinfo"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 300000, windowsHide: true });
    services = JSON.parse(out || "[]").filter((s) => (s.endpoints || [{ kind: "odata" }]).some((e) => /odata/i.test(e.kind || "odata"))).map((s) => ({ name: s.name, path: "/" + String(s.urlPath).replace(/^\//, "").replace(/\/?$/, "/"), v2: false }));
  } catch { /* reported as runtime check 2 */ }
} else {
  const ds = readJson(uiModules[0].manifest)["sap.app"]?.dataSources || {};
  for (const [name, d] of Object.entries(ds)) {
    if ((d.type || "OData") !== "OData") continue;
    const uri = String(d.uri || "");
    if (/^https?:/i.test(uri)) { add(2, "OData $metadata answers 200 (" + name + ")", "SKIP", "" + uri + " is an absolute external URL — not served locally (use the mock config)"); continue; }
    services.push({ name, path: "/" + uri.replace(/^\.?\//, "").replace(/\/?$/, "/"), v2: d.settings?.odataVersion === "2.0" });
  }
}
/**
 * Fiori Elements list pages other than the start page — "Departments:?query:" → "#/Departments" — so the
 * browser checks open every list screen (and its first detail page), not only the start page. Object pages
 * ("Departments({key}):?query:") are reached through row navigation; freestyle routes need --route.
 */
function listRoutes(manifestFile) {
  try {
    const r = readJson(manifestFile)["sap.ui5"]?.routing || {};
    const routes = Array.isArray(r.routes) ? r.routes : Object.entries(r.routes || {}).map(([name, v]) => ({ name, ...v }));
    const LIST = /^sap\.fe\.(templates\.(ListReport|AnalyticalListPage)|core\.fpm)$/;
    const out = [];
    for (const rt of routes) {
      const pattern = String(rt.pattern ?? "").replace(/:\?query:$/, "").replace(/^\//, "");
      if (!pattern || /[{(]/.test(pattern)) continue;
      const target = [].concat(rt.target || [])[0];
      if (LIST.test(String(r.targets?.[target]?.name || ""))) out.push("#/" + pattern);
    }
    return [...new Set(out)];
  } catch { return []; }
}

/** Main entity: --entity, else the contextPath/entitySet of the first FE route, else the first entity set in $metadata. */
function manifestEntity() {
  for (const m of uiModules) {
    try {
      const j = readJson(m.manifest);
      for (const t of Object.values(j["sap.ui5"]?.routing?.targets || {})) {
        const s = t?.options?.settings || {};
        const e = s.entitySet || (s.contextPath || "").replace(/^\//, "").split("/")[0];
        if (e) return e;
      }
    } catch { /* ignore */ }
  }
  return null;
}

// ── start the server ─────────────────────────────────────────────────────────────────────────
// Inside the project so the agent can Read it without an approval (the system temp folder is outside
// the workspace). The folder ignores itself in git.
const logDir = path.join(root, ".intent2code", "logs");
fs.mkdirSync(logDir, { recursive: true });
if (!exists(path.join(logDir, ".gitignore"))) fs.writeFileSync(path.join(logDir, ".gitignore"), "*\n");
const logFile = path.join(logDir, "smoke-" + port + ".log");
const logRel = path.relative(root, logFile).replace(/\\/g, "/");
const log = fs.openSync(logFile, "w");
const serverArgs = mode === "CAP"
  ? [cdsBin, "serve", "all", "--with-mocks", "--in-memory?", "--port", String(port)]
  : [uiBin.bin, uiBin.cmd, "--config", uiYaml, "--port", String(port)];
const child = spawn(process.execPath, serverArgs,
  { cwd: root, stdio: ["ignore", log, log], windowsHide: true, detached: process.platform !== "win32", env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", BROWSER: "none" } });
let exited = null;
child.on("exit", (code) => { exited = code ?? -1; });
function stop() {
  if (exited !== null) return;
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    else process.kill(-child.pid, "SIGTERM");
  } catch { try { child.kill(); } catch { /* already gone */ } }
}
process.on("exit", stop);
process.on("SIGINT", () => { stop(); process.exit(130); });

const FATAL = /\[ERROR\]|\bError:|loaded from different locations|EADDRINUSE|Cannot find module|Failed loading service implementation|npm ERR!/i;
const readLog = () => { try { return fs.readFileSync(logFile, "utf8").replace(/\x1b\[[0-9;]*m/g, ""); } catch { return ""; } };
const status = async (url) => { try { return (await fetch(url, { signal: AbortSignal.timeout(30000), redirect: "manual" })).status; } catch { return 0; } };
const pageCandidates = () => mode === "UI" ? [joinUrl(base, "index.html"), joinUrl(base, "test/flp.html")] : [];
const t0 = Date.now();
let state = "TIMEOUT";
while (Date.now() - t0 < TIMEOUT) {
  const text = readLog();
  if (mode === "CAP" && /server listening/.test(text)) { state = "READY"; break; }
  if (mode === "UI" && (await status(joinUrl(base, "index.html"))) > 0) { state = "READY"; break; }
  if (FATAL.test(text) || exited !== null) { state = "STARTUP-ERROR"; break; }
  await sleep(1000);
}
const secs = Math.round((Date.now() - t0) / 1000);
const logText = readLog();
const errLines = logText.split(/\r?\n/).filter((l) => FATAL.test(l) && !/^\[WARNING\]/.test(l)).slice(0, 5);
add(1, "Server starts without errors (" + (mode === "CAP" ? "cds serve" : ("" + (uiBin.cmd === "run" ? "fiori run" : "ui5 serve") + " --config " + uiYaml)) + ")", state === "READY" && !errLines.length ? "PASS" : "FAIL",
  state === "READY" ? (errLines.length ? "listening after " + secs + "s, but the log has errors: " + errLines.join(" · ") : "listening on " + base + " after " + secs + "s")
    : state === "TIMEOUT" ? "not listening after " + secs + "s (slow machine? see " + logRel + ") — do not restart blindly"
    : "startup error after " + secs + "s: " + (errLines.join(" · ") || logText.split(/\r?\n/).slice(-5).join(" · ")).slice(0, 400) +
      (/Cannot find module|Could not find|could not be found|MODULE_NOT_FOUND/i.test(logText) ? " — a dependency declared in a package.json is not installed: run npm install at the project root (after stack.mjs apply), then re-run" : ""));

if (state === "READY") {
  // runtime 2 · $metadata
  if (!services.length && !results.some((r) => r.id === 2)) add(2, "OData $metadata answers 200", mode === "CAP" ? "FAIL" : "SKIP", mode === "CAP" ? "cds compile --to serviceinfo returned no OData service" : "manifest declares no local OData dataSource");
  let metadataXml = "";
  for (const s of services) {
    const url = joinUrl(base, s.path, "$metadata");
    const code = await status(url);
    if (code === 200 && !metadataXml) { try { metadataXml = await (await fetch(url)).text(); } catch { /* ignore */ } }
    add(2, "OData $metadata answers 200 (" + s.name + ")", code === 200 ? "PASS" : "FAIL",
      "" + url + " → " + (code || "no response") + (code === 401 ? " — dev auth is not dummy (static check 10)" : code === 404 ? (mode === "CAP" ? " — wrong service path" : " — no mock/proxy route for this path in " + uiYaml) : code >= 500 ? " — server error, see " + logRel : ""));
  }
  // runtime 3 · main entity set
  const entity = opt("entity") || manifestEntity() || (metadataXml.match(/<EntitySet Name="(?!DraftAdministrativeData)([^"]+)"/) || [])[1];
  if (!entity || !services.length) add(3, "Main entity set returns 200", "SKIP", services.length ? "no entity set found" : "no OData service to probe");
  else {
    const svc = services.find((s) => metadataXml.includes("EntitySet Name=\"" + entity + "\"")) || services[0];
    const url = joinUrl(base, svc.path, "" + entity + "?$top=1" + (svc.v2 ? "&$format=json" : ""));
    const code = await status(url);
    add(3, "Main entity set returns 200 (" + entity + ")", code === 200 ? "PASS" : "FAIL",
      "" + url + " → " + (code || "no response") + (code === 400 ? " — broken $select/$expand (virtual field?)" : code === 404 ? " — entity name is case-sensitive" : ""));
  }
  // runtime 4 · UI pages
  if (!uiModules.length) add(4, "UI app is served", "SKIP", "no webapp/manifest.json");
  const appUrls = [];
  for (const m of uiModules) {
    const candidates = mode === "CAP" ? [m.name && joinUrl(base, m.name, "index.html"), joinUrl(base, m.folder, "webapp/index.html")].filter(Boolean) : pageCandidates();
    let hit = null;
    for (const u of candidates) if ((await status(u)) === 200) { hit = u; break; }
    if (hit && hit.endsWith("flp.html")) appUrls.push(hit + "#app-preview");
    else if (hit) for (const h of ["", ...listRoutes(m.manifest), ...extraRoutes]) if (!appUrls.includes(hit + h)) appUrls.push(hit + h);
    add(4, "UI app is served (" + (m.folder === "." ? "standalone" : m.folder) + ")", hit ? "PASS" : "FAIL",
      hit ? "" + hit + " → 200" : "" + candidates.join(" , ") + " → not 200 — " + (mode === "CAP" ? "check cds-plugin-ui5 in devDependencies, the root \"workspaces\"/\"sapux\" entry and app/" + m.folder + "/package.json" : "check webapp/index.html and the ui5*.yaml middlewares"));
  }
  // runtime 5–10 · real browser (ui-render-check.mjs --json), merged into this table
  if (wantRender) {
    const rc = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui-render-check.mjs");
    if (!appUrls.length) browserSkip("no served UI app");
    for (const u of appUrls) {
      let out = "", err = "";
      try { out = execFileSync(process.execPath, [rc, u, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 240000, windowsHide: true }); }
      catch (e) { out = String(e.stdout || ""); err = String(e.stderr || ""); }
      let rows = null;
      try { rows = JSON.parse(out.trim().split(/\r?\n/).pop()); } catch { /* reported below */ }
      if (!Array.isArray(rows)) { browserSkip("the browser check did not return a result (" + (out + " " + err).trim().slice(-160) + ")", "FAIL"); continue; }
      const [pagePath, hash] = u.replace(base, "").split("#");
      const page = (uiModules.length > 1 ? pagePath + " " : "") + (hash ? "#" + hash : "start page");
      for (const r of rows) add(r.id, r.title + (appUrls.length > 1 ? " (" + page + ")" : ""), r.status, r.detail);
    }
  } else browserSkip("browser checks not requested (run with --render)");
} else {
  for (const [id, title] of [[2, "OData $metadata answers 200"], [3, "Main entity set returns 200"], [4, "UI app is served"]]) add(id, title, "SKIP", "not run — the server did not start (runtime check 1)");
  browserSkip("not run — the server did not start (runtime check 1)");
}

stop();
await sleep(500);

// ── report: runtime checks 1–10, always in number order ──────────────────────────────────────
results.sort((a, b) => a.id - b.id);
const icon = { PASS: "✅ PASS", FAIL: "❌ FAIL", WARN: "⚠️ WARN", SKIP: "— SKIP" };
console.log("Runtime checks (" + mode + " mode) — " + root + "\n");
console.log("| # | Check | Result | Detail |\n|---|---|---|---|");
for (const r of results) console.log("| " + r.id + " | " + r.title + " | " + icon[r.status] + " | " + String(r.detail).replace(/\|/g, "\\|").replace(/\r?\n/g, " ") + " |");
const fails = results.filter((r) => r.status === "FAIL").length;
console.log("\nSummary: " + fails + " FAIL · " + results.filter((r) => r.status === "WARN").length + " WARN · " + results.filter((r) => r.status === "PASS").length + " PASS · server log: " + logRel + " (Read it — it is inside the project; server stopped)");
process.exit(fails ? 1 : 0);
