// Replicated from https://github.com/UI5/mcp-server (Apache-2.0) — adapted for Intent2Code:
// parses the live version.json shape and reports the stack.json line/patch Intent2Code builds use.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { okText, errText } from "../_util.js";

const CDN = {
  SAPUI5:  "https://ui5.sap.com/version.json",
  OpenUI5: "https://sdk.openui5.org/version.json"
};
const STACK_CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".claude", "skills", "sap-conventions", "scripts", "stack.mjs");

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("HTTP " + res.status + " from " + url);
  return res.json();
}

/**
 * Normalise version.json. Live shape (2026): { latest:{version,support,lts}, active:{…},
 * "1.153":{version,support,lts}, …, "1.136":{version:"1.136.23",lts:true}, … }. // stack-ignore
 * The legacy shape { latest, lts, versions:[…] } is still accepted.
 */
export function parseVersionJson(raw) {
  let lines = [];
  if (Array.isArray(raw?.versions)) {
    lines = raw.versions.map((v) => ({ line: String(v.version).split(".").slice(0, 2).join("."), version: v.version, support: v.support || "Unknown", lts: !!v.lts, eom: !!v.eom }));
  } else {
    for (const [k, v] of Object.entries(raw || {})) {
      if (!/^\d+\.\d+$/.test(k) || !v || typeof v !== "object") continue;
      lines.push({ line: k, version: v.version, support: v.support || "Unknown", lts: !!v.lts, eom: /out of maintenance/i.test(v.support || "") });
    }
  }
  const byNum = (a, b) => { const [a1, a2] = a.line.split(".").map(Number), [b1, b2] = b.line.split(".").map(Number); return b1 - a1 || b2 - a2; };
  lines.sort(byNum);
  const latest = typeof raw?.latest === "string" ? raw.latest : raw?.latest?.version || lines[0]?.version || "unknown";
  const ltsLine = lines.find((l) => l.lts);
  const latestLTS = (typeof raw?.lts === "string" ? raw.lts : null) || ltsLine?.version || "unknown";
  return { latest, latestLTS, lines };
}

export default {
  name: "ui5_get_version_info",
  description:
    "Get UI5 version information from the CDN — maintained release lines, which are LTS, the latest, and the version Intent2Code builds use (stack.json ui5.line resolved to its newest verified patch).",
  inputSchema: {
    type: "object",
    properties: {
      frameworkName: {
        type: "string",
        enum: ["SAPUI5", "OpenUI5"],
        description: "Which UI5 distribution to query. Default: SAPUI5",
        default: "SAPUI5"
      }
    }
  },
  async handler({ frameworkName = "SAPUI5" } = {}) {
    const url = CDN[frameworkName];
    if (!url) return errText("Unknown frameworkName '" + frameworkName + "'. Use SAPUI5 or OpenUI5.");

    let raw;
    try {
      raw = await fetchJson(url);
    } catch (e) {
      return errText("Could not reach " + url + ": " + e.message + ". Check network connectivity.");
    }
    const parsed = parseVersionJson(raw);

    // The version Intent2Code actually builds with comes from stack.json (single source of truth).
    let stack = null;
    if (frameworkName === "SAPUI5") {
      try {
        const lib = await import(pathToFileURL(STACK_CLI).href);
        const r = await lib.resolveStack(lib.loadStack());
        stack = { line: r.ui5.line, resolved: r.ui5.version, verified: r.ui5.verified, source: r.ui5.source, lts: r.ui5.lts, warnings: r.warnings };
      } catch (e) {
        stack = { error: "stack.json not resolvable: " + e.message };
      }
    }

    const summary = {
      framework:         frameworkName,
      latest:            parsed.latest,
      latestLTS:         parsed.latestLTS,
      recommendedForNew: stack?.resolved || parsed.latestLTS,
      stack,
      maintained:        parsed.lines.filter((l) => !l.eom),
      all:               parsed.lines,
      note: "Intent2Code builds use `stack` (stack.json ui5.line → newest verified patch). Change the line in stack.json — never pass a guessed patch."
    };
    return okText(JSON.stringify(summary, null, 2));
  }
};
