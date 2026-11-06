// patch_manifest — deterministic post-generation manifest corrections + generator snapshot guard.
// Replaces LLM whole-file rewrites of manifest.json (the source of dropped dataSources/annotations).
import path from "node:path";
import fs from "node:fs/promises";
import { exists, readText, writeText } from "../../lib/fs-utils.js";
import { okText, errText, jsonText } from "../_util.js";
import { getResolvedStack } from "../../lib/stack.js";

// v1 routing-target keys renamed in manifest v2 (viewType handled separately: moves to routing.config)
const TARGET_RENAMES = { viewName: "name", viewId: "id", viewLevel: "level" };
const SNAPSHOT = path.join(".intent2code", "manifest.generated.json");

/** Rename keys of an object in place of their original position (keeps diffs minimal). */
function renameKeys(obj, renames) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[renames[k] && !(renames[k] in obj) ? renames[k] : k] = v;
  return out;
}

/** Collect "dataSources.<name>" and "dataSources.<name>.annotations[<a>]" facts for loss detection. */
function dataSourceFacts(m) {
  const facts = [];
  for (const [name, ds] of Object.entries(m?.["sap.app"]?.dataSources || {})) {
    facts.push("dataSources." + name);
    // Exact value: a removed leading "/" on a CAP URI is a real change (404 → blank page, static check 12).
    // Workzone needs a destination-prefixed URI (<destination>/odata/…, static check 13), not a stripped one.
    if (ds?.uri) facts.push("dataSources." + name + ".uri=" + ds.uri);
    for (const a of ds?.settings?.annotations || []) facts.push("dataSources." + name + ".settings.annotations[" + a + "]");
    if (ds?.settings?.localUri) facts.push("dataSources." + name + ".settings.localUri");
  }
  for (const [name, model] of Object.entries(m?.["sap.ui5"]?.models || {}))
    if (model?.dataSource) facts.push("models[\"" + name + "\"].dataSource=" + model.dataSource);
  return facts;
}

/** Apply the three mandatory corrections; returns the list of changes made. */
function applyCorrections(m, ui5Version) {
  const changes = [];
  if (m._version !== "2.0.0") { changes.push("_version " + m._version + " → 2.0.0"); m._version = "2.0.0"; }

  const routing = m["sap.ui5"]?.routing;
  if (routing) {
    routing.config ||= {};
    for (const [tName, t] of Object.entries(routing.targets || {})) {
      if (!t || typeof t !== "object") continue;
      if ("viewType" in t) {
        routing.config.viewType ??= t.viewType;
        delete t.viewType;
        changes.push("targets." + tName + ".viewType → routing.config.viewType");
      }
      const hits = Object.keys(TARGET_RENAMES).filter((k) => k in t);
      if (hits.length) {
        routing.targets[tName] = renameKeys(t, TARGET_RENAMES);
        changes.push("targets." + tName + ": " + hits.map((k) => "" + k + "→" + TARGET_RENAMES[k]).join(", "));
      }
    }
    if ("viewPath" in routing.config) {
      routing.config = renameKeys(routing.config, { viewPath: "path" });
      changes.push("routing.config.viewPath → path");
    }
    if (!Object.keys(routing.config).length) delete routing.config;
  }

  const i18n = m["sap.ui5"]?.models?.i18n;
  if (i18n) {
    i18n.settings ||= {};
    const locales = i18n.settings.supportedLocales || [];
    const merged = [...new Set(["", "en", ...locales])];
    if (merged.length !== locales.length) { i18n.settings.supportedLocales = merged; changes.push("i18n.supportedLocales = " + JSON.stringify(merged)); }
    if (!("fallbackLocale" in i18n.settings)) { i18n.settings.fallbackLocale = ""; changes.push('i18n.fallbackLocale = ""'); }
  }

  const deps = m["sap.ui5"]?.dependencies;
  if (ui5Version && deps && deps.minUI5Version !== ui5Version) {
    changes.push("minUI5Version " + deps.minUI5Version + " → " + ui5Version);
    deps.minUI5Version = ui5Version;
  }
  return changes;
}

export default {
  name: "patch_manifest",
  description:
    "Deterministically apply the mandatory post-generation manifest corrections (manifest v2 _version + routing key migration, i18n supportedLocales/fallbackLocale, minUI5Version + index.html CDN version) WITHOUT rewriting anything else. On first call it snapshots the generator's manifest to <appDir>/.intent2code/manifest.generated.json. mode:'verify' reports any dataSource / annotation / model binding present in the snapshot but missing now (the 'metadata disappeared' guard). Use this instead of writing manifest.json by hand.",
  inputSchema: {
    type: "object",
    properties: {
      appDir: { type: "string", description: "UI module root (folder containing webapp/)." },
      mode: { type: "string", enum: ["apply", "verify", "snapshot"], default: "apply", description: "apply = corrections (+snapshot on first call); snapshot = only record the generator manifest; verify = compare current manifest with the snapshot" },
      ui5Version: { type: "string", description: "Omit to use stack.json (ui5.line resolved to its newest verified patch). Only pass a value resolved from the stack — never a guessed patch." },
      dryRun: { type: "boolean", default: false }
    },
    required: ["appDir"]
  },
  async handler({ appDir, mode = "apply", ui5Version, dryRun = false }) {
    const manifestPath = path.join(appDir, "webapp", "manifest.json");
    if (!(await exists(manifestPath))) return errText("manifest not found: " + manifestPath);
    const raw = await readText(manifestPath);
    let m;
    try { m = JSON.parse(raw); } catch (e) { return errText("manifest.json is not valid JSON: " + e.message); }
    const snapPath = path.join(appDir, SNAPSHOT);

    if (mode === "verify") {
      if (!(await exists(snapPath))) return okText("No generator snapshot found — nothing to verify (run patch_manifest mode:'apply' right after scaffolding).");
      const before = dataSourceFacts(JSON.parse(await readText(snapPath)));
      const now = new Set(dataSourceFacts(m));
      const missing = before.filter((f) => !now.has(f));
      // A changed uri shows up as a missing "uri=<generator value>" fact; report the current value next to it.
      const current = Object.fromEntries(Object.entries(m?.["sap.app"]?.dataSources || {}).map(([n, d]) => [n, d?.uri]));
      return jsonText({ pass: missing.length === 0, snapshot: path.relative(appDir, snapPath), missing, currentUris: current,
        hint: missing.length ? "Something overwrote generator output — restore the missing entries from the snapshot; do not edit the snapshot." : undefined });
    }

    if (mode === "snapshot") {
      if (await exists(snapPath)) return okText("Snapshot already exists: " + path.relative(appDir, snapPath) + " — left unchanged.");
      await fs.mkdir(path.dirname(snapPath), { recursive: true });
      await writeText(snapPath, raw);
      return okText("Snapshot written: " + path.relative(appDir, snapPath));
    }

    const snapshotCreated = !(await exists(snapPath));
    if (snapshotCreated && !dryRun) {
      await fs.mkdir(path.dirname(snapPath), { recursive: true });
      await writeText(snapPath, raw);
    }

    let stackNote = "";
    if (!ui5Version) {
      const st = await getResolvedStack();
      if (st?.ui5?.version) { ui5Version = st.ui5.version; stackNote = "ui5Version " + ui5Version + " from stack.json (line " + st.ui5.line + ", " + (st.ui5.verified ? "verified" : "unverified") + ")"; }
      else stackNote = "stack.json UI5 version unresolvable — minUI5Version/CDN left unchanged";
    }
    const factsBefore = dataSourceFacts(m);
    const changes = applyCorrections(m, ui5Version);
    if (stackNote) changes.push(stackNote);
    const lost = factsBefore.filter((f) => !dataSourceFacts(m).includes(f));
    if (lost.length) return errText("refusing to write — corrections would drop: " + lost.join(", "));

    // CDN version in index.html (only the version segment of a sapui5/ui5 CDN URL)
    const htmlPath = path.join(appDir, "webapp", "index.html");
    if (ui5Version && (await exists(htmlPath))) {
      const html = await readText(htmlPath);
      const next = html.replace(/(https:\/\/(?:sapui5\.hana\.ondemand\.com|ui5\.sap\.com))\/(?:\d+\.\d+\.\d+\/)?resources\/sap-ui-core\.js/g,
        "$1/" + ui5Version + "/resources/sap-ui-core.js");
      if (next !== html) { changes.push("index.html CDN → " + ui5Version); if (!dryRun) await writeText(htmlPath, next); }
    }

    const indent = (raw.match(/\n([ \t]+)"/) || [, "  "])[1];
    if (changes.length && !dryRun) await writeText(manifestPath, JSON.stringify(m, null, indent) + "\n");
    return jsonText({ manifest: path.relative(appDir, manifestPath), snapshotCreated, dryRun, changes });
  }
};
