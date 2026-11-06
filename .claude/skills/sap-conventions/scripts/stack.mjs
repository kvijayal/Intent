#!/usr/bin/env node
/**
 * stack.mjs — Intent2Code stack versions CLI (single source of truth: <plugin-root>/stack.json).
 *
 *   node stack.mjs resolve [--brief|--json|--table] [--get <dot.path>] [--offline] [--refresh] [--write-lock]
 *   node stack.mjs apply <project> [--dry-run] [--scope cap|ui|deploy|all] [--keep-compatible] [--offline] [--json]
 *   node stack.mjs check <project> [--scope …] [--strict] [--no-installed] [--offline] [--json]
 *   node stack.mjs clean <project> [--node-modules] [--generated <module>] [--dry-run]
 *   node stack.mjs snapshot <ui-module-dir> [--force]   (keep the generator manifest — static check 14)
 *                                                (clean = guarded delete of gen/ — the only delete the agents use)
 *   node stack.mjs sync-docs [--check]          (maintainer: regenerate version text in the plugin docs)
 *   node stack.mjs lint [--json]                 (maintainer: stray version literals)
 *   (releases are cut with the maintainer kit's release.mjs — it is not part of the plugin)
 *
 * Exit: 0 ok · 1 drift/findings · 2 usage/config · 3 UI5 unresolvable · 4 refused (review.lock / overwrite)
 * Zero dependencies; works without the MCP server (plain `node`).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadStack, resolveStack, writeLock, normPath, StackError, EXIT } from "./stack/core.mjs";
import { discoverProject, applyProject, checkProject, cleanProject, snapshotManifest } from "./stack/project.mjs";

export * from "./stack/core.mjs";
export { discoverProject, applyProject, checkProject, planProject, cleanProject, snapshotManifest } from "./stack/project.mjs";
export { rewriteBootstrapHtml, findCdnUrls, JsonDoc } from "./stack/edit.mjs";

function parseArgs(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) flags[k] = v;
      else if (["get", "scope", "version", "out", "stack", "generated"].includes(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}
const getPath = (o, p) => p.split(".").reduce((v, k) => (v == null ? v : v[k]), o);
const mdTable = (rows, cols) => {
  const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  return ["| " + cols.map((c) => c[1]).join(" | ") + " |", "|" + cols.map(() => "---").join("|") + "|", ...rows.map((r) => "| " + cols.map((c) => esc(r[c[0]])).join(" | ") + " |")].join("\n");
};
const ICON = { PASS: "✅ PASS", FAIL: "❌ FAIL", WARN: "⚠️ WARN" };

function brief(r) {
  const cap = r.cap.packages;
  return [
    "STACK (from stack.json — plugin " + r.plugin.version + "):",
    "  CAP   cdsMajor " + r.cap.cdsMajor + ": @sap/cds " + cap["@sap/cds"].range + " · @sap/cds-dk " + cap["@sap/cds-dk"].range + " · @cap-js/sqlite " + (cap["@cap-js/sqlite"]?.range) + " · @cap-js/hana " + (cap["@cap-js/hana"]?.range) + " · node " + r.cap.node,
    "  UI5   line " + r.ui5.line + " → " + (r.ui5.version ?? "(unresolved)") + " " + (r.ui5.verified ? "(verified on CDN)" : "") + " · minUI5Version " + r.ui5.minUI5Version + " · bootstrap " + (r.ui5.bootstrapUrl ?? "—"),
    "  TOOLS " + Object.entries(r.packages.app).map(([k, v]) => "" + k + " " + v.range).join(" · "),
    "  ROOT  " + Object.entries(r.packages.root).map(([k, v]) => "" + k + " " + v.range).join(" · ") + " · ui5.yaml specVersion " + r.ui5Tooling.specVersion + " · mta _schema-version \"" + r.deploy.mtaSchemaVersion + "\"",
    "  GEN   yo@" + r.generator.yo + " · @sap/generator-fiori@" + r.generator.fioriGenerator + " · headless config version " + r.generator.headlessConfigVersion
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const { pos, flags } = parseArgs(argv);
  const cmd = pos[0];
  const loaded = loadStack(flags.stack);
  const opts = { offline: !!flags.offline, refresh: !!flags.refresh };

  if (!cmd || cmd === "help" || flags.help) {
    console.log(fs_readHeader());
    return EXIT.OK;
  }
  if (cmd === "resolve") {
    const r = await resolveStack(loaded, opts);
    if (flags["write-lock"]) console.error("lock written: " + writeLock(loaded, r));
    if (flags.get) { const v = getPath(r, flags.get); console.log(typeof v === "object" ? JSON.stringify(v) : String(v)); }
    else if (flags.json) console.log(JSON.stringify(r, null, 2));
    else console.log(brief(r));
    for (const w of r.warnings) console.error("warning: " + w);
    return EXIT.OK;
  }
  if (cmd === "apply" || cmd === "check") {
    if (!pos[1]) throw new StackError("usage: stack.mjs " + cmd + " <project-dir>");
    const proj = discoverProject(normPath(pos[1]));
    const scope = flags.scope || "all";
    const needsUi5 = scope === "all" || scope === "ui";
    const r = await resolveStack(loaded, { ...opts, skipUi5: !needsUi5 || !proj.modules.length });
    if (cmd === "apply") {
      const res = applyProject(proj, r, { scope, dryRun: !!flags["dry-run"], keepCompatible: !!flags["keep-compatible"], pluginRoot: loaded.root });
      if (flags.json) console.log(JSON.stringify(res, null, 2));
      else {
        console.log("stack apply" + (flags["dry-run"] ? " (dry run — nothing written)" : "") + " — " + proj.root + "\n");
        console.log(mdTable(res.rows, [["file", "File"], ["key", "Key"], ["current", "From"], ["expected", "To"], ["status", "Status"]]));
        console.log("\n" + res.changed + " change(s)" + (flags["dry-run"] ? " planned" : " written to " + res.written.length + " file(s)") + ".");
        if (res.next.length) console.log("\nNext:\n" + res.next.map((n) => "  - " + n).join("\n"));
      }
      for (const w of r.warnings) console.error("warning: " + w);
      return EXIT.OK;
    }
    const res = checkProject(proj, r, { scope, strict: !!flags.strict, installed: !flags["no-installed"] });
    if (flags.json) console.log(JSON.stringify(res, null, 2));
    else {
      console.log("stack check — " + proj.root + " (stack: CDS " + r.cap.cdsMajor + ", UI5 " + r.ui5.line + (r.ui5.version ? " → " + r.ui5.version : "") + ")\n");
      console.log(mdTable(res.rows.map((x) => ({ ...x, status: ICON[x.status] || x.status })), [["group", "Group"], ["file", "File"], ["key", "Key"], ["current", "Declared"], ["expected", "Stack"], ["status", "Result"], ["note", "Note"]]));
      console.log("\nSummary: " + res.fails + " FAIL · " + res.warns + " WARN · " + (res.rows.length - res.fails - res.warns) + " PASS");
      if (res.fails) console.log("Fix: node \"" + fileURLToPath(import.meta.url) + "\" apply \"" + proj.root + "\"  then npm install");
    }
    for (const w of r.warnings) console.error("warning: " + w);
    return res.fails ? EXIT.FINDINGS : EXIT.OK;
  }
  if (cmd === "clean") {
    if (!pos[1]) throw new StackError("usage: stack.mjs clean <project-dir> [--node-modules] [--generated <module>] [--dry-run]");
    const res = cleanProject(normPath(pos[1]), { nodeModules: !!flags["node-modules"], generated: flags.generated ?? null, dryRun: !!flags["dry-run"], pluginRoot: loaded.root });
    console.log("stack clean" + (flags["dry-run"] ? " (dry run — nothing deleted)" : "") + " — " + res.root + "\n");
    console.log(mdTable(res.rows, [["path", "Folder"], ["status", "Status"]]));
    return EXIT.OK;
  }
  if (cmd === "snapshot") {
    if (!pos[1]) throw new StackError("usage: stack.mjs snapshot <ui-module-dir> [--force]");
    const res = snapshotManifest(normPath(pos[1]), { force: !!flags.force });
    console.log("stack snapshot — " + res.dst + ": " + res.status);
    return EXIT.OK;
  }
  if (cmd === "sync-docs" || cmd === "lint") {
    const docs = await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "stack", "docs.mjs")).href);
    return cmd === "lint" ? docs.lintCmd(loaded, flags, opts) : docs.syncDocsCmd(loaded, flags, opts);
  }
  throw new StackError("unknown command \"" + cmd + "\" — try: resolve | apply | check | clean | snapshot | sync-docs | lint");
}

function fs_readHeader() {
  return "stack.mjs — see the header of " + fileURLToPath(import.meta.url) + " for usage.\n  resolve [--brief|--json] [--get ui5.version] [--offline] [--refresh] [--write-lock]\n  apply <project> [--dry-run] [--scope cap|ui|deploy|all] [--keep-compatible]\n  check <project> [--strict] [--no-installed] [--json]\n  clean <project> [--node-modules] [--generated <module>] [--dry-run]\n  snapshot <ui-module-dir> [--force]\n  sync-docs [--check] · lint";
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((code) => process.exit(code ?? 0)).catch((e) => {
    console.error("stack.mjs: " + e.message);
    process.exit(e instanceof StackError ? e.exitCode : EXIT.CONFIG);
  });
}
