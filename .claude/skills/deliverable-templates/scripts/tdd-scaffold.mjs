#!/usr/bin/env node
/**
 * tdd-scaffold.mjs — build the Technical Design Document from the project itself, then verify it.
 *
 * Why: the documentation agent used to compose the whole TDD (40–80 KB) and save it with ONE Write
 * call. On bigger apps — or with a lower model output limit — that single call is cut off and no
 * file is saved ("the content never gets generated"). This script writes every FACTUAL section
 * deterministically (data model, services, actions, selection / list / create fields, roles,
 * authorization matrix, validation errors, integrations, tech stack, test data, requirement list)
 * and marks only the narrative parts with `> ✍️ TO WRITE — …`. The agent then replaces the markers
 * one section at a time with small Edits, and `--check` proves nothing is left empty.
 *
 * Usage:
 *   node <skill>/scripts/tdd-scaffold.mjs <app-root> [--out <file>] [--force]
 *        → writes <app-root>/deliverables/Technical-Design-Document.md (refuses to overwrite without --force)
 *   node <skill>/scripts/tdd-scaffold.mjs <app-root> --check [--file <file>]
 *        → FAIL on "✍️ TO WRITE" markers, {{placeholders}}, empty sections, REQ ids missing from the document
 * Exit:  0 ok · 1 check failed · 2 usage / setup · 4 file exists (use --force)
 * Needs: node_modules in <app-root> for the compiled model (local @sap/cds-dk — never npx). Without it
 *        the model sections become TO WRITE markers instead.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : undefined; };
const root = path.resolve(argv.find((a, i) => !a.startsWith("--") && !["--out", "--file"].includes(argv[i - 1])) || ".");
const exists = (f) => fs.existsSync(f);
const read = (f) => fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "");
const readJson = (f) => { try { return JSON.parse(read(f)); } catch { return null; } };
if (!exists(path.join(root, "package.json"))) { console.error("usage: node tdd-scaffold.mjs <app-root> [--check] [--force]  (no package.json in " + root + ")"); process.exit(2); }
const docFile = path.resolve(opt("file") || opt("out") || path.join(root, "deliverables", "Technical-Design-Document.md"));
const MARK = "✍️ TO WRITE";
const TEAM = "‹to be completed by the project team›";
const todo = (what) => "> " + MARK + " — " + what;
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
const table = (cols, rows) => rows.length ? ["| " + cols.join(" | ") + " |", "|" + cols.map(() => "---").join("|") + "|", ...rows.map((r) => "| " + r.map(esc).join(" | ") + " |")].join("\n") : null;

// ── requirement register (shared by build and check) ────────────────────────────────────────
function requirements() {
  const f = path.join(root, "deliverables", "Requirement-Register.md");
  if (!exists(f)) return [];
  const out = [];
  for (const line of read(f).split(/\r?\n/)) {
    const m = line.match(/^\|\s*(REQ-\d+)\s*\|(.*)\|\s*$/);
    if (!m) continue;
    const cells = m[2].split("|").map((c) => c.trim());
    out.push({ id: m[1], text: cells[0] || "", type: cells[cells.length - 2] || "", disposition: cells[cells.length - 1] || "" });
  }
  return [...new Map(out.map((r) => [r.id, r])).values()];
}

// ══════════════════════════════════════ CHECK ═════════════════════════════════════════════════
if (argv.includes("--check")) {
  if (!exists(docFile)) { console.log("❌ FAIL — " + docFile + " does not exist (the document was never saved)"); process.exit(1); }
  const lines = read(docFile).split(/\r?\n/);
  const rows = [];
  lines.forEach((l, i) => {
    if (l.includes(MARK)) rows.push(["FAIL", i + 1, "unwritten section marker: " + l.trim().slice(0, 90)]);
    if (/\{\{[^}]*\}\}/.test(l)) rows.push(["FAIL", i + 1, "template placeholder left: " + l.trim().slice(0, 90)]);
    if (l.includes(TEAM)) rows.push(["INFO", i + 1, "administrative field for the project team (author, approver, GAP ID …)"]);
  });
  // empty sections: a heading whose body (until the next heading of the same or higher level) has no text
  const heads = lines.map((l, i) => { const m = l.match(/^(#{2,4})\s+(.*)/); return m ? { i, level: m[1].length, title: m[2] } : null; }).filter(Boolean);
  heads.forEach((h, k) => {
    const next = heads.slice(k + 1).find((x) => x.level <= h.level);
    const body = lines.slice(h.i + 1, next ? next.i : lines.length).filter((l) => l.trim() && l.trim() !== "---" && !/^#{2,4}\s/.test(l));
    const sub = heads.slice(k + 1, next ? heads.indexOf(next) : heads.length).length;
    if (!body.length && !sub) rows.push(["FAIL", h.i + 1, "empty section: " + h.title]);
  });
  const text = lines.join("\n");
  for (const r of requirements()) if (!new RegExp("\\b" + r.id + "\\b").test(text)) rows.push(["FAIL", "-", "" + r.id + " (requirement register) is not mapped anywhere in the TDD"]);
  // the generated Mermaid diagrams must survive the writing pass (edit them, never replace them by prose)
  const fence = "`".repeat(3) + "mermaid";
  const secBody = (title) => { const h = heads.find((x) => x.title.startsWith(title)); if (!h) return null; const nx = heads.slice(heads.indexOf(h) + 1).find((x) => x.level <= h.level); return lines.slice(h.i + 1, nx ? nx.i : lines.length).join("\n"); };
  const arch = secBody("3.4 Detailed Architecture Diagram");
  const hasSolution = heads.some((x) => x.title.startsWith("3. Solution Architecture"));   // a TDD in the scaffold layout
  if (arch === null && hasSolution) rows.push(["FAIL", "-", "section 3.4 Detailed Architecture Diagram is missing (re-run the scaffold into a temp file and copy it)"]);
  else if (arch === null) { /* not the scaffold layout: no diagram rule */ }
  else if (!arch.includes(fence + "\n") && !arch.includes(fence + "\r\n")) rows.push(["FAIL", heads.find((x) => x.title.startsWith("3.4"))?.i + 1, "section 3.4 has no mermaid diagram — keep the generated flowchart (edit it, do not replace it by text)"]);
  const fails = rows.filter((r) => r[0] === "FAIL");
  console.log("TDD check — " + (path.relative(process.cwd(), docFile) || docFile) + " (" + lines.length + " lines)\n");
  if (rows.length) console.log(table(["Result", "Line", "Finding"], rows.map((r) => [r[0] === "FAIL" ? "❌ FAIL" : "ℹ️ INFO", String(r[1]), r[2]])));
  console.log("\nSummary: " + fails.length + " FAIL · " + (rows.length - fails.length) + " INFO" + (fails.length ? " — replace every marker / empty section with real content (one section per Edit), then re-run --check" : " — complete"));
  process.exit(fails.length ? 1 : 0);
}

// ══════════════════════════════════════ BUILD ═════════════════════════════════════════════════
if (exists(docFile) && !argv.includes("--force")) {
  console.error("tdd-scaffold: " + docFile + " already exists — refresh it section by section with Edit, or pass --force to rebuild the scaffold.");
  process.exit(4);
}
const pkg = readJson(path.join(root, "package.json")) || {};
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

// i18n: CAP bundle (_i18n) + every UI module bundle
const i18n = {};
for (const f of [path.join(root, "_i18n", "i18n.properties"), path.join(root, "i18n", "i18n.properties"), path.join(root, "webapp", "i18n", "i18n.properties")]) loadProps(f);
const appDir = path.join(root, "app");
const uiDirs = [];
if (exists(path.join(root, "webapp", "manifest.json"))) uiDirs.push(root);
if (exists(appDir)) for (const e of fs.readdirSync(appDir, { withFileTypes: true })) if (e.isDirectory() && exists(path.join(appDir, e.name, "webapp", "manifest.json"))) uiDirs.push(path.join(appDir, e.name));
for (const d of uiDirs) loadProps(path.join(d, "webapp", "i18n", "i18n.properties"));
function loadProps(f) { if (!exists(f)) return; for (const l of read(f).split(/\r?\n/)) { const m = l.match(/^\s*([^#!=:\s][^=:]*?)\s*[=:]\s*(.*)$/); if (m && !(m[1] in i18n)) i18n[m[1]] = m[2]; } }
// CDS uses {i18n>key}; the UI5 manifest uses {{key}}
const label = (v) => { const s = String(v ?? ""); const m = s.match(/^\{i18n>([^}]+)\}$/) || s.match(/^\{\{([^}]+)\}\}$/); return m ? (i18n[m[1]] ?? m[1]) : s; };

// compiled model (local cds-dk, argument array — no shell, no npx)
let csn = null, cdsNote = "";
const cdsBin = (() => {
  for (let d = root; ; d = path.dirname(d)) {
    const pj = path.join(d, "node_modules", "@sap", "cds-dk", "package.json");
    if (exists(pj)) { const b = readJson(pj)?.bin; const r = typeof b === "string" ? b : b?.cds; return r ? path.join(path.dirname(pj), r) : null; }
    if (path.dirname(d) === d) return null;
  }
})();
if (exists(path.join(root, "srv")) || exists(path.join(root, "db"))) {
  if (!cdsBin) cdsNote = "node_modules not installed — run npm install, then re-run the scaffold to fill the model sections";
  else {
    for (const src of [["srv"], ["db"]]) {
      try { csn = JSON.parse(execFileSync(process.execPath, [cdsBin, "compile", ...src, "--to", "json"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })); break; }
      catch (e) { cdsNote = "cds compile failed: " + String(e.stderr || e.message).split(/\r?\n/).slice(-3).join(" ").slice(0, 200); }
    }
  }
}
const defs = csn?.definitions || {};
const services = Object.entries(defs).filter(([, d]) => d.kind === "service").map(([n, d]) => ({ name: n, def: d }));
const isSystem = (n) => /^sap\.common\./.test(n) || /\.texts$/.test(n) || /DraftAdministrativeData/.test(n);
const svcOf = (n) => services.find((s) => n.startsWith(s.name + "."));
const dbEntities = Object.entries(defs).filter(([n, d]) => d.kind === "entity" && !isSystem(n) && !svcOf(n));
const svcEntities = Object.entries(defs).filter(([n, d]) => d.kind === "entity" && !isSystem(n) && svcOf(n));
const short = (n) => n.split(".").pop();
const path2 = (v) => (v && typeof v === "object" ? v["="] ?? v.ref?.join(".") : v) ?? "";

function typeOf(e) {
  if (e.type === "cds.Association" || e.type === "cds.Composition") return "" + (e.type === "cds.Composition" ? "Composition" : "Association") + " to " + (e.cardinality?.max === "*" ? "many " : "") + short(e.target || "");
  const t = String(e.type || (e.items ? "array" : "")).replace(/^cds\./, "");
  const td = defs[e.type];
  const len = e.length ? "(" + e.length + ")" : e.precision ? "(" + e.precision + (e.scale !== undefined ? "," + e.scale : "") + ")" : td?.length ? "(" + td.length + ")" : "";
  return td?.type ? "" + t + " (" + String(td.type).replace(/^cds\./, "") + len + ")" : t + len;
}
function rules(e, name) {
  const r = [];
  if (e.key) r.push("key");
  if (e.notNull || e["@mandatory"]) r.push("mandatory");
  if (e.virtual) r.push("virtual (computed)");
  if (e["@readonly"] || e["@Core.Computed"]) r.push("read-only");
  if (["createdAt", "createdBy", "modifiedAt", "modifiedBy"].includes(name)) r.push("managed");
  const en = e.enum || defs[e.type]?.enum;
  if (en) r.push("values: " + Object.keys(en).join(" / "));
  if (e.default?.val !== undefined) r.push("default " + JSON.stringify(e.default.val));
  if (e["@assert.range"]) r.push("range " + JSON.stringify(e["@assert.range"]));
  if (e["@assert.format"]) r.push("format " + e["@assert.format"]);
  const lbl = e["@title"] || e["@Common.Label"];
  if (lbl) r.push("label \"" + label(lbl) + "\"");
  return r.join("; ") || "—";
}
const annoList = (d, key) => { const v = d[key] ?? Object.entries(d).find(([k]) => k === key)?.[1]; return Array.isArray(v) ? v : []; };
function fieldGroups(d) {
  const out = [];
  for (const [k, v] of Object.entries(d)) {
    const m = k.match(/^@UI\.FieldGroup(#[\w-]+)?(\.Data)?$/);
    if (!m) continue;
    const data = Array.isArray(v) ? v : v?.Data || [];
    for (const x of data) if (x?.Value) out.push({ group: (m[1] || "").slice(1) || "default", path: path2(x.Value), label: label(x.Label) });
  }
  return out;
}

// restrictions → matrix rows
const OPS = ["READ", "CREATE", "UPDATE", "DELETE"];
function grantsOf(d) {
  const r = d?.["@restrict"]; if (!Array.isArray(r)) return null;
  return r.map((g) => ({ grant: [].concat(g.grant || "*"), to: [].concat(g.to || "any"), where: g.where }));
}

// handler scan: req.error / req.reject / req.warn — literal, constant (HTTP.X, MSG.Y) and object forms
const handlerRows = [];
const srcFiles = [];
(function list(dir) {
  if (!exists(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "gen", "test"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) list(p); else if (/\.(js|ts|mjs|cjs)$/.test(e.name)) srcFiles.push(p);
  }
})(path.join(root, "srv"));
const consts = {};   // PROPERTY → value, from constant objects such as srv/util/constants.js
for (const p of srcFiles) for (const m of read(p).matchAll(/\b([A-Z][A-Z0-9_]*)\s*:\s*(\d{3}|(['"`])((?:\\.|(?!\3).)*)\3)/g)) if (!(m[1] in consts)) consts[m[1]] = m[4] ?? m[2];
const resolveArg = (a) => {
  const s = String(a || "").trim();
  const lit = s.match(/^(['"`])((?:\\.|(?!\1).)*)\1$/);
  if (lit) return lit[2];
  const c = s.match(/^\w+\.([A-Z][A-Z0-9_]*)$/) || s.match(/^([A-Z][A-Z0-9_]*)$/);
  return c && c[1] in consts ? consts[c[1]] : s;
};
for (const p of srcFiles) {
  {
    const lines = read(p).split(/\r?\n/);
    lines.forEach((l, i) => {
      let m = l.match(/\breq\.(error|reject|warn)\s*\(\s*([^,()]+?)\s*(?:,\s*([^,()]+?)\s*)?[,)]/);
      if (!m) return;
      if (/^\{/.test(m[2])) {   // req.error({ status: 400, message: '…' })
        const st = (l.match(/(?:status|code)\s*:\s*([^,}]+)/) || [])[1], ms = (l.match(/message\s*:\s*([^,}]+)/) || [])[1];
        m = [m[0], m[1], st, ms];
      }
      let code = resolveArg(m[2]), text = m[3] !== undefined ? resolveArg(m[3]) : "";
      if (!/^\d{3}$/.test(code)) { text = text || code; code = m[1] === "warn" ? "warning" : "500"; }
      m = [m[0], m[1], code, "'", text];
      let ctx = "";
      for (let k = i; k >= 0 && !ctx; k--) {
        const h = lines[k].match(/\.(before|on|after)\s*\(\s*(\[[^\]]*\]|['"`][^'"`]+['"`])\s*,\s*(\[[^\]]*\]|['"`][^'"`]+['"`])?/);
        if (h) ctx = "" + h[1] + " " + h[2].replace(/['"`\[\]]/g, "") + (h[3] ? " " + h[3].replace(/['"`\[\]]/g, "") : "");
        const fn = !ctx && lines[k].match(/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)|^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/);
        if (fn) ctx = "" + (fn[1] || fn[2]) + "()";
      }
      const msg = m[4].startsWith("{i18n>") || /^[A-Z0-9_]+$/.test(m[4]) ? "" + m[4] + (i18n[m[4]] ? " — \"" + i18n[m[4]] + "\"" : "") : m[4];
      handlerRows.push({ file: path.relative(root, p).replace(/\\/g, "/"), line: i + 1, kind: m[1], code: m[2] || (m[1] === "warn" ? "warning" : "500"), ctx: ctx || "—", msg });
    });
  }
}

// package.json cds.requires
const req = pkg.cds?.requires || {};
const profileVal = (key, prop) => {
  const out = [];
  const v = req[key];
  const pick = (x) => (typeof x === "string" ? x : x?.[prop]);
  if (v && pick(v)) out.push(["default", pick(v)]);
  for (const [k, x] of Object.entries(req)) { const m = k.match(/^\[(.+)\]$/); if (m && x?.[key] && pick(x[key])) out.push([m[1], pick(x[key])]); }
  if (v) for (const [k, x] of Object.entries(v)) { const m = k.match(/^\[(.+)\]$/); if (m && pick(x)) out.push([m[1], pick(x)]); }
  return out;
};
const remotes = Object.entries(req).filter(([k, v]) => !/^\[|^(db|auth|destinations|html5-repo|html5-runtime|connectivity|multitenancy|toggles|extensibility)$/.test(k) && v && typeof v === "object" && /odata|rest/i.test(v.kind || ""));

// xs-security.json
const xs = readJson(path.join(root, "xs-security.json"));
// mta.yaml (line-based: modules / resources / destination init_data)
const mta = exists(path.join(root, "mta.yaml")) ? read(path.join(root, "mta.yaml")) : "";
function mtaBlocks(section) {
  const m = mta.match(new RegExp("^" + section + ":\\s*\\r?\\n([\\s\\S]*?)(?=^\\S|$(?![\\s\\S]))", "m"));
  if (!m) return [];
  return m[1].split(/\r?\n(?=\s{0,4}-\s+name:)/).map((b) => ({ name: (b.match(/-\s+name:\s*(\S+)/) || [])[1], type: (b.match(/^\s+type:\s*(\S+)/m) || [])[1], service: (b.match(/^\s+service:\s*(\S+)/m) || [])[1], plan: (b.match(/^\s+service-plan:\s*(\S+)/m) || [])[1], path: (b.match(/^\s+path:\s*(\S+)/m) || [])[1] })).filter((x) => x.name);
}
const mtaModules = mtaBlocks("modules"), mtaResources = mtaBlocks("resources");
const mtaDest = [...mta.matchAll(/-\s+(?:Authentication:\s*(\S+)[\s\S]*?)?Name:\s*(\S+)[\s\S]*?(?=\n\s*-\s|\n\S|$)/g)].map((m) => {
  const block = m[0];
  return { name: m[2], auth: (block.match(/Authentication:\s*(\S+)/) || [])[1] || "—", url: (block.match(/URL:\s*(\S+)/) || [])[1] || "—", fwd: /HTML5\.ForwardAuthToken:\s*true/.test(block) ? "Yes" : "No" };
}).filter((d) => d.name && !/repo-host|uaa$/i.test(d.name));

// UI modules
const uis = uiDirs.map((d) => {
  const mf = readJson(path.join(d, "webapp", "manifest.json")) || {};
  const targets = Object.values(mf["sap.ui5"]?.routing?.targets || {});
  const tn = targets.map((t) => t.name || t.viewName || "").join(" ");
  // OData V4 ALP = the ListReport template with a chart (primary) + table (secondary) view
  const alp = targets.some((t) => /ListReport/.test(t.name || "") && (t.options?.settings?.views?.paths || []).some((p) => p.primary && p.secondary));
  const floorplan = alp || /AnalyticalListPage/.test(tn) ? "Fiori Elements Analytical List Page" : /ListReport/.test(tn) ? "Fiori Elements List Report + Object Page" : /sap\.fe\.core\.fpm/.test(tn) ? "Fiori Elements Flexible Programming Model page" : /ObjectPage/.test(tn) ? "Fiori Elements Object Page" : "Freestyle SAPUI5";
  const ts = exists(path.join(d, "webapp", "Component.ts"));
  const inb = mf["sap.app"]?.crossNavigation?.inbounds || {};
  return { dir: path.relative(root, d).replace(/\\/g, "/") || ".", name: path.relative(root, d) ? path.basename(d) : (mf["sap.app"]?.id || pkg.name || path.basename(root)), id: mf["sap.app"]?.id, title: label(mf["sap.app"]?.title), floorplan: floorplan + (ts ? " (TypeScript)" : ""), minUI5: mf["sap.ui5"]?.dependencies?.minUI5Version,
    ds: Object.entries(mf["sap.app"]?.dataSources || {}).filter(([, v]) => (v.type || "OData") === "OData").map(([k, v]) => "" + k + ": " + v.uri + " (OData " + (v.settings?.odataVersion || "4.0") + ")"),
    tiles: Object.entries(inb).map(([k, v]) => [k, "" + v.semanticObject + "-" + v.action, label(v.title)]) };
});
const reqs = requirements();
const appName = pkg.name || path.basename(root);
const today = new Date().toISOString().slice(0, 10);
const installed = (n) => readJson(path.join(root, "node_modules", ...n.split("/"), "package.json"))?.version;

// ── document ──────────────────────────────────────────────────────────────────────────────────
const D = [];
const P = (...l) => D.push(...l);
// blank line after every block so a "> ✍️ TO WRITE" quote never swallows the table that follows
const sec = (h, ...body) => P(h, "", ...body.filter((x) => x !== null && x !== undefined).flatMap((x) => [x, ""]));

P("# Technical Design Document — " + (uis[0]?.title || appName), "",
  "> Generated by `tdd-scaffold.mjs` from the project on " + today + ": the tables are facts read from the code;",
  "> every \"" + MARK + "\" block is written by the documentation agent; the project team fills the " + TEAM + " fields.", "");
sec("## Technical Design Document", table(["Field", "Value"], [
  ["**Document ID**", "TDD-" + appName], ["**GAP ID**", TEAM], ["**TD Title**", "" + (uis[0]?.title || appName) + " — Technical Design"],
  ["**Business Process Area**", TEAM], ["**Design Specification Author**", TEAM], ["**Implementation Partner**", TEAM],
  ["**Application Design Approval**", TEAM], ["**Application Design Submission Date**", TEAM], ["**Technical Specification Submission Date**", today]]));
P("---", "");
sec("## Change History (Revision History)", table(["Version", "Date", "Author", "Description of Change"], [[pkg.version || "1.0.0", today, TEAM, "Initial version generated from the implemented application"]]));
sec("## Reviewers", table(["Name", "Role", "Date"], [[TEAM, TEAM, TEAM]]));
sec("## Sign Off", table(["Name", "Role", "Date", "Signature"], [[TEAM, TEAM, TEAM, ""]]));
P("---", "");
sec("## Requirement Traceability Matrix",
  reqs.length ? "Every requirement of `deliverables/Requirement-Register.md` → the TDD section(s) that design it." : null,
  reqs.length ? table(["REQ", "Requirement", "Type", "Disposition", "TDD section(s)"], reqs.map((r) => [r.id, r.text, r.type, r.disposition, MARK])) : todo("no Requirement-Register.md found — list the requirements from the functional design (FD) and map each to its TDD section"));
sec("## Table of Contents", ["1. [Introduction](#1-introduction)", "2. [Acronyms and References](#2-acronyms-and-references)", "3. [Solution Architecture](#3-solution-architecture)", "4. [Functional Specification](#4-functional-specification)", "5. [Integration Design](#5-integration-design)", "6. [Error Handling](#6-error-handling)", "7. [Security and Authorization](#7-security-and-authorization)", "8. [Nonfunctional Requirements](#8-nonfunctional-requirements)", "9. [Additional Requirements](#9-additional-requirements)", "10. [Testing Requirements](#10-testing-requirements)", "11. [Additional Supporting / Reference Documentation](#11-additional-supporting--reference-documentation)", "12. [Open Issues](#12-open-issues)", "13. [Application Design](#13-application-design)", "14. [Data Migration *(Optional)*](#14-data-migration-optional)"].join("\n"));
P("---", "");

P("## 1. Introduction", "");
sec("### 1.1 Objectives", todo("business objective and what the application delivers — from the FD / Application-Architecture.md"));
sec("### 1.2 Scope", todo("in-scope features (link the REQ ids) and the delivered app modules"));
sec("### 1.3 Pre-Requisites", todo("BTP subaccount, entitlements (XSUAA, HANA Cloud, HTML5 repo, Destination), role collections, Node.js / tooling — see §3.2"));
sec("### 1.4 Assumptions", todo("every assumption recorded at the architecture gates (Application-Architecture.md) with the chosen default"));
sec("### 1.5 Exclusions", todo("explicitly out of scope"));
sec("### 1.6 Dependencies / Constraints", todo("Clean Core / side-by-side constraint, released APIs, platform limits"));
sec("### 1.7 Risks / Mitigation", todo("risk | impact | mitigation table"));
P("---", "");

P("## 2. Acronyms and References", "");
const ACR = [["BTP", "SAP Business Technology Platform"], ["CAP", "SAP Cloud Application Programming Model"], ["CDS", "Core Data Services"], ["OData", "Open Data Protocol"], ["UI5", "SAPUI5 user-interface framework"], ["XSUAA", "SAP Authorization and Trust Management service"], ["MTA", "Multitarget Application (mta.yaml)"], ["HDI", "HANA Deployment Infrastructure"], ["RBAC", "Role-based access control"]];
if (uis.some((u) => /Fiori Elements/.test(u.floorplan))) ACR.push(["FE", "SAP Fiori Elements"], ["LR / OP", "List Report / Object Page"]);
if (uis.some((u) => /Flexible Programming/.test(u.floorplan))) ACR.push(["FPM", "Flexible Programming Model"]);
if (uis.some((u) => /Analytical/.test(u.floorplan))) ACR.push(["ALP", "Analytical List Page"]);
sec("### 2.1 Acronyms", table(["Term", "Definition"], ACR));
const refs = ["Requirement-Register.md", "Application-Architecture.md", "Coverage-Report.md", "Test-Report.md", "Unit-Testing-Document.md"].filter((f) => exists(path.join(root, "deliverables", f))).map((f) => "- `deliverables/" + f + "`");
if (exists(path.join(root, "test.http"))) refs.push("- `test.http` — REST-client requests for every service");
refs.push("- SAP CAP documentation — https://cap.cloud.sap/docs", "- SAP Fiori design guidelines — https://experience.sap.com/fiori-design-web");
sec("### 2.2 References", refs.join("\n"));
P("---", "");

P("## 3. Solution Architecture", "");
const topo = mtaModules.length ? "Browser → BTP HTML5 Application Runtime → Destination Service → " + (mtaModules.filter((m) => m.type === "nodejs").map((m) => m.name).join(", ") || "CAP service") + " → " + (mtaResources.some((r) => /hana|hdi/i.test("" + r.type + " " + r.service)) ? "SAP HANA Cloud (HDI)" : "database") : uis.length && !csn ? "Browser → UI5 app → (destination / proxy) → OData service" : "Browser → CAP Node.js service → database";
sec("### 3.1 System Topology", todo("describe the topology below (who calls what, where it runs)"), "```", topo, "```");
const dbKinds = profileVal("db", "kind").map(([p, k]) => "" + k + " (" + p + ")").join(", ") || (deps["@cap-js/sqlite"] ? "sqlite (development)" : "—");
const authKinds = profileVal("auth", "kind").map(([p, k]) => "" + k + " (" + p + ")").join(", ") || "—";
sec("### 3.2 Technology Stack", table(["Layer", "Technology", "Version / Plan"], [
  ["Frontend", uis.map((u) => "" + u.floorplan + " — `" + u.dir + "`").join("<br>") || "none (service only)", uis.map((u) => u.minUI5 ? "SAPUI5 ≥ " + u.minUI5 : "").filter(Boolean).join(", ") || "—"],
  ...(csn || deps["@sap/cds"] ? [["Backend", "CAP Node.js", "@sap/cds " + (deps["@sap/cds"] || "—") + (installed("@sap/cds") ? " (installed " + installed("@sap/cds") + ")" : "")]] : []),
  ["Database", dbKinds, mtaResources.filter((r) => /hana|hdi/i.test("" + r.type + " " + r.service)).map((r) => "" + (r.service || r.type) + " / " + (r.plan || "—")).join(", ") || "—"],
  ["Authentication", authKinds, mtaResources.filter((r) => r.service === "xsuaa").map((r) => "xsuaa / " + (r.plan || "application")).join(", ") || "—"],
  ["Hosting", mta ? "SAP BTP Cloud Foundry (MTA)" : "—", TEAM]]));
sec("### 3.3 Runtime Environments", table(["Environment", "Platform", "Database", "Auth"], [
  ["Development", "Local `npm run watch` (http://localhost:4004)", profileVal("db", "kind").find(([p]) => p === "development")?.[1] || "sqlite (in-memory)", profileVal("auth", "kind").find(([p]) => p === "development")?.[1] || "—"],
  ["QA", "BTP CF — " + TEAM, "SAP HANA Cloud", "XSUAA"], ["Production", "BTP CF — " + TEAM, "SAP HANA Cloud", "XSUAA"]]));

// ── 3.4 detailed architecture diagram + 13.4 flow (Mermaid, generated from the project facts) ──────
const mid = (s) => String(s).replace(/[^A-Za-z0-9_]/g, "_");
const ml = (s) => String(s ?? "").replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;").replace(/[;#](?!(quot|lt|gt);)/g, " ");
const svcPath = (s) => { const p = s.def["@path"]; return p ? (String(p).startsWith("/") ? String(p) : "/odata/v4/" + p) : "/odata/v4/" + short(s.name).replace(/Service$/, "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(); };
const listOf = (arr, max) => arr.length > max ? arr.slice(0, max).join(", ") + " +" + (arr.length - max) + " more" : arr.join(", ");
const roleNames = (xs?.["role-templates"] || []).map((r) => r.name).filter(Boolean);
const roles = roleNames.length ? roleNames : [...new Set(svcEntities.flatMap(([, d]) => (grantsOf(d) || []).flatMap((g) => g.to)).filter((r) => !/^(any|authenticated-user|system-user)$/.test(r)))];
const srvMod = mtaModules.find((m) => m.type === "nodejs");
const dbRes = mtaResources.find((r) => /hdi|hana/i.test("" + r.type + " " + r.service));
const uaaRes = mtaResources.find((r) => r.service === "xsuaa");
const repoRes = mtaResources.find((r) => r.service === "html5-apps-repo");
const srvDest = mtaDest.find((d) => /srv-api/.test(d.name)) || mtaDest[0];
const devDb = profileVal("db", "kind").find(([p]) => p === "development")?.[1] || (deps["@cap-js/sqlite"] ? "sqlite" : "");
const svcInfo = services.map((s, i) => {
  const ents = svcEntities.filter(([n]) => n.startsWith(s.name + ".") && n.split(".").length === s.name.split(".").length + 1);
  return { id: "S" + i, name: short(s.name), path: svcPath(s),
    entities: ents.map(([n, d]) => short(n) + (d["@odata.draft.enabled"] ? " (draft)" : "") + (d["@readonly"] ? " (read-only)" : "")),
    actions: ents.flatMap(([n, d]) => Object.keys(d.actions || {}).map((a) => short(n) + "." + a)).concat(Object.entries(defs).filter(([n, d]) => (d.kind === "action" || d.kind === "function") && n.startsWith(s.name + ".")).map(([n]) => short(n))) };
});
const handlerFiles = srcFiles.map((f) => path.relative(root, f).replace(/\\/g, "/"));
function archDiagram() {
  const L = ["```mermaid", "flowchart LR"];
  L.push("  subgraph USERS[\"Users — role collections\"]");
  (roles.length ? roles : ["Business user"]).forEach((r) => L.push("    R_" + mid(r) + "[\"" + ml(r) + "\"]"));
  L.push("  end");
  const btp = !!mta;
  if (btp) L.push("  subgraph BTP[\"SAP BTP subaccount — Cloud Foundry\"]");
  else L.push("  subgraph DEV[\"Local development — " + (services.length ? "npm run watch" : "npm start, offline mock") + " (no mta.yaml yet)\"]");
  if (uis.length && btp) {
    const tiles = uis.flatMap((u) => u.tiles.map((t) => t[1])).filter(Boolean);
    L.push("    WZ[\"SAP Build Work Zone" + (tiles.length ? "<br/>tiles: " + ml(listOf(tiles, 4)) : "") + "\"]");
    L.push("    RT[\"HTML5 Application Runtime<br/>routes from xs-app.json\"]");
    L.push("    subgraph REPO[\"HTML5 Application Repository" + (repoRes ? " — " + ml(repoRes.name) : "") + "\"]");
    uis.forEach((u, i) => L.push("      UI" + i + "[\"" + ml(u.name) + "<br/>" + ml(u.floorplan) + "\"]"));
    L.push("    end");
    if (services.length) L.push("    DEST[(\"Destination " + ml(srvDest?.name || "srv-api") + (srvDest?.fwd === "Yes" ? "<br/>forwards the user JWT" : "") + "\")]");
  } else if (uis.length) {
    L.push("    LOCAL[\"" + (services.length ? "cds watch + cds-plugin-ui5<br/>http://localhost:4004" : "fiori run — ui5-mock.yaml<br/>http://localhost:8080") + "\"]");
    uis.forEach((u, i) => L.push("    UI" + i + "[\"" + ml(u.name) + "<br/>" + ml(u.floorplan) + "\"]"));
  }
  if (btp && (uaaRes || xs)) L.push("    UAA[\"XSUAA " + ml(uaaRes?.name || xs?.xsappname || "") + (roles.length ? "<br/>role templates: " + ml(listOf(roles, 6)) : "") + "\"]");
  if (services.length) {
    L.push("    subgraph CAP[\"CAP service" + (srvMod ? " " + ml(srvMod.name) : "") + " — Node.js\"]");
    for (const s of svcInfo) L.push("      " + s.id + "[\"" + ml(s.name) + "<br/>" + ml(s.path) + "<br/>entities: " + ml(listOf(s.entities, 6) || "—") + (s.actions.length ? "<br/>actions: " + ml(listOf(s.actions, 6)) : "") + "\"]");
    if (handlerFiles.length) L.push("      H[\"handlers: " + ml(listOf(handlerFiles, 4)) + "\"]");
    L.push("    end");
    if (btp && dbRes) L.push("    DB[(\"SAP HANA Cloud — HDI container " + ml(dbRes.name) + "<br/>" + dbEntities.length + " tables\")]");
    else if (devDb) L.push("    DB[(\"" + ml(devDb) + " — development database<br/>" + dbEntities.length + " tables\")]");
  } else if (uis.length) {
    const ds = [...new Set(uis.flatMap((u) => u.ds))];
    L.push("    BE[\"Backend OData service<br/>" + ml(listOf(ds, 2) || "data source from the manifest") + "\"]");
  }
  L.push("  end");
  remotes.forEach(([k, v], i) => L.push("  X" + i + "[\"" + ml(k) + "<br/>" + ml(v.kind || "") + (v.credentials?.destination ? " via destination " + ml(v.credentials.destination) : "") + "\"]"));
  // edges
  const userIds = (roles.length ? roles : ["Business user"]).map((r) => "R_" + mid(r));
  const entry = uis.length ? (btp ? "WZ" : "LOCAL") : services.length ? svcInfo[0].id : null;
  if (entry) L.push("  " + userIds.join(" & ") + " --> " + entry);
  if (uis.length && btp) {
    L.push("  WZ --> RT");
    uis.forEach((u, i) => L.push("  RT -->|app files| UI" + i));
    if (services.length) { L.push("  RT -->|odata routes, user JWT| DEST"); svcInfo.forEach((s) => L.push("  DEST --> " + s.id)); }
    else L.push("  RT -->|destination| BE");
    if (uaaRes || xs) L.push("  RT -.->|login| UAA");
  } else if (uis.length) {
    uis.forEach((u, i) => L.push("  LOCAL -->|serves| UI" + i));
    svcInfo.forEach((s) => L.push("  LOCAL -->|OData| " + s.id));
    if (!services.length) L.push("  LOCAL -->|mock or proxy| BE");
  }
  if (btp && (uaaRes || xs)) svcInfo.forEach((s) => L.push("  " + s.id + " -.->|JWT check, @restrict| UAA"));
  if (services.length && (dbRes || devDb)) svcInfo.forEach((s) => L.push("  " + s.id + " --> DB"));
  if (handlerFiles.length) svcInfo.forEach((s) => L.push("  " + s.id + " --- H"));
  remotes.forEach((r, i) => L.push("  " + (services.length ? svcInfo[0].id : "BE") + " -->|remote service| X" + i));
  L.push("```");
  return L.join("\n");
}
// main use case for the flow diagram: the first entity a UI lists (UI.LineItem), else the first service entity
const mainEnt = svcEntities.find(([, d]) => annoList(d, "@UI.LineItem").length) || svcEntities[0];
function flowDiagram() {
  if (!mainEnt) return null;
  const [mn, md] = mainEnt; const svc = svcOf(mn); const si = svcInfo.find((s) => s.name === short(svc.name));
  const ent = short(mn), sv = short(svc.name), ui = uis[0], btp = !!mta && !!ui;
  const acts = Object.keys(md.actions || {});
  // the actor: a role that may change the main entity (UPDATE / WRITE / *), else the first role
  const editor = (grantsOf(md) || []).find((g) => g.grant.some((x) => /^(UPDATE|WRITE|\*)$/i.test(x)))?.to.find((r) => !/^(any|authenticated-user)$/.test(r));
  const L = ["```mermaid", "sequenceDiagram"];
  if (ui) L.push("  actor U as " + ml(editor || roles[0] || "User"));
  if (ui) L.push("  participant UI as " + ml(ui.name + " — " + ui.floorplan.replace(/^Fiori Elements /, "")));
  else L.push("  participant UI as " + ml("API client — " + (editor || roles[0] || "technical user")));
  if (btp) L.push("  participant RT as HTML5 App Runtime");
  L.push("  participant S as " + ml(sv + " — CAP " + si.path));
  L.push("  participant DB as " + ml(dbRes ? "SAP HANA Cloud" : devDb || "Database"));
  const to = btp ? "RT" : "S";
  if (ui) L.push("  U->>UI: open the app" + (ui.tiles[0] ? " (tile " + ml(ui.tiles[0][1]) + ")" : ""));
  L.push("  UI->>" + to + ": GET $metadata");
  if (btp) L.push("  RT->>S: forward with the user JWT (destination " + ml(srvDest?.name || "srv-api") + ")");
  L.push("  S-->>UI: service metadata");
  if (btp) L.push("  Note over UI,S: every later OData call takes the same route through the runtime and the destination");
  L.push("  UI->>S: GET " + ml(ent) + " list (filter, paging)");
  L.push("  S->>DB: SELECT " + ml(ent));
  L.push("  S-->>UI: rows");
  L.push("  U->>UI: open one entry");
  L.push("  UI->>S: GET " + ml(ent) + "(key)");
  if (md["@odata.draft.enabled"]) {
    L.push("  U->>UI: Edit");
    L.push("  UI->>S: POST " + ml(ent) + "(key)/draftEdit");
    L.push("  UI->>S: PATCH the draft (changed fields only)");
    L.push("  U->>UI: Save");
    L.push("  UI->>S: POST draftActivate");
  } else {
    L.push("  U->>UI: change and save");
    L.push("  UI->>S: PATCH " + ml(ent) + "(key) (changed fields only)");
  }
  L.push("  S->>S: before UPDATE handlers (validation 400, conflict 409)");
  L.push("  S->>DB: UPDATE " + ml(ent));
  L.push("  S-->>UI: saved entry");
  for (const a of acts.slice(0, 3)) {
    L.push("  opt action " + ml(a));
    L.push("    U->>UI: " + ml(a));
    L.push("    UI->>S: POST " + ml(ent) + "(key)/" + ml(sv + "." + a));
    L.push("    S->>DB: UPDATE " + ml(ent));
    L.push("  end");
  }
  L.push("```");
  // no UI: the API client calls the service itself — drop the user interactions
  return (ui ? L : L.filter((l) => !/^\s*U->>UI/.test(l))).join("\n");
}
sec("### 3.4 Detailed Architecture Diagram",
  "*Generated from `mta.yaml`, `xs-security.json`, the compiled CDS model, the UI manifests and `package.json` — re-run the scaffold after a change. Mermaid: renders on GitHub, Azure DevOps, GitLab and Confluence (Mermaid macro), and in VS Code / SAP Business Application Studio with a Mermaid preview extension.*",
  archDiagram());
P("---", "");

P("## 4. Functional Specification", "", "### 4.1 Detail Description of To-Be Process", "");
sec("#### 4.1.1 Application Functionality", todo("what users do with the app, per role — from the FD and the REQ list"));
sec("#### 4.1.2 User Stories", reqs.length ? "See the Requirement Traceability Matrix (" + reqs.length + " requirements)." : null, todo("one user story per functional requirement: As a <role> I want … so that …"));
sec("#### 4.1.3 Screen Flows", uis.length ? table(["UI module", "App ID", "Floorplan", "OData data source"], uis.map((u) => [u.dir, u.id || "—", u.floorplan, u.ds.join("<br>") || "—"])) : "No UI module (service-only application).", todo("the navigation flow between screens (list → object page → sub-object page / dialogs)"));
const modelRows = [];
for (const [n, d] of dbEntities) Object.entries(d.elements || {}).forEach(([en, e]) => { if (!e.virtual || true) modelRows.push([short(n), en, typeOf(e), rules(e, en)]); });
sec("#### 4.1.4 Enhancement Details", todo("overview of the data model and the custom logic it carries"),
  "**Data Model / Field Table** (from the compiled CDS model):", "",
  modelRows.length ? table(["Entity", "Attribute Name", "Field Length / Type", "Validation / Comments"], modelRows) : todo(cdsNote || "no CDS model found — describe the data structures used"));
const selRows = [], listRows = [], createRows = [];
for (const [n, d] of svcEntities) {
  annoList(d, "@UI.SelectionFields").forEach((f) => { const p = path2(f); const el = d.elements?.[p.split(".")[0]]; selRows.push([short(n), p, el ? rules(el, p) : "—", d.elements?.[p]?.["@Common.ValueList"] || d.elements?.[p + "_ID"] || /_code$|_ID$/.test(p) ? "value help" : "—"]); });
  annoList(d, "@UI.LineItem").filter((x) => x?.$Type !== "UI.DataFieldForAction" && x?.Value).forEach((x) => { const p = path2(x.Value); const el = d.elements?.[p.split(".")[0]]; listRows.push(["List Display", p, label(x.Label) || (el ? label(el["@title"] || el["@Common.Label"]) : ""), short(n), x.Criticality ? "Display (criticality " + path2(x.Criticality) + ")" : "Display", "", "", "", ""]); });
  fieldGroups(d).forEach((f) => { const el = d.elements?.[f.path.split(".")[0]]; createRows.push(["Create / Edit", f.path, f.label || (el ? label(el["@title"] || el["@Common.Label"]) : ""), short(n), el?.type === "cds.Association" ? "Value help" : el?.enum || defs[el?.type]?.enum ? "Select" : "Input", d["@odata.draft.enabled"] ? "draft" : "", el?.notNull || el?.["@mandatory"] ? "Yes" : "No", el?.default?.val ?? "", el ? rules(el, f.path) : ""]); });
}
sec("#### 4.1.5 Selection Screen", todo("describe the filter bar / search behaviour"), selRows.length ? "**Selection Screen Fields** (`@UI.SelectionFields`):\n\n" + table(["Entity", "Field", "On Screen Validation", "Value help"], selRows) : (uis.length ? todo("no @UI.SelectionFields — describe the search / filter controls of the UI") : "Not applicable — no UI."));
sec("#### 4.1.6 Expected Screen Layout and Functionality", todo("screen layout per page (list columns, object page sections / facets, buttons) and a Processing Logic table: Nr | Processing | Description"));
const FM = ["Screen", "Field Name", "Label", "Ref Table", "UI Type", "Feature", "Mandatory", "Default Value", "Logic / Validation"];
sec("#### 4.1.7 Input Parameters / Field Mapping",
  "**List Display** (`@UI.LineItem`):", "", listRows.length ? table(FM, listRows) : todo("list columns of the UI"), "",
  "**New Create / Edit Screen** (`@UI.FieldGroup`):", "", createRows.length ? table(FM, createRows) : todo("fields of the create / edit screen"));
const actionRows = [];
for (const s of services) {
  for (const [n, d] of svcEntities.filter(([n]) => n.startsWith(s.name + "."))) for (const [an, a] of Object.entries(d.actions || {})) {
    const inUi = [...annoList(d, "@UI.LineItem"), ...annoList(d, "@UI.Identification")].some((x) => x?.$Type === "UI.DataFieldForAction" && String(x.Action).endsWith(an));
    const errs = handlerRows.filter((h) => h.ctx.includes(an)).map((h) => "" + h.code + " " + h.msg).join("; ");
    actionRows.push(["" + short(n) + "." + an + "(" + Object.entries(a.params || {}).map(([p, v]) => "" + p + ": " + String(v.type || "").replace(/^cds\./, "")).join(", ") + ")", "" + (a.kind === "function" ? "Function" : "Action") + (inUi ? " — button (UI.DataFieldForAction)" : ""), grantsOf(a) ? "roles: " + grantsOf(a).map((g) => g.to.join("/")).join(", ") : "—", errs || "—"]);
  }
  for (const [n, a] of Object.entries(defs).filter(([n, d]) => (d.kind === "action" || d.kind === "function") && n.startsWith(s.name + "."))) actionRows.push(["" + short(n) + "(" + Object.keys(a.params || {}).join(", ") + ") — unbound", a.kind, "—", handlerRows.filter((h) => h.ctx.includes(short(n))).map((h) => "" + h.code + " " + h.msg).join("; ") || "—"]);
}
sec("#### 4.1.8 Actions", actionRows.length ? table(["Action", "UI Control", "Details", "Error Handling"], actionRows) : "No custom actions besides the standard create / edit / delete (draft) operations.", actionRows.length ? todo("one sentence per action: business effect, state transition and when it is available") : null);
sec("#### 4.1.9 Additional Screen Validations", todo("field / cross-field validations the user sees — the server-side ones are listed in §6.1"));
sec("#### 4.1.10 Processing Logic", todo("handler logic per event (before / on / after) — computed fields, defaults, status transitions; files under srv/"));
sec("#### 4.1.11 Batch Job Processing Requirement", todo("background / scheduled processing, or state that none is required"));
P("---", "");

P("## 5. Integration Design", "");
sec("### 5.1 Integration Overview", todo(remotes.length ? "describe each integration listed below" : "no remote service in cds.requires — state that the app is self-contained or describe its integrations"));
sec("### 5.2 Integration Flows", table(["#", "Source System", "Target System", "Protocol", "Auth Type", "Trigger", "Error Handling", "SLA"], [
  ...uis.map((u, i) => [String(i + 1), "UI " + u.dir, csn ? "CAP service" : "OData service", u.ds.length ? "OData" : "—", mtaDest.some((d) => d.fwd === "Yes") ? "JWT (forwarded user token)" : authKinds, "Real-time", "message box / toast", TEAM]),
  ...remotes.map(([k, v], i) => [String(uis.length + i + 1), "CAP service", k, v.kind, v.credentials?.destination ? "destination " + v.credentials.destination : "—", "Real-time", TEAM, TEAM])]) || "None.");
sec("### 5.3 Destination Configuration", mtaDest.length ? table(["Destination Name", "URL", "Auth", "Forward Auth Token"], mtaDest.map((d) => [d.name, d.url, d.auth, d.fwd])) : "No destinations in mta.yaml.");
P("---", "");

P("## 6. Error Handling", "");
sec("### 6.1 Validation Errors (4xx)", handlerRows.length ? table(["Module / Handler", "Condition", "HTTP Code", "Message"], handlerRows.map((h) => ["" + h.file + ":" + h.line + " (" + h.ctx + ")", h.kind === "warn" ? "warning" : "see handler", h.code, h.msg])) : "No `req.error / req.reject` calls in srv/.", handlerRows.length ? todo("fill the Condition column in plain words for each row") : null);
const authErr = [];
for (const [n, d] of [...svcEntities, ...Object.entries(defs).filter(([n, d]) => (d.kind === "action" || d.kind === "function") && svcOf(n))]) {
  const g = grantsOf(d); if (!g) continue;
  for (const op of d.kind === "entity" ? OPS : ["EXECUTE"]) { const roles = [...new Set(g.filter((x) => x.grant.includes(op) || x.grant.includes("*") || x.grant.includes("WRITE") && op !== "READ").flatMap((x) => x.to))]; authErr.push(["" + short(n) + " " + op, "user without " + (roles.join(" / ") || "any granted role"), "403 Forbidden (CAP @restrict)"]); }
}
sec("### 6.2 Authorization Errors (403)", authErr.length ? table(["Handler", "Condition", "Message"], authErr) : todo("no @restrict found — describe how unauthorized access is rejected"));
sec("### 6.3 System / Integration Errors (5xx)", todo("timeouts / unavailable services and how the UI reports them"));
P("---", "");

P("## 7. Security and Authorization", "");
sec("### Business Roles", xs?.["role-templates"]?.length ? table(["Role", "Description", "Scopes"], xs["role-templates"].map((r) => [r.name, r.description || "", (r["scope-references"] || []).map((s) => s.replace("$XSAPPNAME.", "")).join(", ")])) : todo("no xs-security.json — list the business roles"));
const tiles = uis.flatMap((u) => u.tiles.map((t) => [u.dir, ...t]));
sec("### 7.1 Fiori Tile Requirements", tiles.length ? table(["UI module", "Inbound", "Intent", "Tile title"], tiles) : todo("Launchpad tiles: no crossNavigation inbound in the manifest yet — state the tile(s) needed or that none are"));
sec("### 7.2 Authentication Mechanism", table(["Profile", "Auth kind"], profileVal("auth", "kind")) || todo("authentication per environment"), todo("explain the profiles (development dummy · roles mocked users · production XSUAA + JWT forwarding)"));
const matrix = [];
for (const s of services) {
  const sr = s.def["@requires"]; matrix.push([s.name, "(service)", sr ? [].concat(sr).join(", ") : "—", "@requires"]);
  for (const [n, d] of svcEntities.filter(([n]) => n.startsWith(s.name + "."))) {
    const g = grantsOf(d);
    if (!g) { matrix.push([s.name, short(n), "⚠ no @restrict — open to every authenticated user", ""]); continue; }
    for (const x of g) matrix.push([s.name, short(n), x.to.join(", "), "" + x.grant.join(", ") + (x.where ? " where " + (typeof x.where === "string" ? x.where : JSON.stringify(x.where)) : "")]);
    for (const [an, a] of Object.entries(d.actions || {})) { const ga = grantsOf(a); if (ga) for (const x of ga) matrix.push([s.name, "" + short(n) + "." + an, x.to.join(", "), "EXECUTE"]); }
  }
}
sec("### 7.3 Authorization Checks", matrix.length ? table(["Service", "Entity / Action", "Roles", "Grant"], matrix) : todo("authorization checks"), handlerRows.some((h) => h.code === "403") ? "Programmatic checks (`req.user.is()`): " + handlerRows.filter((h) => h.code === "403").map((h) => "`" + h.file + ":" + h.line + "`").join(", ") : null);
P("---", "");

P("## 8. Nonfunctional Requirements", "");
sec("### 8.1 Response Time", todo("targets, paging (growingThreshold / $top), $select/$expand"));
sec("### 8.2 Availability", todo("BTP SLA, instances, rolling deploy"));
sec("### 8.3 Scalability", todo("data volumes and scaling approach"));
sec("### 8.4 Maintainability", todo("structure, logging (cds.log), i18n, Clean Core, upgrade path via stack.json"));
P("---", "", "## 9. Additional Requirements", "");
sec("### 9.1 Compliance & Regulatory", todo("personal data (DPP), audit logging, retention — or state not applicable"));
P("---", "", "## 10. Testing Requirements", "");
sec("### 10.1 Key Business Test Conditions", todo("ID | Test ID | Test Description | Expected Results | Sprint Ref — one row per key REQ (see Unit-Testing-Document.md when present)"));
const csvDir = ["db/data", "db/csv"].map((d) => path.join(root, d)).find(exists);
const csvRows = csvDir ? fs.readdirSync(csvDir).filter((f) => /\.csv$/i.test(f)).map((f) => [f, String(Math.max(0, read(path.join(csvDir, f)).split(/\r?\n/).filter((l) => l.trim()).length - 1))]) : [];
sec("### 10.2 Test Data", csvRows.length ? "Seed data deployed with the model (`" + path.relative(root, csvDir).replace(/\\/g, "/") + "`):\n\n" + table(["File", "Rows"], csvRows) : todo("test data sources"));
P("---", "");
sec("## 11. Additional Supporting / Reference Documentation", refs.join("\n"));
P("---", "");
const gaps = exists(path.join(root, "deliverables", "Coverage-Report.md")) ? read(path.join(root, "deliverables", "Coverage-Report.md")).split(/\r?\n/).filter((l) => /^\|\s*REQ-\d+/.test(l) && /\bGap\b/i.test(l)).map((l) => l.split("|")[1].trim()) : [];
sec("## 12. Open Issues", gaps.length ? "Open coverage gaps from Coverage-Report.md: " + gaps.join(", ") + "." : null, todo("Issue No | Description | Assigned To | Status | Impact | Resolution — include open coverage gaps, deferred review findings and unresolved assumptions"));
P("---", "", "## 13. Application Design", "");
sec("### 13.1 Application Design Overview", todo("pattern chosen (side-by-side CAP extension …), its rationale and the rejected alternatives — from Application-Architecture.md"));
sec("### 13.2 Application Design Checklist (ADC)", todo("checklist: Clean Core, released APIs only, @restrict on every entity, no hard-coded URLs/secrets, i18n, draft, forwardAuthToken in both places, …"));
sec("### 13.3 Application Design Diagram", "The diagram is §3.4 Detailed Architecture Diagram; the deployment units it shows:", mtaModules.length ? table(["MTA module", "Type", "Path"], mtaModules.map((m) => [m.name, m.type || "", m.path || ""])) + "\n\n" + (table(["BTP resource", "Service", "Plan"], mtaResources.map((r) => [r.name, r.service || r.type || "", r.plan || ""])) || "") : todo("no mta.yaml — describe the deployment units"), "*(Technologies: " + [...new Set(["CAP Node.js", ...uis.map((u) => u.floorplan.replace(/ \(.*/, "")), ...mtaResources.map((r) => r.service).filter(Boolean)])].join(", ") + ")*");
sec("### 13.4 Application Design Flow Diagram",
  mainEnt ? "Main use case — generated from the compiled CDS model and the deployment configuration: main entity `" + short(mainEnt[0]) + "`, " + (mainEnt[1]["@odata.draft.enabled"] ? "draft-enabled" : "no draft") + ", bound actions: " + (Object.keys(mainEnt[1].actions || {}).join(", ") || "none") + ". The full landscape is in §3.4." : null,
  flowDiagram(),
  todo("describe the main flow in two or three sentences (who starts it, which validations and status changes happen); adjust the diagram where the real flow differs"));
sec("### 13.5 Application Design Limitations", todo("known limitations"));
sec("### 13.6 Custom Developments in S/4", "None — side-by-side extension on SAP BTP; no S/4HANA modification (Clean Core).", todo("confirm, or list released S/4 APIs consumed"));
P("---", "");
sec("## 14. Data Migration *(Optional)*", todo("only if initial data migration is in scope — otherwise replace this marker with \"Not applicable: <reason>\""));

const out = D.join("\n").replace(/\n{3,}/g, "\n\n");
fs.mkdirSync(path.dirname(docFile), { recursive: true });
fs.writeFileSync(docFile, out);
const markers = out.split("\n").filter((l) => l.includes(MARK)).length;
console.log("TDD scaffold written: " + docFile);
console.log("  facts: " + dbEntities.length + " entities (" + modelRows.length + " fields) · " + services.length + " services · " + actionRows.length + " actions · " + matrix.length + " authorization rows · " + handlerRows.length + " handler messages · " + reqs.length + " requirements · " + uis.length + " UI module(s)");
if (cdsNote) console.log("  note: " + cdsNote);
console.log("  " + markers + " \"" + MARK + "\" block(s) to write — replace each with an Edit (one section per Edit), then run --check");
