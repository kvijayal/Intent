#!/usr/bin/env node
/**
 * start-http.mjs — start the Intent2Code MCP server over HTTP (default port 3999), installing its
 * dependencies first when they are missing or out of date.
 *
 * Run by the VS Code folder-open task (.vscode/tasks.json) and by `npm run start-http`, so a freshly
 * unzipped plugin folder needs no manual step.
 *
 *   1. Port already answering → another instance is serving; exit 0 (nothing is installed or started).
 *   2. Dependencies missing, or package-lock.json changed since the last install →
 *      `npm ci --ignore-scripts --no-audit --no-fund`: exact versions from package-lock.json, no package
 *      lifecycle scripts, run with the npm that ships with this Node.js (no shell).
 *   3. Start index.js --http in this process.
 *
 * Every failure is printed as "[intent2code] HTTP server error: …" — the task's problem matcher shows it
 * in the VS Code Problems panel.
 *
 * Usage: node mcp-server/start-http.mjs [--port=3999]
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const portArg = args.find((a) => a.startsWith("--port="));
const port = portArg ? parseInt(portArg.split("=")[1], 10) : 3999;
const log = (msg) => console.error("[intent2code] " + msg);
// "<file>: <message>" — the VS Code task's problem matcher needs a file to list the error in the Problems panel
const fail = (msg) => { log("HTTP server error: mcp-server/start-http.mjs: " + msg); process.exit(1); };

/** true when something already accepts connections on 127.0.0.1:<port> */
const portInUse = () => new Promise((resolve) => {
  const s = net.connect({ host: "127.0.0.1", port }, () => { s.destroy(); resolve(true); });
  s.on("error", () => resolve(false));
  s.setTimeout(1500, () => { s.destroy(); resolve(false); });
});

if (await portInUse()) {
  log("Port " + port + " already in use — server is already running.");
  process.exit(0);
}

// ── dependencies ────────────────────────────────────────────────────────────────────────────
const lockFile = path.join(here, "package-lock.json");
if (!fs.existsSync(lockFile)) fail("mcp-server/package-lock.json is missing — the plugin copy is incomplete; unzip the release again");
const lockText = fs.readFileSync(lockFile, "utf8");
const lockHash = crypto.createHash("sha256").update(lockText).digest("hex");
const marker = path.join(here, "node_modules", ".intent2code-lock.sha256");
const sdkPkg = path.join(here, "node_modules", "@modelcontextprotocol", "sdk", "package.json");

function installedMatchesLock() {
  if (!fs.existsSync(sdkPkg)) return false;
  try { return fs.readFileSync(marker, "utf8").trim() === lockHash; } catch { /* no marker yet */ }
  // Installed by hand before this launcher existed: accept it when the SDK version is the locked one.
  try {
    const want = JSON.parse(lockText).packages?.["node_modules/@modelcontextprotocol/sdk"]?.version;
    const have = JSON.parse(fs.readFileSync(sdkPkg, "utf8")).version;
    if (want && want === have) { fs.writeFileSync(marker, lockHash + "\n"); return true; }
  } catch { /* fall through to a clean install */ }
  return false;
}

/** npm-cli.js of the npm that ships with this Node.js (Windows: <node dir>/node_modules/npm, POSIX: <prefix>/lib/node_modules/npm). */
function npmCli() {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    process.env.npm_execpath,
    path.join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")
  ];
  return candidates.find((c) => c && /npm-cli\.js$/.test(c) && fs.existsSync(c)) || null;
}

if (!installedMatchesLock()) {
  const cli = npmCli();
  if (!cli) fail("npm was not found next to " + process.execPath + " — run npm ci --ignore-scripts in mcp-server once, then reopen the folder");
  log("Installing the MCP server dependencies from package-lock.json (first start or plugin update — about a minute) …");
  const r = spawnSync(process.execPath, [cli, "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: here, stdio: ["ignore", "inherit", "inherit"], windowsHide: true, timeout: 600000 });
  if (r.status !== 0) fail("npm ci failed (" + (r.error ? r.error.message : "exit " + r.status) + ") — check the network / npm registry access, then run Terminal → Run Task → Intent2Code MCP server (HTTP :3999)");
  if (!fs.existsSync(sdkPkg)) fail("npm ci finished but @modelcontextprotocol/sdk is not installed — run npm ci --ignore-scripts in mcp-server and read its output");
  fs.writeFileSync(marker, lockHash + "\n");
  log("Dependencies installed.");
}

// ── start the server (index.js reads its options from process.argv) ─────────────────────────
process.argv = [process.argv[0], path.join(here, "index.js"), "--http", "--port=" + port];
await import(pathToFileURL(path.join(here, "index.js")).href);
