// Replicated from https://github.com/cap-js/mcp-server (Apache-2.0)
// Upstream tool: "search_model" — fuzzy search over the compiled CDS model.
// Self-contained: runs the project's own `cds compile --to json` (local @sap/cds-dk, no shell,
// no npx) — no dependency on the external CAP MCP server — then matches the query against names.
import path from "node:path";
import { exists } from "../../lib/fs-utils.js";
import { localBin, runNodeBin, notInstalled } from "../../lib/local-bin.js";
import { okText, errText } from "../_util.js";

// Cheap match score: exact > suffix (Service.Entity) > substring > subsequence.
function scoreMatch(name, q) {
  const n = name.toLowerCase();
  if (n === q) return 100;
  if (n.endsWith("." + q)) return 90;
  if (n.includes(q)) return 70;
  let i = 0;
  for (const ch of n) { if (ch === q[i]) i++; if (i === q.length) break; }
  return i === q.length ? 40 : 0;
}

export default {
  name: "cap_search_model",
  description:
    "Fuzzy-search the compiled CDS model of a CAP project — entities, services, types, their elements, associations/compositions, annotations, and OData endpoints. Compiles the project with `cds compile --to json`, then matches the query against definition names. Use to discover what a CAP project exposes before writing handlers or annotations. (Replicates the CAP MCP server's search_model — license-clean, no external MCP dependency.)",
  inputSchema: {
    type: "object",
    properties: {
      projectDir: { type: "string", description: "Absolute path to the CAP project root (contains db/ and srv/)." },
      query: { type: "string", description: "Name or keyword to match (e.g. 'PurchaseReq', 'Status', 'Service'). Use '*' to list all definitions." },
      kind: { type: "string", enum: ["any", "entity", "service", "type", "event", "action", "function"], default: "any", description: "Restrict to a CDS definition kind." },
      limit: { type: "number", default: 25, description: "Max definitions to return." }
    },
    required: ["projectDir", "query"]
  },
  async handler({ projectDir, query, kind = "any", limit = 25 } = {}) {
    if (!projectDir) return errText("projectDir is required");
    if (!query) return errText("query is required");
    const dir = path.resolve(projectDir);
    if (!(await exists(dir))) return errText("Directory not found: " + dir);

    const bin = localBin(dir, "@sap/cds-dk", "cds");
    if (!bin) return errText(notInstalled("@sap/cds-dk", dir));
    let csn;
    const r = await runNodeBin(bin, ["compile", dir, "--to", "json"], { cwd: dir, timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
    try {
      if (!r.ok) throw new Error(r.stderr || r.error);
      csn = JSON.parse(r.stdout);
    } catch (e) {
      const detail = String(e.message || "").split(/\r?\n/).slice(-8).join(" ");
      return errText("cds compile failed for " + dir + ": " + detail);
    }

    const defs = csn.definitions || {};
    const q = query.trim().toLowerCase();
    const wantAll = q === "*";

    const rows = [];
    for (const [name, def] of Object.entries(defs)) {
      if (kind !== "any" && def.kind !== kind) continue;
      const score = wantAll ? 1 : scoreMatch(name, q);
      if (!score) continue;
      const els = def.elements || {};
      const associations = Object.entries(els)
        .filter(([, e]) => e.type === "cds.Association" || e.type === "cds.Composition")
        .map(([k, e]) => "" + k + " → " + e.target + " (" + String(e.type).split(".").pop() + ")");
      const annotations = Object.keys(def).filter((k) => k.startsWith("@"));
      rows.push({
        name,
        kind: def.kind,
        score,
        elements: Object.keys(els).slice(0, 40),
        associations,
        annotations: annotations.slice(0, 30)
      });
    }
    rows.sort((a, b) => b.score - a.score);
    const definitions = rows.slice(0, limit).map(({ score, ...r }) => r);

    return okText(JSON.stringify({
      projectDir: dir,
      query,
      kind,
      total: rows.length,
      returned: definitions.length,
      note: rows.length === 0 ? "No definitions matched. Try query '*' to list all, or a shorter keyword." : undefined,
      definitions
    }, null, 2));
  }
};
