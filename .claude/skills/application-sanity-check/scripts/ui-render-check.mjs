#!/usr/bin/env node
/**
 * ui-render-check.mjs — deterministic browser smoke for a running Fiori / freestyle UI5 app.
 *
 * A 200 on index.html proves nothing: the UI can still be blank (UI5 CDN 404, Component.ts not
 * transpiled, 401 on $metadata), a route can crash (invalid Form content), or rows can render with
 * no data. This script loads the app in headless Chrome/Edge via the DevTools protocol and FAILS
 * on what a user would actually see.
 *
 * Runtime checks 5–10 (the browser part of the runtime checks; 1–4 are the server probes of
 * smoke-check.mjs, which runs this script and merges the rows into one table):
 *          5 UI5 core loaded · 6 a view/page rendered · 7 no fatal console errors / uncaught
 *          exceptions · 8 no failed requests (>= 400) · 9 first list row (if any) navigates and the
 *          target renders without new errors · 10 an empty PATCH on the first row is accepted
 *          (catches UPDATE validators that reject partial saves).
 *
 * Usage:   node <this-skill>/scripts/ui-render-check.mjs <app-url> [waitMs=30000] [--json]
 *          e.g. http://localhost:4004/<ui5.yaml metadata.name>/index.html   (CAP + cds-plugin-ui5)
 * Exit:    0 = no FAIL · 1 = FAIL · 0 + SKIP when no Chrome/Edge is installed (reported, not hidden)
 * Needs:   the app running (npm run watch) · Node 22+ (global WebSocket/fetch) · Chrome or Edge.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const asJson = process.argv.includes("--json");
const [, , url, waitArg] = process.argv.filter((a) => a !== "--json");
if (!url) { console.error("usage: node ui-render-check.mjs <app-url> [waitMs]"); process.exit(2); }
// Local dev servers only: runtime check 10 sends a (harmless, empty) PATCH — it must never reach a shared or productive system.
{
  let host = "";
  try { const u = new URL(url); host = /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase() : ""; } catch { /* invalid URL */ }
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) {
    console.error("ui-render-check: " + url + " is not a local dev server (localhost / 127.0.0.1) — refusing to run.");
    process.exit(2);
  }
}
const WAIT = Number(waitArg || 30000);
// Known local-dev noise that never indicates a broken UI (no flexibility/LREP backend locally, etc.).
const NOISE = [/Component-preload\.js/, /LrepConnector/, /\/sap\/bc\/lrep\//, /fallback locale/i, /i18n_[a-z]{2}(_[A-Z]{2})?\.properties/,
  /livereload/i, /favicon\.ico/, /chrome-extension:/, /Device API logging/,
  /storeInnerAppStateAsync/ /* sap.fe app state via FLP shell services — absent when index.html runs outside the launchpad */];
const noisy = (s) => NOISE.some((r) => r.test(s));
// UI5 / sap.fe log many framework-internal messages at error level (PropertyInfoValidator, S/CUBE,
// CommandExecution shortcuts …). Only these patterns mean the user-visible UI is broken → FAIL;
// any other console error is reported as WARN so it is visible but does not block.
const FATAL = [/failed to load (JavaScript resource|component)/i, /ModuleError/, /is not a valid .*content/i,
  /error occurred while displaying routing target/i, /Failed to (update|read|request|create|delete|drill-down|get)/i,
  /Communication error/i, /\b(TypeError|ReferenceError|SyntaxError)\b/, /Cannot read propert/i,
  /formatter function .* not found/i, /could not (find|load) (view|controller)/i];
const fatal = (s) => /EXCEPTION/.test(s) || FATAL.some((r) => r.test(s));

const browsers = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
];
const exe = process.env.CHROME_PATH || browsers.find((b) => fs.existsSync(b));
const results = [];
const add = (id, title, status, detail) => results.push({ id, title, status, detail });
const TITLES = { 5: "UI5 core loaded", 6: "A page rendered", 7: "No fatal console errors", 8: "No failed requests (>= 400)", 9: "First row opens its detail page", 10: "Save (empty partial update) accepted" };
/** No browser / no page: every browser check is reported as SKIP with the reason — never as PASS. */
const skipAll = (why) => { for (const id of [5, 6, 7, 8, 9, 10]) add(id, TITLES[id], "SKIP", id === 5 ? why : "not run — " + why.split(" — ")[0]); };
function report() {
  results.sort((a, b) => a.id - b.id);
  if (asJson) { console.log(JSON.stringify(results)); return results.filter((r) => r.status === "FAIL").length; }
  const icon = { PASS: "✅ PASS", FAIL: "❌ FAIL", WARN: "⚠️ WARN", SKIP: "— SKIP" };
  console.log("Runtime checks 5–10 (browser) — " + url + "\n");
  console.log("| # | Check | Result | Detail |\n|---|---|---|---|");
  for (const r of results) console.log("| " + r.id + " | " + r.title + " | " + icon[r.status] + " | " + String(r.detail).replace(/\|/g, "\\|").replace(/\n/g, " ") + " |");
  const fails = results.filter((r) => r.status === "FAIL").length;
  console.log("\nSummary: " + fails + " FAIL · " + results.filter((r) => r.status === "WARN").length + " WARN · " + results.filter((r) => r.status === "PASS").length + " PASS");
  return fails;
}
if (!exe) { skipAll("no Chrome/Edge found — set CHROME_PATH; the UI was NOT verified in a browser"); report(); process.exit(0); }

// Port 0: Chrome picks a free debugging port and writes it to <profile>/DevToolsActivePort — parallel
// runs never collide and nothing has to poll an HTTP endpoint.
const prof = fs.mkdtempSync(path.join(os.tmpdir(), "ui-render-"));
const browser = spawn(exe, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-extensions",
  "--remote-debugging-port=0", "--user-data-dir=" + prof, "--window-size=1400,900", "about:blank"], { stdio: "ignore" });
browser.on("error", () => { /* e.g. CHROME_PATH points to a missing file — reported as "could not start" below */ });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = () => { try { browser.kill(); } catch {} };

let wsUrl;
for (let i = 0; i < 80 && !wsUrl; i++) {
  try {
    const [devPort, devPath] = fs.readFileSync(path.join(prof, "DevToolsActivePort"), "utf8").split(/\r?\n/).map((s) => s.trim());
    if (/^\d+$/.test(devPort) && devPath) wsUrl = "ws://127.0.0.1:" + devPort + devPath;   // the browser endpoint
  } catch {}
  if (!wsUrl) await sleep(250);
}
if (!wsUrl) { skipAll("could not start " + exe + " with remote debugging — the UI was NOT verified in a browser"); report(); cleanup(); process.exit(0); }

const sock = new WebSocket(wsUrl);
await new Promise((r) => sock.addEventListener("open", r));
let seq = 0; const pending = new Map();
const errors = [], failed = [];
let phase = "load";
sock.addEventListener("message", (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") {
    const t = d.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
    if (!noisy(t)) errors.push(("[" + phase + "] " + t).slice(0, 260));
  } else if (d.method === "Runtime.exceptionThrown") {
    const t = d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text || "";
    if (!noisy(t)) errors.push(("[" + phase + "] EXCEPTION " + t).slice(0, 260));
  } else if (d.method === "Network.responseReceived") {
    const r = d.params.response;
    if (r.status >= 400 && !noisy(r.url)) failed.push(("[" + phase + "] " + r.status + " " + r.url).slice(0, 220));
  } else if (d.method === "Network.loadingFailed" && !d.params.canceled) {
    failed.push(("[" + phase + "] " + d.params.errorText + " (" + d.params.type + ")").slice(0, 220));
  }
});
const raw = (method, params = {}, sessionId) => new Promise((r) => { const i = ++seq; pending.set(i, r); sock.send(JSON.stringify(sessionId ? { id: i, method, params, sessionId } : { id: i, method, params })); });
// Attach to the about:blank page Chrome opened (flat session: its events arrive on this socket).
const pageTarget = (await raw("Target.getTargets")).result?.targetInfos?.find((t) => t.type === "page");
const session = pageTarget && (await raw("Target.attachToTarget", { targetId: pageTarget.targetId, flatten: true })).result?.sessionId;
if (!session) { skipAll("could not attach to a page of " + exe + " — the UI was NOT verified in a browser"); report(); cleanup(); process.exit(0); }
const send = (method, params = {}) => raw(method, params, session);
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send("Runtime.enable");
await send("Network.enable");
await send("Page.navigate", { url });

// wait for UI5 + first rendering, then let pending OData requests settle
const RENDERED = `(() => { const v = document.querySelectorAll('.sapUiView, .sapMPage, .sapFDynamicPage, .sapUxAPObjectPageLayout, .sapMShell'); return v.length; })()`;
let ui5 = false, rendered = 0;
for (let t = 0; t < WAIT; t += 1000) {
  ui5 = await evaluate("!!(window.sap && sap.ui && sap.ui.require)");
  rendered = (await evaluate(RENDERED)) || 0;
  if (ui5 && rendered) break;
  await sleep(1000);
}
await sleep(6000);
rendered = (await evaluate(RENDERED)) || rendered;
const rows = (await evaluate(`(() => { const E = window.sap && sap.ui.require("sap/ui/core/Element"); if (!E) return 0;
  return E.registry.filter((e) => e.isA("sap.m.ListItemBase") && e.getBindingContext && e.getBindingContext()).length; })()`)) || 0;

add(5, TITLES[5], ui5 ? "PASS" : "FAIL", ui5 ? "sap-ui-core.js executed" : "sap-ui-core.js never ran — wrong/non-existent CDN version or bootstrap path (check the failed requests below)");
add(6, TITLES[6], rendered ? "PASS" : "FAIL", rendered ? "" + rendered + " view/page element(s) · " + rows + " bound list row(s)" : "nothing rendered — blank page");

// Runtime 10: a partial update must be accepted. OData PATCH carries only the changed fields; an
// UPDATE validator that demands e.g. `name` on every PATCH makes every Save fail with 400.
// An empty PATCH is a no-op, so this is safe on real data. Draft-enabled entities are edited
// through drafts (PATCH on the active entity is rejected by design) → SKIP.
phase = "probe"; // the probe's own request is judged by runtime check 10, not 7/8
const patch = await evaluate(`(async () => { const E = sap.ui.require("sap/ui/core/Element");
  const r = E.registry.filter((e) => e.isA("sap.m.ListItemBase") && e.getBindingContext && e.getBindingContext())[0];
  if (!r) return { skip: "no bound row" };
  const ctx = r.getBindingContext(); const m = ctx.getModel();
  if (!m.getServiceUrl || !ctx.getCanonicalPath) return { skip: "not an OData V4 row" };
  const p = ctx.getCanonicalPath();
  if (/IsActiveEntity=/.test(p)) return { skip: "draft-enabled entity (" + p + ")" };
  const res = await fetch(m.getServiceUrl() + p.replace(/^\\//, ""), { method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": "*" }, body: "{}" });
  let msg = ""; try { msg = (await res.json()).error?.message || ""; } catch {}
  return { status: res.status, path: p, msg };
})()`);
if (!patch) add(10, TITLES[10], "SKIP", "UI not loaded — fix runtime checks 5 and 6 first");
else if (patch.skip) add(10, TITLES[10], "SKIP", patch.skip);
else add(10, TITLES[10], patch && patch.status < 400 ? "PASS" : "FAIL",
  patch ? "PATCH " + patch.path + " → " + patch.status + (patch.msg ? " — " + patch.msg : "") + (patch.status >= 400 ? " — an UPDATE handler validates fields that a PATCH does not carry: every Save will fail" : "") : "could not run");

// Runtime 9: navigate via the first navigable bound row, like a user would
phase = "navigate";
let nav = "no navigable list row";
if (rows) {
  const before = await evaluate("location.hash");
  const fired = await evaluate(`(() => { const E = sap.ui.require("sap/ui/core/Element");
    const r = E.registry.filter((e) => e.isA("sap.m.ListItemBase") && e.getBindingContext() && (e.getType?.() === "Navigation" || e.getType?.() === "Active"))[0];
    if (!r) return false; r.firePress(); const l = r.getParent && r.getParent(); if (l && l.fireItemPress) l.fireItemPress({ listItem: r }); return true; })()`);
  if (fired) {
    await sleep(Math.min(WAIT, 15000));
    const after = await evaluate("location.hash");
    const renderedAfter = (await evaluate(RENDERED)) || 0;
    const navErrors = errors.filter((e) => e.startsWith("[navigate]") && fatal(e));
    nav = after === before ? "row press did not change the route" : "navigated to " + after;
    add(9, TITLES[9], after !== before && renderedAfter && !navErrors.length ? "PASS" : after === before ? "WARN" : "FAIL",
      navErrors.length ? "" + nav + " — errors: " + navErrors.slice(0, 2).join(" · ") : nav);
  } else add(9, TITLES[9], "SKIP", "rows are not navigable");
} else add(9, TITLES[9], "SKIP", nav);

const realErrors = errors.filter((e) => !e.startsWith("[probe]")), realFailed = failed.filter((e) => !e.startsWith("[probe]"));
const fatalErrors = realErrors.filter(fatal), otherErrors = realErrors.filter((e) => !fatal(e));
add(7, TITLES[7], fatalErrors.length ? "FAIL" : otherErrors.length ? "WARN" : "PASS",
  fatalErrors.length ? fatalErrors.slice(0, 4).join(" · ") : otherErrors.length ? "" + otherErrors.length + " non-fatal framework error log(s), e.g. " + otherErrors[0].slice(0, 160) : "clean");
add(8, TITLES[8], realFailed.length ? "FAIL" : "PASS", realFailed.length ? realFailed.slice(0, 4).join(" · ") : "all requests OK");
const fails = report();
cleanup();
process.exit(fails ? 1 : 0);
