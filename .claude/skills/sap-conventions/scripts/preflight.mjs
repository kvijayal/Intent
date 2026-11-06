#!/usr/bin/env node
/**
 * preflight.mjs — the /intent PRE-FLIGHT checks 2 and 3 as ONE command (CHECK 1, the MCP probe, stays a tool call).
 *
 *   • Yeoman + @sap/generator-fiori installed globally, and the headless generator loads (compatibility test)
 *   • global @sap/cds-dk present (scaffolding only — projects pin the stack.json major)
 *   • stack.json resolves (UI5 patch verified) — prints the STACK block every builder brief needs
 *   • plugin docs in sync with stack.json (warning only)
 *
 * Fast by design: tool versions are read from the global package.json files (no `cds --version`, `yo --version`,
 * `npm list -g` — each starts node and took minutes on scanned machines); the slow parts run in parallel and the
 * result is cached for 24 h in <workspace>/.intent2code/preflight.json (re-checked at once when node, stack.json or
 * a tool version changes). It never installs anything: a missing or broken tool is printed as a FIX command for
 * the agent to run, so the normal permission prompt of the developer still applies.
 *
 * Usage:   node .claude/skills/sap-conventions/scripts/preflight.mjs [--refresh] [--json]
 * Exit:    0 ready · 1 action needed (FIX lines) · 2 invalid stack.json · 3 UI5 line unresolvable (UI builds stop)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "..", "..", "..", "..");          // <workspace>/.claude/skills/sap-conventions/scripts
const stackCli = path.join(here, "stack.mjs");
const refresh = process.argv.includes("--refresh");
const asJson = process.argv.includes("--json");
const CACHE = path.join(workspace, ".intent2code", "preflight.json");
const TTL_MS = 24 * 3600 * 1000;

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "")); } catch { return null; } };
const sha = (f) => { try { return crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex"); } catch { return ""; } };

/** run a node script in a child process (no shell); resolves { code, out } */
const runNode = (args, timeoutMs) => new Promise((resolve) => {
  const child = spawn(process.execPath, args, { cwd: workspace, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let out = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { out += d; });
  const timer = setTimeout(() => { out += "\n(timed out after " + timeoutMs / 1000 + " s)"; child.kill(); }, timeoutMs);
  child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 1, out: out.replace(/\x1b\[[0-9;]*m/g, "") }); });
  child.on("error", (e) => { clearTimeout(timer); resolve({ code: 1, out: String(e.message) }); });
});

/**
 * Global node_modules without reading any npm configuration file: the npm prefix variable, else the platform
 * default when it holds one of the probed packages, else npm itself answers once (`npm root -g`, started with
 * this node binary — no shell).
 * @param {string[]} probes package names expected in the global folder
 * @returns {string} absolute path of the global node_modules folder
 */
function globalRoot(probes) {
  const win = process.platform === "win32";
  const fromPrefix = (p) => (win ? path.join(p, "node_modules") : path.join(p, "lib", "node_modules"));
  const env = process.env.npm_config_prefix || process.env.NPM_CONFIG_PREFIX;
  if (env) return fromPrefix(env);
  const def = fromPrefix(win ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "npm") : path.dirname(path.dirname(process.execPath)));
  if (probes.some((p) => fs.existsSync(path.join(def, ...p.split("/"), "package.json")))) return def;
  const npmCli = win ? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
    : path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
  try { return execFileSync(process.execPath, [npmCli, "root", "-g"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60000, windowsHide: true }).trim() || def; }
  catch { return def; }
}

// ── cheap facts (file reads; npm is asked only when the default global folder has none of the tools) ──
const stackFile = path.join(workspace, "stack.json");
const stack = readJson(stackFile);
const gen = stack?.generator || {};
const root = globalRoot(["yo", "@sap/generator-fiori", "@sap/cds-dk"]);
const pkgVersion = (name) => readJson(path.join(root, ...name.split("/"), "package.json"))?.version || null;
const facts = { node: process.version, stackSha: sha(stackFile), yo: pkgVersion("yo"), generator: pkgVersion("@sap/generator-fiori"), cdsDk: pkgVersion("@sap/cds-dk") };

let cache = refresh ? null : readJson(CACHE);
const cacheValid = !!cache && Date.now() - Date.parse(cache.at) < TTL_MS && ["node", "stackSha", "yo", "generator", "cdsDk"].every((k) => cache.facts?.[k] === facts[k]) && cache.ready;

const lines = [], fixes = [];
let exit = 0, brief = "", docsInSync = true, compat = "skipped";
if (cacheValid) {
  ({ brief, docsInSync, compat } = cache);
} else {
  const yoCli = facts.yo ? path.join(root, "yo", readJson(path.join(root, "yo", "package.json"))?.bin?.yo || "lib/cli.js") : null;
  const [compatRun, resolveRun, lintRun] = await Promise.all([
    yoCli && facts.generator ? runNode([yoCli, "@sap/fiori:headless", "--no-insight"], 240000) : Promise.resolve(null),
    runNode([stackCli, "resolve", "--brief"], 240000),
    runNode([stackCli, "lint", "--docs"], 240000)
  ]);
  if (compatRun) compat = /Please provide one of the following/.test(compatRun.out) ? "ok" : /this\.env\.error is not a function|this\.log is not a function/.test(compatRun.out) ? "yo-incompatible" : "failed: " + compatRun.out.trim().split(/\r?\n/).slice(-2).join(" ").slice(0, 200);
  brief = resolveRun.out.trim();
  if (resolveRun.code !== 0) exit = resolveRun.code === 3 ? 3 : 2;
  docsInSync = lintRun.code === 0;
}

// ── report ─────────────────────────────────────────────────────────────────────────────────────
const yoWant = gen.yo || "4", genWant = gen.fioriGenerator || "latest";
const yoMajor = Number(String(facts.yo || "0").split(".")[0]);
if (!facts.yo || !facts.generator) {
  lines.push("✗ Yeoman / @sap/generator-fiori not installed globally (yo " + (facts.yo || "missing") + ", generator " + (facts.generator || "missing") + ")");
  fixes.push("npm install -g yo@" + yoWant + " @sap/generator-fiori@" + genWant);
} else if (compat === "yo-incompatible" || yoMajor >= 5) {
  lines.push("✗ yo " + facts.yo + " cannot run @sap/generator-fiori (needs yo@" + yoWant + ")");
  fixes.push("npm install -g yo@" + yoWant);
} else if (compat !== "ok") {
  lines.push("✗ the headless Fiori generator does not load: " + compat);
  fixes.push("npm install -g yo@" + yoWant + " @sap/generator-fiori@" + genWant);
} else lines.push("✓ Yeoman " + facts.yo + " + @sap/generator-fiori " + facts.generator + " ready (headless generator loads)");
const cdsWant = stack?.cap?.compat?.[String(stack?.cap?.cdsMajor)]?.["@sap/cds-dk"] || "^9";
if (facts.cdsDk) lines.push("✓ global @sap/cds-dk " + facts.cdsDk + " (scaffolding only — projects pin " + cdsWant + " from stack.json)");
else { lines.push("✗ global @sap/cds-dk not installed (needed for `cds init`)"); fixes.push("npm install -g @sap/cds-dk@" + cdsWant); }
if (exit === 3) lines.push("✗ stack.json UI5 line cannot be resolved (offline, no cache or lock) — UI builds stop; go online once or set ui5.pin in stack.json");
else if (exit === 2) lines.push("✗ stack.json is invalid — see the STACK output below");
if (!docsInSync) lines.push("⚠ plugin docs show versions that differ from stack.json — maintainer: run stack.mjs sync-docs (builds are not affected)");
if (fixes.length && exit === 0) exit = 1;

const ready = exit === 0;
if (!cacheValid && ready) {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  if (!fs.existsSync(path.join(path.dirname(CACHE), ".gitignore"))) fs.writeFileSync(path.join(path.dirname(CACHE), ".gitignore"), "*\n");
  fs.writeFileSync(CACHE, JSON.stringify({ at: new Date().toISOString(), facts, ready, compat, brief, docsInSync }, null, 2) + "\n");
}
if (asJson) { console.log(JSON.stringify({ ready, exit, cached: cacheValid, facts, lines, fixes, brief }, null, 2)); process.exit(exit); }
console.log("PRE-FLIGHT — " + (cacheValid ? "cached from " + cache.at.slice(0, 16).replace("T", " ") + " UTC (valid 24 h; --refresh re-checks)" : "checked now"));
for (const l of lines) console.log(l);
if (brief) console.log("\n" + brief);
if (fixes.length) console.log("\nFIX — run each command as written (an install asks for approval), then re-run this script with --refresh:\n" + fixes.map((f) => "  " + f).join("\n"));
console.log("\nRESULT: " + (ready ? "ready" : exit === 1 ? "action needed" : "stop"));
process.exit(exit);
