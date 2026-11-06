#!/usr/bin/env node
/**
 * free-port.mjs — stop the local dev server that is still listening on a port.
 *
 * Replaces the third-party kill-port npm package (downloaded and run on every call through npx). Zero dependencies, no shell: it asks the OS which process listens on the port and stops it
 * ONLY when that process is node (a leftover `npm run watch` / `cds watch`). Anything else is
 * reported and left alone.
 *
 * Usage:   node <this-skill>/scripts/free-port.mjs <port> [--dry-run]
 * Exit:    0 = port is free (or was freed) · 1 = port held by a non-node process · 2 = usage / OS error
 */
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const port = Number(args.find((a) => !a.startsWith("--")));
const dryRun = args.includes("--dry-run");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("usage: node free-port.mjs <port 1-65535> [--dry-run]");
  process.exit(2);
}
const run = (cmd, argv) => execFileSync(cmd, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });

/** PIDs listening on the port. */
function listeners() {
  if (process.platform === "win32") {
    const out = run("netstat", ["-ano", "-p", "TCP"]);
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const c = line.trim().split(/\s+/);
      // Proto  Local-Address  Foreign-Address  State  PID
      if (c.length >= 5 && /^TCP/i.test(c[0]) && /LISTEN/i.test(c[3]) && c[1].endsWith(":" + port)) pids.add(Number(c[4]));
    }
    return [...pids].filter((p) => p > 0);
  }
  try { return run("lsof", ["-nP", "-iTCP:" + port, "-sTCP:LISTEN", "-t"]).split(/\s+/).filter(Boolean).map(Number); }
  catch (e) { if (e.status === 1) return []; throw e; }   // lsof exits 1 when nothing listens
}

/** Executable name of a PID ("node.exe", "node", …). */
function processName(pid) {
  if (process.platform === "win32") {
    const out = run("tasklist", ["/FI", "PID eq " + pid, "/FO", "CSV", "/NH"]).trim();
    return (out.match(/^"([^"]+)"/) || [])[1] || "";
  }
  return run("ps", ["-p", String(pid), "-o", "comm="]).trim().split("/").pop();
}

try {
  const pids = listeners();
  if (!pids.length) { console.log("port " + port + " is free"); process.exit(0); }
  let blocked = 0;
  for (const pid of pids) {
    const name = processName(pid);
    if (!/^node(\.exe)?$/i.test(name)) {
      console.log("port " + port + ": PID " + pid + " (" + (name || "unknown") + ") is not a node process — left running; choose another port");
      blocked++;
      continue;
    }
    if (dryRun) { console.log("port " + port + ": would stop PID " + pid + " (" + name + ")"); continue; }
    if (process.platform === "win32") run("taskkill", ["/PID", String(pid), "/T", "/F"]);
    else process.kill(pid, "SIGTERM");
    console.log("port " + port + ": stopped PID " + pid + " (" + name + ")");
  }
  process.exit(blocked ? 1 : 0);
} catch (e) {
  console.error("free-port: could not inspect port " + port + " — " + e.message);
  process.exit(2);
}
