// Tool registry — imported by index.js (live server) and smoke-test.js (no SDK needed).

// ── Custom-BTP scaffolding tools (our own) ───────────────────────────────────
import scaffold_app from "./customBTP-mcp/scaffold_app.js";
import validate_namespace from "./customBTP-mcp/validate_namespace.js";
import add_cds_entity from "./customBTP-mcp/add_cds_entity.js";
import generate_annotations from "./customBTP-mcp/generate_annotations.js";
import gen_mock_from_edmx from "./customBTP-mcp/gen_mock_from_edmx.js";
import configure_service from "./customBTP-mcp/configure_service.js";
import patch_manifest from "./customBTP-mcp/patch_manifest.js";
import run_checks from "./customBTP-mcp/run_checks.js";
import clean_core_check from "./customBTP-mcp/clean_core_check.js";
import create_start_ui from "./customBTP-mcp/create_start_ui.js";
import create_task_ui from "./customBTP-mcp/create_task_ui.js";

// ── UI5 tools (replicated from github.com/UI5/mcp-server, Apache-2.0) ────────
import ui5_get_guidelines from "./ui5-mcp/ui5_get_guidelines.js";
import ui5_get_version_info from "./ui5-mcp/ui5_get_version_info.js";
import ui5_get_api_reference from "./ui5-mcp/ui5_get_api_reference.js";
import ui5_get_project_info from "./ui5-mcp/ui5_get_project_info.js";
import ui5_run_manifest_validation from "./ui5-mcp/ui5_run_manifest_validation.js";
import ui5_run_ui5_linter from "./ui5-mcp/ui5_run_ui5_linter.js";

// ── CAP tools (replicated from github.com/cap-js/mcp-server, Apache-2.0) ─────
import cap_search_model from "./cap-mcp/cap_search_model.js";
import cap_search_docs from "./cap-mcp/cap_search_docs.js";

// ── Fiori tools (replicated from SAP/open-ux-tools fiori-mcp-server, Apache-2.0)
import fiori_search_docs from "./fiori-mcp/fiori_search_docs.js";
import fiori_list_apps from "./fiori-mcp/fiori_list_apps.js";
import fiori_download_odata_metadata from "./fiori-mcp/fiori_download_odata_metadata.js";

export const allTools = [
  // CAP / Fiori scaffolding
  scaffold_app,
  validate_namespace,
  add_cds_entity,
  generate_annotations,
  gen_mock_from_edmx,
  configure_service,
  patch_manifest,
  run_checks,
  clean_core_check,
  // Workflow UI (SAP Build Process Automation Start UI / Task UI)
  create_start_ui,
  create_task_ui,
  // UI5
  ui5_get_guidelines,
  ui5_get_version_info,
  ui5_get_api_reference,
  ui5_get_project_info,
  ui5_run_manifest_validation,
  ui5_run_ui5_linter,
  // CAP
  cap_search_model,
  cap_search_docs,
  // Fiori
  fiori_search_docs,
  fiori_list_apps,
  fiori_download_odata_metadata
];
