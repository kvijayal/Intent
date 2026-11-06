/**
 * stack/core.mjs — load + resolve Intent2Code's stack.json (single source of truth for versions).
 *
 * Zero dependencies (Node >= 20). Network access only through an injectable `fetch` so tests run
 * offline. UI5 patches are resolved from SAP's CDN and VERIFIED (HEAD sap-ui-core.js = 200); a
 * patch is never guessed — when nothing can be verified the caller gets an error (exit 3).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EXIT = { OK: 0, FINDINGS: 1, CONFIG: 2, UI5_UNRESOLVED: 3, REFUSED: 4 };

export class StackError extends Error {
  constructor(message, exitCode = EXIT.CONFIG) { super(message); this.exitCode = exitCode; }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Normalise Git-Bash style paths (/c/tmp/x) to Windows paths when running on Windows. */
export function normPath(p) {
  if (!p) return p;
  if (process.platform === "win32" && /^\/[a-zA-Z]\//.test(p)) p = "" + p[1] + ":" + p.slice(2);
  return path.resolve(p);
}

/** Locate stack.json: --stack, INTENT2CODE_STACK, CLAUDE_PLUGIN_ROOT, then upwards from this script. */
export function findStackFile(explicit) {
  const candidates = [];
  if (explicit) candidates.push(normPath(explicit));
  if (process.env.INTENT2CODE_STACK) candidates.push(normPath(process.env.INTENT2CODE_STACK));
  if (process.env.CLAUDE_PLUGIN_ROOT) candidates.push(path.join(normPath(process.env.CLAUDE_PLUGIN_ROOT), "stack.json"));
  for (let d = HERE, i = 0; i < 8; i++, d = path.dirname(d)) candidates.push(path.join(d, "stack.json"));
  const hit = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  if (!hit) throw new StackError("stack.json not found (looked at --stack, INTENT2CODE_STACK, CLAUDE_PLUGIN_ROOT and the plugin root above this script)");
  return hit;
}

/** Recursively drop "$..." keys (comments). */
function stripComments(v) {
  if (Array.isArray(v)) return v.map(stripComments);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!k.startsWith("$")) o[k] = stripComments(x);
    return o;
  }
  return v;
}

/** Load + validate stack.json. Returns { file, root, raw, stack } (stack = comments stripped). */
export function loadStack(explicitPath) {
  const file = findStackFile(explicitPath);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); }
  catch (e) { throw new StackError("" + file + ": invalid JSON — " + e.message); }
  const stack = stripComments(raw);
  const errs = [];
  if (stack.schemaVersion !== 1) errs.push("schemaVersion must be 1 (found " + stack.schemaVersion + ")");
  const major = String(stack.cap?.cdsMajor ?? "");
  if (!major) errs.push("cap.cdsMajor is required");
  else if (!stack.cap?.compat?.[major]) errs.push("cap.cdsMajor " + major + " has no cap.compat[\"" + major + "\"] entry — add the matching driver ranges (npm view @cap-js/sqlite peerDependencies)");
  if (!/^\d+\.\d+$/.test(String(stack.ui5?.line ?? ""))) errs.push("ui5.line must look like \"1.136\" (found " + (stack.ui5?.line) + ")");
  if (stack.ui5?.pin && !String(stack.ui5.pin).startsWith("" + stack.ui5.line + ".")) errs.push("ui5.pin " + stack.ui5.pin + " is not on ui5.line " + stack.ui5.line);
  if (!stack.plugin?.version) errs.push("plugin.version is required");
  for (const k of ["cdn", "cdnFallback"]) {
    const u = stack.ui5?.[k];
    if (u && !isAllowedCdn(u)) errs.push("ui5." + k + " " + u + " is not an https URL on an SAP UI5 CDN host (" + ALLOWED_CDN_HOSTS.join(", ") + ")");
  }
  if (errs.length) throw new StackError("" + file + ":\n  - " + errs.join("\n  - "));
  return { file, root: path.dirname(file), raw, stack };
}

/** The only hosts the stack tooling and the sanity static checks ever contact for UI5 resolution. */
export const ALLOWED_CDN_HOSTS = ["sapui5.hana.ondemand.com", "ui5.sap.com"];
export function isAllowedCdn(url) {
  try { const u = new URL(url); return u.protocol === "https:" && ALLOWED_CDN_HOSTS.includes(u.hostname.toLowerCase()); }
  catch { return false; }
}

/** Replace {ui5.line} / {cap.cdsMajor} / {ui5.version} placeholders inside stack strings. */
export function interpolate(value, ctx) {
  if (typeof value !== "string") return value;
  return value.replace(/\{(ui5\.line|cap\.cdsMajor|ui5\.version)\}/g, (_, k) => String(ctx[k] ?? "{" + k + "}"));
}

// ───────────────────────────────── mini semver (enough for npm ranges used here) ──────────────
export function parseVersion(v) {
  const m = String(v).trim().replace(/^v/, "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}
export function cmp(a, b) { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; }
const INF = [Infinity, 0, 0];

/** Range string → array of [min, maxExclusive] intervals ([] = unparseable). */
export function parseRange(range) {
  const r = String(range ?? "").trim();
  if (!r || r === "*" || r === "latest" || r === "x") return [[[0, 0, 0], INF]];
  const out = [];
  for (const part of r.split("||").map((s) => s.trim()).filter(Boolean)) {
    const iv = parseSimple(part);
    if (!iv) return [];
    out.push(iv);
  }
  return out;
}
function parseSimple(p) {
  const tokens = p.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) { // e.g. ">=1.2.0 <2"
    let lo = [0, 0, 0], hi = INF;
    for (const t of tokens) {
      const iv = parseSimple(t); if (!iv) return null;
      if (cmp(iv[0], lo) > 0) lo = iv[0];
      if (cmp(iv[1], hi) < 0) hi = iv[1];
    }
    return [lo, hi];
  }
  const m = p.match(/^(\^|~|>=|<=|>|<|=)?\s*v?(\d+|x|\*)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?(?:[-+][\w.-]+)?$/);
  if (!m) return null;
  const [, op = "", M, mi, pa] = m;
  const wild = (x) => x === undefined || x === "x" || x === "*";
  const v = [Number(wild(M) ? 0 : M), Number(wild(mi) ? 0 : mi), Number(wild(pa) ? 0 : pa)];
  if (wild(M)) return [[0, 0, 0], INF];
  switch (op) {
    case "^":
      if (v[0] > 0 || wild(mi)) return [v, [v[0] + 1, 0, 0]];
      if (v[1] > 0 || wild(pa)) return [v, [0, v[1] + 1, 0]];
      return [v, [0, 0, v[2] + 1]];
    case "~": return wild(mi) ? [v, [v[0] + 1, 0, 0]] : [v, [v[0], v[1] + 1, 0]];
    case ">=": return [v, INF];
    case ">": return [[v[0], v[1], v[2] + 1], INF];
    case "<": return [[0, 0, 0], v];
    case "<=": return [[0, 0, 0], [v[0], v[1], v[2] + 1]];
    default:
      if (wild(mi)) return [v, [v[0] + 1, 0, 0]];       // "1"   → 1.x
      if (wild(pa)) return [v, [v[0], v[1] + 1, 0]];    // "1.2" → 1.2.x
      return [v, [v[0], v[1], v[2] + 1]];               // exact
  }
}
export function satisfies(version, range) {
  const v = parseVersion(version); if (!v) return false;
  return parseRange(range).some(([lo, hi]) => cmp(v, lo) >= 0 && cmp(v, hi) < 0);
}
/** Do two ranges share at least one version? */
export function intersects(a, b) {
  const A = parseRange(a), B = parseRange(b);
  return A.some(([l1, h1]) => B.some(([l2, h2]) => cmp(l1, h2) < 0 && cmp(l2, h1) < 0));
}
/** Is every version allowed by `a` also allowed by `b`? */
export function isSubset(a, b) {
  const A = parseRange(a), B = parseRange(b);
  if (!A.length || !B.length) return false;
  return A.every(([l1, h1]) => B.some(([l2, h2]) => cmp(l1, l2) >= 0 && cmp(h1, h2) <= 0));
}
export function isExactVersion(s) { return /^\d+\.\d+\.\d+$/.test(String(s).trim()); }

// ───────────────────────────────── UI5 resolution ─────────────────────────────────────────────
const CACHE_FILE = path.join(os.tmpdir(), "intent2code", "stack-cache.json");
function readJsonSafe(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }
function writeJsonSafe(f, v) { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + "\n"); } catch { /* cache is best effort */ } }

async function getJson(fetchImpl, url) {
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) { const e = new Error("" + url + " → HTTP " + r.status); e.httpStatus = r.status; throw e; }
  return r.json();
}
async function headStatus(fetchImpl, url) {
  try { return (await fetchImpl(url, { method: "HEAD", signal: AbortSignal.timeout(20000) })).status; }
  catch (e) { const err = new Error("" + url + " → " + e.message); err.network = true; throw err; }
}
const coreUrl = (cdn, v) => "" + cdn.replace(/\/$/, "") + "/" + v + "/resources/sap-ui-core.js";

/** All published patches of `line` from the CDN's neo-app.json routes (numeric patches only). */
export function patchesFromNeoApp(neo, line) {
  const re = new RegExp("^/" + line.replace(".", "\\.") + "\\.(\\d+)$");
  const set = new Set();
  for (const r of neo?.routes || []) { const m = String(r.path || "").match(re); if (m) set.add("" + line + "." + m[1]); }
  return [...set].sort((a, b) => cmp(parseVersion(b), parseVersion(a)));
}

/**
 * Resolve the UI5 patch for stack.ui5 (line / pin). Returns
 * { line, version, cdn, verified, source, lts, support, patches[], resolvedAt, warnings[] }.
 * opts: { fetch, offline, refresh, lockFile, cacheFile, now }
 */
export async function resolveUi5(ui5, opts = {}) {
  const fetchImpl = opts.fetch || globalThis.fetch;
  const cacheFile = opts.cacheFile || CACHE_FILE;
  const now = opts.now || Date.now();
  const key = "" + ui5.cdn + "|" + ui5.line + "|" + (ui5.pin || "");
  const ttl = (ui5.cacheTtlHours ?? 24) * 3600 * 1000;
  const cache = readJsonSafe(cacheFile) || {};
  const hit = cache[key];
  if (hit && !opts.refresh && (opts.offline || now - Date.parse(hit.resolvedAt) < ttl)) return { ...hit, source: opts.offline ? "cache (offline)" : "cache" };
  if (opts.offline) return fromLockOrFail(ui5, opts, "offline mode and no cached resolution");

  const warnings = [];
  const cdns = [ui5.cdn, ui5.cdnFallback].filter(Boolean);
  let lastErr;
  for (const cdn of cdns) {
    try {
      let lineInfo = null, patches = [];
      try { const vj = await getJson(fetchImpl, "" + cdn + "/version.json"); lineInfo = vj?.[ui5.line] || null; }
      catch (e) { if (!e.httpStatus) throw e; warnings.push("" + cdn + "/version.json unavailable (" + e.message + ")"); }
      try { patches = patchesFromNeoApp(await getJson(fetchImpl, "" + cdn + "/neo-app.json"), ui5.line); }
      catch (e) { if (!e.httpStatus) throw e; warnings.push("" + cdn + "/neo-app.json unavailable (" + e.message + ")"); }

      let candidates;
      if (ui5.pin) candidates = [ui5.pin];
      else if (lineInfo?.version) candidates = [lineInfo.version, ...patches.filter((p) => cmp(parseVersion(p), parseVersion(lineInfo.version)) < 0)];
      else {
        if (!patches.length) throw new StackError("UI5 line " + ui5.line + " is not published on " + cdn + " (not in version.json and no patches in neo-app.json)", EXIT.UI5_UNRESOLVED);
        warnings.push("UI5 line " + ui5.line + " is no longer in maintenance (not listed in " + cdn + "/version.json) — using its newest published patch");
        candidates = patches;
      }
      for (const v of candidates.slice(0, ui5.pin ? 1 : 6)) {
        const status = await headStatus(fetchImpl, coreUrl(cdn, v));
        if (status === 200) {
          if (!ui5.pin && v !== candidates[0]) warnings.push("" + candidates[0] + " is listed but not served (HTTP ≠ 200) — stepped down to " + v);
          const res = { line: ui5.line, version: v, cdn, verified: true, source: "network", lts: !!lineInfo?.lts,
            support: lineInfo?.support || (lineInfo ? "Maintenance" : "Out of maintenance"), patches, resolvedAt: new Date(now).toISOString(), warnings };
          cache[key] = { ...res, warnings: [] };
          writeJsonSafe(cacheFile, cache);
          return res;
        }
        if (ui5.pin) throw new StackError("ui5.pin " + v + " is not served by " + cdn + " (HTTP " + status + ") — it does not exist; choose a published patch", EXIT.UI5_UNRESOLVED);
      }
      throw new StackError("no verifiable UI5 " + ui5.line + " patch on " + cdn, EXIT.UI5_UNRESOLVED);
    } catch (e) {
      lastErr = e;
      if (e instanceof StackError) throw e;           // a definitive answer (not served) — do not fall back
      warnings.push("" + cdn + ": " + e.message);           // network problem → try fallback CDN
    }
  }
  if (hit) return { ...hit, source: "cache (network error)", warnings: [...warnings] };
  return fromLockOrFail(ui5, opts, lastErr ? lastErr.message : "network unavailable");
}

function fromLockOrFail(ui5, opts, why) {
  const lock = opts.lockFile ? readJsonSafe(opts.lockFile) : null;
  if (lock?.ui5?.line === ui5.line && (!ui5.pin || lock.ui5.version === ui5.pin))
    return { ...lock.ui5, source: "stack.lock.json (offline)", warnings: ["UI5 resolved from stack.lock.json (" + why + ")"] };
  throw new StackError("cannot resolve UI5 " + ui5.line + ": " + why + "; no cache and no matching stack.lock.json — go online once or set ui5.pin", EXIT.UI5_UNRESOLVED);
}

// ───────────────────────────────── full resolution ────────────────────────────────────────────
/** Everything a build needs, with placeholders interpolated. opts: { fetch, offline, refresh, skipUi5 } */
export async function resolveStack(loaded, opts = {}) {
  const { stack, root } = loaded;
  const major = String(stack.cap.cdsMajor);
  const compat = stack.cap.compat[major];
  let ui5;
  if (opts.skipUi5) ui5 = { line: stack.ui5.line, version: null, cdn: stack.ui5.cdn, verified: false, source: "skipped", patches: [], warnings: [] };
  else ui5 = await resolveUi5(stack.ui5, { ...opts, lockFile: path.join(root, "stack.lock.json") });
  const ctx = { "ui5.line": stack.ui5.line, "cap.cdsMajor": major, "ui5.version": ui5.version };
  const mapPkgs = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) =>
    [k, typeof v === "string" ? { range: interpolate(v, ctx) } : { ...v, range: interpolate(v.range, ctx) }]));
  const capPkgs = {};
  for (const [k, v] of Object.entries(compat)) if (k !== "node") capPkgs[k] = { range: v, section: stack.cap.placement?.[k] || "dependencies", required: (stack.cap.required || []).includes(k) ? "cap" : null };
  const minUI5 = stack.ui5.minUI5Version === "line" ? "" + stack.ui5.line + ".0" : ui5.version;
  return {
    plugin: { version: stack.plugin.version, semver: toSemver(stack.plugin.version) },
    cap: { cdsMajor: Number(major), packages: capPkgs, node: stack.node?.engines || compat.node },
    ui5: { ...ui5, minUI5Version: minUI5, theme: stack.ui5.theme, bootstrapUrl: ui5.version ? coreUrl(ui5.cdn, ui5.version) : null },
    packages: { root: mapPkgs(stack.packages?.root), app: mapPkgs(stack.packages?.app), workflow: mapPkgs(stack.packages?.workflow) },
    ui5Tooling: stack.ui5Tooling || {},
    deploy: stack.deploy || {},
    generator: stack.generator || {},
    warnings: [...(ui5.warnings || [])]
  };
}

/** "1.09" → "1.9.0" (plugin.json needs semver). */
export function toSemver(v) {
  const p = String(v).split(".").map((x) => String(Number(x)));
  while (p.length < 3) p.push("0");
  return p.slice(0, 3).join(".");
}

/** Every package name the stack governs (for lint / docs sync). */
export function registeredPackages(resolved) {
  const m = {};
  for (const [k, v] of Object.entries(resolved.cap.packages)) m[k] = v.range;
  for (const grp of ["root", "app", "workflow"]) for (const [k, v] of Object.entries(resolved.packages[grp])) if (!(k in m)) m[k] = v.range;
  return m;
}

export function writeLock(loaded, resolved) {
  const f = path.join(loaded.root, "stack.lock.json");
  const lock = {
    $comment: "GENERATED by stack.mjs (resolve --write-lock / release). Do not edit. Offline fallback for the UI5 patch.",
    generatedAt: new Date().toISOString(),
    pluginVersion: resolved.plugin.version,
    ui5: { line: resolved.ui5.line, version: resolved.ui5.version, cdn: resolved.ui5.cdn, verified: resolved.ui5.verified,
      lts: resolved.ui5.lts, support: resolved.ui5.support, patches: resolved.ui5.patches, resolvedAt: resolved.ui5.resolvedAt }
  };
  fs.writeFileSync(f, JSON.stringify(lock, null, 2) + "\n");
  return f;
}
