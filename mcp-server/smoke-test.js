// Dependency-free smoke test: validates the tool registry without needing the MCP SDK.
// Run: node smoke-test.js   (or: npm run smoke)
import assert from "node:assert";
import { allTools } from "./tools/index.js";

const EXPECTED = [
  // CAP / Fiori scaffolding
  "scaffold_app",
  "validate_namespace",
  "add_cds_entity",
  "generate_annotations",
  "gen_mock_from_edmx",
  "configure_service",
  "patch_manifest",
  "run_checks",
  "clean_core_check",
  // Workflow UI (SAP Build Process Automation)
  "create_start_ui",
  "create_task_ui",
  // UI5 (replicated from github.com/UI5/mcp-server)
  "ui5_get_guidelines",
  "ui5_get_version_info",
  "ui5_get_api_reference",
  "ui5_get_project_info",
  "ui5_run_manifest_validation",
  "ui5_run_ui5_linter",
  // CAP (replicated from github.com/cap-js/mcp-server)
  "cap_search_model",
  "cap_search_docs",
  // Fiori (replicated from SAP/open-ux-tools fiori-mcp-server)
  "fiori_search_docs",
  "fiori_list_apps",
  "fiori_download_odata_metadata"
];

assert.equal(allTools.length, EXPECTED.length, "expected " + EXPECTED.length + " tools, got " + allTools.length);
for (const t of allTools) {
  assert.ok(t.name, "tool missing name");
  assert.ok(t.description && t.description.length > 20, "tool " + t.name + " needs a real description");
  assert.ok(t.inputSchema && t.inputSchema.type === "object", "tool " + t.name + " needs an object inputSchema");
  assert.equal(typeof t.handler, "function", "tool " + t.name + " missing handler");
}
const names = allTools.map((t) => t.name).sort();
assert.deepEqual(names, [...EXPECTED].sort(), "tool names do not match the expected set");

// Exercise a pure handler that needs no filesystem: generate_annotations inline.
const gen = allTools.find((t) => t.name === "generate_annotations");
const res = await gen.handler({
  target: "cds",
  service: "DemoService",
  entity: "Things",
  columns: ["name", "status"],
  statusField: "status",
  criticalityField: "statusCriticality"
});
assert.ok(res.content?.[0]?.text.includes("UI.LineItem"), "generate_annotations did not produce annotations");
assert.ok(res.content[0].text.includes("CriticalityRepresentation: #WithIcon"), "criticality representation missing");

// Workflow tools: environmentId must be a required input (GW0 — always asked, never defaulted).
for (const wfName of ["create_start_ui", "create_task_ui"]) {
  const wf = allTools.find((t) => t.name === wfName);
  assert.ok(wf, "" + wfName + " not registered");
  assert.ok(wf.inputSchema.required?.includes("environmentId"), "" + wfName + " must require environmentId");
  assert.ok(wf.inputSchema.required?.includes("namespace"), "" + wfName + " must require namespace");
  const bad = await wf.handler({ namespace: "com.acme.x" }); // missing environmentId
  assert.ok(bad.isError, "" + wfName + " should reject a call with no environmentId");
}

// Exercise ui5_get_guidelines — pure in-memory, no network.
const guidelines = allTools.find((t) => t.name === "ui5_get_guidelines");
const gRes = await guidelines.handler();
assert.ok(gRes.content?.[0]?.text.includes("sap.ui.define"), "ui5_get_guidelines missing coding rules");
assert.ok(gRes.content[0].text.includes("CAP"), "ui5_get_guidelines missing CAP section");

// Exercise cap_search_docs — pure in-memory keyword index.
const capDocs = allTools.find((t) => t.name === "cap_search_docs");
const capRes = await capDocs.handler({ query: "authorization restrict" });
assert.ok(capRes.content?.[0]?.text.includes("cap.cloud.sap"), "cap_search_docs did not return capire URLs");
assert.ok(/authorization/i.test(capRes.content[0].text), "cap_search_docs did not match the auth topic");

// Exercise fiori_search_docs — pure in-memory keyword index.
const fioriDocs = allTools.find((t) => t.name === "fiori_search_docs");
const fioriRes = await fioriDocs.handler({ query: "criticality status" });
assert.ok(/criticality/i.test(fioriRes.content?.[0]?.text || ""), "fiori_search_docs did not match the criticality topic");

// Manifest-preservation contract: configure_service must not clobber a wired dataSource, and
// patch_manifest must never drop generator metadata.
{
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const p = await import("node:path");
  const dir = await fs.mkdtemp(p.join(os.tmpdir(), "i2c-smoke-"));
  await fs.mkdir(p.join(dir, "webapp"));
  const mf = p.join(dir, "webapp", "manifest.json");
  const original = { _version: "1.60.0", "sap.app": { id: "x", dataSources: { mainService: { uri: "/odata/v4/purchase-order/", type: "OData",
    settings: { annotations: ["annotation"], odataVersion: "4.0" } } } },
    "sap.ui5": { dependencies: { minUI5Version: "1.120.0" }, models: { i18n: { settings: {} }, "": { dataSource: "mainService" } }, // stack-ignore
      routing: { targets: { T: { viewName: "Main", viewType: "XML" } } } } };
  await fs.writeFile(mf, JSON.stringify(original));
  const tool = (n) => allTools.find((t) => t.name === n);

  assert.ok((await tool("configure_service").handler({ appDir: dir, source: "cap" })).isError, "configure_service must require serviceUrl");
  await tool("configure_service").handler({ appDir: dir, source: "cap", serviceUrl: "/odata/v4/other/" });
  let m = JSON.parse(await fs.readFile(mf, "utf8"));
  assert.equal(m["sap.app"].dataSources.mainService.uri, "/odata/v4/purchase-order/", "configure_service overwrote a wired uri");
  assert.deepEqual(m["sap.app"].dataSources.mainService.settings.annotations, ["annotation"], "configure_service dropped annotations");

  await tool("patch_manifest").handler({ appDir: dir, ui5Version: "1.136.7" }); // stack-ignore
  m = JSON.parse(await fs.readFile(mf, "utf8"));
  assert.equal(m._version, "2.0.0");
  assert.equal(m["sap.ui5"].routing.targets.T.name, "Main", "viewName not migrated");
  assert.equal(m["sap.ui5"].routing.config.viewType, "XML", "viewType not moved to routing.config");
  assert.deepEqual(m["sap.app"].dataSources, original["sap.app"].dataSources, "patch_manifest changed dataSources");
  const verify = JSON.parse((await tool("patch_manifest").handler({ appDir: dir, mode: "verify" })).content[0].text);
  assert.equal(verify.pass, true, "snapshot verify should pass");
  await fs.rm(dir, { recursive: true, force: true });
}

// ui5_get_version_info parses the LIVE version.json shape (offline fixture): lines + LTS flags.
{
  const { parseVersionJson } = await import("./tools/ui5-mcp/ui5_get_version_info.js");
  const p = parseVersionJson({ latest: { version: "1.153.0" }, "1.153": { version: "1.153.0" }, "1.148": { version: "1.148.12", lts: true }, "1.136": { version: "1.136.23", lts: true } }); // stack-ignore
  assert.equal(p.latest, "1.153.0"); // stack-ignore
  assert.equal(p.latestLTS, "1.148.12"); // stack-ignore
  assert.deepEqual(p.lines.map((l) => l.line), ["1.153", "1.148", "1.136"]);
}

// Security (skill-scan fixes): no shell injection, no package download, no cross-site / rebinding access.
{
  const tool = (n) => allTools.find((t) => t.name === n);
  const os = await import("node:os");
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "i2c-sec-"));
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "sec", version: "1.0.0" }));
  const marker = path.join(dir, "pwned.txt");
  // 1) a crafted lint pattern is rejected before anything runs (it would break out of "…" in a shell)
  const inj = await tool("ui5_run_ui5_linter").handler({ projectDir: dir, filePatterns: ["x\" & echo pwned > \"" + marker + "\" & \""] });
  assert.ok(inj.isError && /filePatterns/.test(inj.content[0].text), "ui5_run_ui5_linter must reject shell metacharacters in filePatterns");
  for (const p of ["../outside/*.js", "C:/abs/*.xml", "--config=evil.js"]) assert.ok((await tool("ui5_run_ui5_linter").handler({ projectDir: dir, filePatterns: [p] })).isError, "pattern " + p + " must be rejected");
  // 2) without a local install the tools say so — they never download anything
  const lint = await tool("ui5_run_ui5_linter").handler({ projectDir: dir });
  assert.ok(lint.isError && /not installed/.test(lint.content[0].text), "ui5_run_ui5_linter must not download @ui5/linter");
  const model = await tool("cap_search_model").handler({ projectDir: dir, query: "*" });
  assert.ok(model.isError && /not installed/.test(model.content[0].text), "cap_search_model must not download cds");
  assert.ok(!(await fs.stat(marker).catch(() => null)), "injected command ran");
  await fs.rm(dir, { recursive: true, force: true });

  // 3) HTTP mode: foreign Host / Origin → 403, no CORS headers; a local client still initializes
  const { spawn } = await import("node:child_process");
  const http = await import("node:http");
  const port = 39000 + Math.floor(Math.random() * 500);
  const srv = spawn(process.execPath, ["index.js", "--http", "--port=" + port], { cwd: path.dirname(fileURLToPath(import.meta.url)), stdio: "ignore" });
  try {
    const req = (headers, method = "POST", body = null) => new Promise((resolve) => {
      const r = http.request({ host: "127.0.0.1", port, path: "/mcp", method, headers }, (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: d })); });
      r.on("error", () => resolve({ status: 0, headers: {} })); if (body) r.write(body); r.end();
    });
    const init = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smoke", version: "1" } } });
    const json = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    let ok;
    for (let i = 0; i < 120; i++) { ok = await req({ ...json, Host: "localhost:" + port }, "POST", init); if (ok.status) break; await new Promise((r) => setTimeout(r, 250)); }   // cold start can take >10 s
    assert.equal(ok.status, 200, "local initialize should succeed (got " + ok.status + " " + (ok.body || "") + ")");
    assert.equal((await req({ ...json, Host: "evil.example:" + port }, "POST", init)).status, 403, "rebinding Host must be rejected");
    assert.equal((await req({ ...json, Host: "localhost:" + port, Origin: "https://evil.example" }, "POST", init)).status, 403, "cross-site Origin must be rejected");
    const pre = await req({ Host: "localhost:" + port, Origin: "http://localhost:" + port, "Access-Control-Request-Method": "POST" }, "OPTIONS");
    assert.ok(!pre.headers["access-control-allow-origin"], "no CORS allow-origin header may be sent");
  } finally { srv.kill(); }
}

console.log("OK — " + allTools.length + " tools registered and exercised: " + names.join(", "));
