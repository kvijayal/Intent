/**
 * stack/edit.mjs — formatting-preserving editors for package.json / manifest.json (JSON),
 * ui5*.yaml / mta.yaml (YAML, line based) and index.html (UI5 bootstrap URLs).
 *
 * JSON edits replace only the value spans they target, so CRLF, BOM, key order, inline objects
 * and indentation survive. Every JSON write is guarded: the parsed result must deep-equal the
 * old document plus exactly the intended changes, otherwise nothing is written.
 */
import { isDeepStrictEqual } from "node:util";

// ───────────────────────────────── JSON span parser ───────────────────────────────────────────
export function parseJsonSpans(text) {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const fail = (msg) => { throw new Error("JSON parse error at " + i + ": " + msg); };
  function str() {
    const start = i++;
    while (i < text.length && text[i] !== '"') { if (text[i] === "\\") i++; i++; }
    if (text[i] !== '"') fail("unterminated string");
    i++;
    return { type: "string", start, end: i, value: JSON.parse(text.slice(start, i)) };
  }
  function value() {
    ws();
    const c = text[i];
    if (c === "{") {
      const start = i++; const members = [];
      ws();
      if (text[i] === "}") { i++; return { type: "object", start, end: i, members }; }
      for (;;) {
        ws(); if (text[i] !== '"') fail("expected key");
        const k = str(); ws(); if (text[i] !== ":") fail("expected ':'"); i++;
        const v = value(); members.push({ key: k.value, keyStart: k.start, keyEnd: k.end, value: v });
        ws();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "}") { i++; return { type: "object", start, end: i, members }; }
        fail("expected ',' or '}'");
      }
    }
    if (c === "[") {
      const start = i++; const items = [];
      ws();
      if (text[i] === "]") { i++; return { type: "array", start, end: i, items }; }
      for (;;) {
        items.push(value()); ws();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "]") { i++; return { type: "array", start, end: i, items }; }
        fail("expected ',' or ']'");
      }
    }
    if (c === '"') return str();
    const m = text.slice(i).match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/);
    if (!m) fail("unexpected '" + c + "'");
    const start = i; i += m[0].length;
    return { type: "literal", start, end: i, value: JSON.parse(m[0]) };
  }
  const root = value(); ws();
  if (i < text.length) fail("trailing content");
  return root;
}

function nodeAt(root, keys) {
  let n = root;
  for (const k of keys) {
    if (!n || n.type !== "object") return null;
    const m = n.members.find((x) => x.key === k);
    if (!m) return null;
    n = m.value;
  }
  return n;
}
function lineIndentAt(text, pos) {
  const ls = text.lastIndexOf("\n", pos - 1) + 1;
  return text.slice(ls, pos).match(/^[ \t]*/)[0];
}

/**
 * A JSON document you can edit by key path. Collects edits; `toString()` applies them.
 *   doc.get(["devDependencies","@sap/cds-dk"])
 *   doc.set(["devDependencies","@sap/cds-dk"], "^9")   // replaces, or inserts (creating parents)
 */
export class JsonDoc {
  constructor(text, file = "") {
    this.file = file;
    this.original = text;
    this.text = text;
    this.eol = text.includes("\r\n") ? "\r\n" : "\n";
    this.root = parseJsonSpans(text);
    if (this.root.type !== "object") throw new Error("" + file + ": top level is not an object");
    this.data = JSON.parse(text.replace(/^\uFEFF/, ""));
    this.expected = structuredClone(this.data);
    const firstMember = this.root.members[0];
    this.unit = firstMember ? (lineIndentAt(text, firstMember.keyStart) || "  ") : "  ";
  }
  get(keys) { let v = this.data; for (const k of keys) { if (v == null || typeof v !== "object") return undefined; v = v[k]; } return v; }
  has(keys) { return this.get(keys) !== undefined; }

  /** Set a scalar or object value at `keys`, creating missing parent objects. Returns "changed"|"added"|"ok". */
  set(keys, value) {
    const current = this.get(keys);
    if (isDeepStrictEqual(current, value)) return "ok";
    // update the expected model
    let e = this.expected;
    for (const k of keys.slice(0, -1)) { if (e[k] == null || typeof e[k] !== "object") e[k] = {}; e = e[k]; }
    e[keys.at(-1)] = structuredClone(value);
    // edit the text (re-parse after every edit keeps spans valid)
    const node = nodeAt(this.root, keys);
    if (node) {
      this.text = this.text.slice(0, node.start) + this.serialize(value, lineIndentAt(this.text, node.start)) + this.text.slice(node.end);
    } else {
      let depth = keys.length - 1;
      while (depth > 0 && !nodeAt(this.root, keys.slice(0, depth))) depth--;
      const parent = nodeAt(this.root, keys.slice(0, depth));
      if (!parent || parent.type !== "object") throw new Error("" + this.file + ": cannot insert " + keys.join(".") + " — parent is not an object");
      let insertValue = value;
      for (let k = keys.length - 1; k > depth; k--) insertValue = { [keys[k]]: insertValue };
      this.insertMember(parent, keys[depth], insertValue);
    }
    this.root = parseJsonSpans(this.text);
    this.data = JSON.parse(this.text.replace(/^\uFEFF/, ""));
    return current === undefined ? "added" : "changed";
  }
  serialize(value, baseIndent) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    return JSON.stringify(value, null, this.unit).split("\n").map((l, idx) => (idx === 0 ? l : baseIndent + l)).join(this.eol);
  }
  insertMember(obj, key, value) {
    const t = this.text;
    if (obj.members.length) {
      const last = obj.members.at(-1);
      const indent = lineIndentAt(t, obj.members[0].keyStart);
      const piece = "," + this.eol + indent + JSON.stringify(key) + ": " + this.serialize(value, indent);
      this.text = t.slice(0, last.value.end) + piece + t.slice(last.value.end);
    } else {
      const outer = lineIndentAt(t, obj.start);
      const indent = outer + this.unit;
      const piece = "" + this.eol + indent + JSON.stringify(key) + ": " + this.serialize(value, indent) + this.eol + outer;
      this.text = t.slice(0, obj.start + 1) + piece + t.slice(obj.end - 1);
    }
  }
  get changed() { return this.text !== this.original; }
  /** Guarded output: throws if the parsed text differs from the intended model. */
  toString() {
    const parsed = JSON.parse(this.text.replace(/^\uFEFF/, ""));
    if (!isDeepStrictEqual(parsed, this.expected)) throw new Error("" + this.file + ": edit guard failed — result differs from the intended change; nothing written");
    return this.text;
  }
}

// ───────────────────────────────── YAML (line based) ──────────────────────────────────────────
const yamlLineRe = (key) => new RegExp("^(" + key.replace(/[-]/g, "\\-") + ":[ \\t]*)([\"']?)([^\"'#\\r\\n]*?)\\2([ \\t]*(?:#.*)?)$", "m");

/** Read a top-level scalar (column 0). */
export function yamlGetTop(text, key) {
  const m = text.match(yamlLineRe(key));
  return m ? { value: m[3].trim(), quote: m[2] } : null;
}
/** Set a top-level scalar, keeping the existing quote style unless `quote` is given. */
export function yamlSetTop(text, key, value, quote) {
  const re = yamlLineRe(key);
  const m = text.match(re);
  if (!m) return { text, status: "missing" };
  const q = quote ?? m[2];
  if (m[3].trim() === value && m[2] === q) return { text, status: "ok", from: m[3].trim() };
  return { text: text.replace(re, "$1" + q + value + q + "$4"), status: "changed", from: m[3].trim() };
}
/** framework: { version } of a ui5*.yaml (only inside the top-level framework: block). */
function frameworkVersionLine(text) {
  const lines = text.split(/\r?\n/);
  const fi = lines.findIndex((l) => /^framework:\s*$/.test(l));
  if (fi < 0) return null;
  for (let j = fi + 1; j < lines.length && (/^\s/.test(lines[j]) || lines[j].trim() === ""); j++) {
    const m = lines[j].match(/^(\s+version:[ \t]*)(["']?)([^"'#\r\n]*?)\2([ \t]*(?:#.*)?)$/);
    if (m) return { index: j, m };
  }
  return null;
}
export function yamlGetFrameworkVersion(text) { const f = frameworkVersionLine(text); return f ? f.m[3].trim() : null; }
export function yamlSetFrameworkVersion(text, value) {
  const f = frameworkVersionLine(text);
  if (!f) return { text, status: "missing" };
  const from = f.m[3].trim();
  if (from === value) return { text, status: "ok", from };
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  lines[f.index] = "" + f.m[1] + f.m[2] + value + f.m[2] + f.m[4];
  return { text: lines.join(eol), status: "changed", from };
}

// ───────────────────────────────── HTML bootstrap URLs ────────────────────────────────────────
const CDN_RE = /https:\/\/(?:sapui5\.hana\.ondemand\.com|ui5\.sap\.com)\/(?:(\d+\.\d+\.\d+|\{RECOMMENDED_UI5_VERSION\})\/)?(resources|test-resources)\//g;

/** All absolute SAP-CDN UI5 URLs in a document: [{ url, version|null }]. */
export function findCdnUrls(text) {
  return [...text.matchAll(CDN_RE)].map((m) => ({ url: m[0], version: m[1] || null }));
}
/** Point every absolute SAP-CDN UI5 URL at `${cdn}/${version}/`. Relative src stays untouched. */
export function rewriteBootstrapHtml(text, cdn, version) {
  const changes = [];
  const out = text.replace(CDN_RE, (all, v, kind) => {
    const to = "" + cdn.replace(/\/$/, "") + "/" + version + "/" + kind + "/";
    if (all !== to) changes.push({ from: all, to });
    return to;
  });
  return { text: out, changes };
}
