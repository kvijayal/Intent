# intent2code (v1.10) — CAP + UI

A Claude Code **plugin** that turns a one-line requirement or a Functional Design (FD) into a
runnable, code-verified SAP BTP app — via an interactive, question-driven architecture phase
(*ask, don't assume*) and specialist worker sub-agents. **This release covers CAP Node.js and UI
(Fiori Elements + Freestyle UI5).** MDK and Pro-Code are present as honest placeholders so the
structure is ready to grow.

## Flow

```text
/intent   → Requirement Register → Application Design Advisor: gates A–H (Clean Core, backend,
            floorplan, CAP scope, auth, data model) → Application-Architecture.md (Gate G,
            auto-opens in VS Code) → Technical Design Document
            → cap-code-builder + fiori-code-builder
            → coverage verification (Designed ≠ Built)
            → code-review-advisor → unit-test-case-generator
            → technical-documentation-generator
/review   → HARD STOP lock → recommendation → code-review-advisor → severity-ranked findings (no edits)
/modify   → release lock → apply ONLY approved findings via the right code builder
/test     → unit-test-case-generator → cds.test/Jest + QUnit/OPA5 → Test-Report.md
/document → technical-documentation-generator → Technical Design Document + Unit Testing Document
/deploy   → deployer → mta.yaml / xs-app.json / xs-security.json audit → severity-ranked findings
```

Each generated app lands under `<app-name>/` at the project root:

- `<app-name>/` — runnable code (`gen/`, `node_modules/` git-ignored)
- `<app-name>/deliverables/` — markdown deliverables (Requirement Register,
  Application-Architecture, Technical Design Document, Coverage Report, Test Report,
  Unit Testing Document)

## What's new in v1.05

| Area | Change |
|---|---|
| **CLAUDE.md** | New root engineering-standards file — stack defaults, 4 hard rules, 18-row skill map, 11 key prohibitions, CAP auth pattern, MTA deployment overview, launchpad tile note, scope boundary |
| **starters.js** | Critical bug fix — all 4 CAP Fiori starters (`cap-fe-lrop/alp/op/fpm`) now correctly map to `cap-fullstack-listreport`; added missing `cap-service` (→ `cap-service-only`) and `cap-freestyle` (→ `cap-fullstack-freestyle`) entries |
| **deployer agent** | Rewritten to html5-apps-repo pattern — no standalone approuter; audits `app/*/webapp/xs-app.json` (app-bundle), `destination-content` module, `HTML5Runtime_enabled`, `forwardAuthToken`, DS_XS1 destination/route name match |
| **mta-reviewer skill** | New comprehensive skill — 13 audit categories, 80+ graded rules (FAIL/WARN/INFO), new rules G1 (no `approuter.nodejs`), G2 (dangling requires), DC11 (`sap.cloud.service` match), DS_XS1 (destination Name ↔ xs-app.json), H1 (quoted schema-version) |
| **launchpad-workzone skill** | New skill — tile registration, `crossNavigation.inbounds`, `sap.cloud.service` wiring, Workzone steps, cross-app navigation, troubleshooting |
| **fpm-annotations.md** | New FPM reference — FilterBar, Table, Chart, custom section, side effects, required manifest flags |
| **fiori-elements/SKILL.md** | FPM keywords added; FPM section split to point at dedicated reference files |
| **deploy-approuter-mta.md** | Completely rewritten — html5-apps-repo pattern, `deploy_mode: html5-repo`, `before-all` hook, `forwardAuthToken` in both srv `provides` and destination `init_data`, `HTML5Runtime_enabled`, DS_XS1 cross-reference |
| **TDD template** | Replaced with 14-section enterprise format — header block, Change History, Reviewers, Sign Off tables; new §3 Solution Architecture, §5 Integration Design, §6 Error Handling, §14 Data Migration (Optional) |
| **deliverable-templates/SKILL.md** | Gate → TDD section mapping updated for 14-section format |
| **ui5-opa5.md** | Dead citation removed; now the complete standalone OPA5 + QUnit reference |
| **deployment-checklist/SKILL.md** | Added mta-reviewer and launchpad-workzone to reference table |
| **intent.md** | Application-Architecture.md auto-opens in VS Code after Gate G; stale Known-error comment removed |
| **fiori-code-builder agent** | FPM reference split (annotations/bootstrapping); launchpad-workzone skill added |
| **tools/index.js** | Fixed import path casing `CustomBTP-mcp` → `customBTP-mcp` (Linux/Docker CI fix) |
| **scaffold_app.js** | Description updated to list all 8 appTypes including `cap-service` and `cap-freestyle` |
| **cds-plugin-ui5** | Canonical version aligned to `^0.17.0` across CLAUDE.md, sap-conventions, fiori-bootstrap, reviewer |
| **Stale skill names** | Bulk-replaced old names (`cap-best-practices`, `fiori-app-bootstrapping`, `fiori-annotations`, `destinations-and-services`, `unit-testing`, `sap-architecture-decisions`) → current names across all reference files |

## Stack defaults

> Generated from **`stack.json`** by `stack.mjs sync-docs` — edit `stack.json`, never this table.
> Change the CAP stack with `cap.cdsMajor`, UI5 with `ui5.line`; existing apps: `stack.mjs apply <app>`.

| Layer | Technology | Version |
|---|---|---|
| CAP runtime | `@sap/cds` | `^9` (cdsMajor 9) |
| CAP build tool | `@sap/cds-dk` | `^9` (same major as runtime, local devDependency) |
| HANA driver (prod) | `@cap-js/hana` | `^2` |
| SQLite driver (dev) | `@cap-js/sqlite` | `^2` |
| Node.js (engines) | `node` | `>=20` |
| UI5 CLI | `@ui5/cli` | `^4.0.33` |
| UI5 linter | `@ui5/linter` | `^1.23.0` (devDependency of every UI module — run with `npm exec --no -- ui5lint`) |
| CAP ↔ UI5 bridge | `cds-plugin-ui5` | `^0.17.0` |
| Fiori tools | `@sap/ux-ui5-tooling` | `1` |
| Mock server | `@sap-ux/ui5-middleware-fe-mockserver` | `2` |
| TypeScript (freestyle only) | `typescript` · `ui5-tooling-transpile` · `@sapui5/types` | `^5.9.3` · `^3.10.0` · `~1.136.0` |
| Test runner | `jest` | `^29` |
| OData version | V4 | — |
| UI5 runtime | SAPUI5 line `1.136` | newest **verified** patch of the line, resolved at build time by `stack.mjs resolve` — never a guessed patch |
| UI5 theme | `sap_horizon` | — |
| ui5.yaml / MTA | `specVersion` · `_schema-version` | `4.0` · `"3.3"` |
| Fiori generator | `yo` · `@sap/generator-fiori` | `4` · `latest` (headless config `0.2`) |

## Structure

- `commands/` — `intent`, `review`, `modify`, `test`, `document`, `deploy`.
- `agents/` — `recommendation`, `cap-code-builder`, `fiori-code-builder`, `code-review-advisor`,
  `unit-test-case-generator`, `technical-documentation-generator`, `deployer` (working);
  `mdk-code-builder`, `procode-code-builder` (placeholders).
- `skills/` — 15 progressive-disclosure skills (SKILL.md + `references/`): `cap-skill`,
  `cap-integration`, `sap-architecture`, `sap-clean-core`, `sap-conventions`,
  `deliverable-templates`, `fiori-elements`, `fiori-freestyle`, `fiori-bootstrap`,
  `sap-unit-testing`, `application-sanity-check`, `deployment-checklist`, `mta-reviewer`,
  `launchpad-workzone`, `review-quality-checks`, and the `mdk-patterns` / `procode-extensibility`
  placeholders.
- `hooks/` — `review-guard.sh`, the optional review HARD STOP (opt-in, USER_GUIDE → Permissions; no hook is enabled by default).
- `.mcp.json` — registers the bundled `intent2code` MCP server (22 tools `mcp__intent2code__*`).
- `mcp-server/` — the bundled MCP server: 11 CAP/Fiori scaffolding tools + 6 UI5 tools + 2 CAP
  docs tools + 3 Fiori tools.
- `reference-apps/` — runnable starters `scaffold_app` copies and rewrites: `cap-service-only`,
  `cap-fullstack-listreport`, `cap-fullstack-freestyle`, `freestyle-ui5-ts`,
  `fiori-elements-external-service`.

## Setup & test

1. Open the folder in VS Code — the MCP server starts by itself: task **Intent2Code MCP server (HTTP :3999)**
   in `.vscode/tasks.json` runs `mcp-server/start-http.mjs`, which installs the server's dependencies on the
   first start (`npm ci --ignore-scripts` from the lockfile, about 30 s) and then serves
   `http://localhost:3999/mcp`. Trust the folder / allow automatic tasks once if VS Code asks. Outside VS Code
   run `npm run start-http` in `mcp-server`; `npm run smoke` there checks the 22 tools. Intent2Code connects
   over HTTP (`.mcp.json`) because organisation policies often block MCP servers that Claude Code starts itself
   (stdio). If a Claude Code conversation was already open before the server was up, type `/mcp reconnect all`.
2. Optional: enable the review HARD STOP hook (USER_GUIDE → Permissions) and choose *Accept edits* once.
3. Install the plugin (recommended): add this folder as a local marketplace, then
   `/plugin install intent2code`. Verify first with `claude plugin validate .`.
   *Quick alternative:* copy `commands/ agents/ skills/ hooks/` into a project `.claude/` and adjust
   `.mcp.json` paths — but plugin install keeps `${CLAUDE_PLUGIN_ROOT}` wiring intact.
4. Prereqs for real builds: Node 20+, `@sap/cds-dk ^9`, and (for freestyle) `@ui5/cli ^4.0.33`.

The MCP server is **optional**: if the server isn't running, every skill is the source of truth and
agents fall back to doing the same work by hand.

## Deployment pattern

```text
Browser → BTP HTML5 Application Runtime → Destination Service → CAP Node.js Service → HANA Cloud
```

No standalone approuter module. `xs-app.json` lives inside each app bundle (`app/<name>/webapp/`).
`forwardAuthToken: true` must appear in **both** the srv module `provides` block **and** the
destination `init_data` entry. See `mta-reviewer` skill for a full rule-by-rule audit checklist.

## Supported app types (`scaffold_app` / `/intent`)

| appType | Starter | Description |
|---|---|---|
| `cap-service` | `cap-service-only` | CAP backend only, no UI |
| `cap-fe-lrop` | `cap-fullstack-listreport` | CAP + Fiori Elements List Report + Object Page |
| `cap-fe-alp` | `cap-fullstack-listreport` | CAP + Fiori Elements Analytical List Page |
| `cap-fe-op` | `cap-fullstack-listreport` | CAP + Fiori Elements Object Page |
| `cap-fpm` | `cap-fullstack-listreport` | CAP + FPM custom page |
| `cap-freestyle` | `cap-fullstack-freestyle` | CAP + Freestyle UI5 (generator: TypeScript or JavaScript; fallback starter: TypeScript) |
| `freestyle-ui5` | `freestyle-ui5-ts` | Freestyle UI5 standalone (generator: TypeScript or JavaScript; fallback starter: TypeScript) |
| `external-fe` | `fiori-elements-external-service` | Fiori Elements bound to external/RAP OData |

## Scope

| | |
|---|---|
| ✅ CAP Node.js + Fiori Elements (LR+OP, ALP, OP, FPM) | ✅ Fiori Elements consuming external OData / RAP |
| ✅ CAP Node.js + Freestyle UI5 (TypeScript or JavaScript) | ✅ SAP BPA workflow Start UI + Task UI |
| 🚫 MDK (planned) | 🚫 RAP/ABAP Cloud development (consumption only) |
| 🚫 Pro-code side-by-side extensibility (planned) | 🚫 Event-driven / SAP Event Mesh (planned) |
