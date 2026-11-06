// Shared access to Intent2Code's stack.json (single source of truth for versions) for MCP tools.
// loadStackSync(): ranges only, no network. getResolvedStack(): full resolution incl. the verified
// UI5 patch (network / cache / lock). Both return null instead of throwing, so tools keep working.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STACK_CLI = path.join(PLUGIN_ROOT, ".claude", "skills", "sap-conventions", "scripts", "stack.mjs");

function strip(v) {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith("$")).map(([k, x]) => [k, strip(x)]));
  return v;
}

export function loadStackSync() {
  try { return strip(JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "stack.json"), "utf8").replace(/^\uFEFF/, ""))); }
  catch { return null; }
}

let resolvedPromise = null;
export function getResolvedStack() {
  if (!resolvedPromise) {
    resolvedPromise = (async () => {
      try { const lib = await import(pathToFileURL(STACK_CLI).href); return await lib.resolveStack(lib.loadStack()); }
      catch { return null; }
    })();
  }
  return resolvedPromise;
}

/** Range for a package from stack.json packages.<group> (string or {range}). */
export function stackRange(group, name, fallback) {
  const v = loadStackSync()?.packages?.[group]?.[name];
  return (typeof v === "string" ? v : v?.range) || fallback;
}
