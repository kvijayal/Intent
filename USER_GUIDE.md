# Intent2Code User Guide

Complete reference for skills, commands, agents, and MCP servers in the Intent2Code workflow.

---

## Getting started (1.10)

### Prerequisites

| Needed for | Tool | Check / install |
|---|---|---|
| Everything | Node.js 20 or newer | `node --version` |
| Everything | Claude Code (VS Code extension or CLI) | — |
| Scaffolding a CAP project (`cds init`, `cds add`) | `@sap/cds-dk`, installed globally, same major as `stack.json` (`cap.cdsMajor`, 9 by default) | `npm install -g @sap/cds-dk@9` |
| Generating a UI | Yeoman 4 + SAP Fiori generator | `npm install -g yo@4 @sap/generator-fiori` (the `/intent` pre-flight offers to install them — the global install asks for your approval) |
| The browser check of every build | Google Chrome or Microsoft Edge | set `CHROME_PATH` if it is installed in a non-standard folder |
| Building the deployment archive (optional) | MBT | `npm install -g mbt` |
| Deploying (optional, you run it) | Cloud Foundry CLI with the MultiApps plugin | `cf install-plugin multiapps` |

Each generated app gets its own local `@sap/cds`, `@sap/cds-dk` and UI tooling through its
`package.json` — the global `@sap/cds-dk` is only used to create the project.

### First run

1. **Unzip** `intent2code_V1.10.zip` and open the folder `intent2code_V1.10` in VS Code (File → Open Folder).
   Claude Code must start in this folder: the pre-approved commands use paths relative to it, and
   every app you build is created inside it.
2. **Choose *Accept edits* once** (see [Permissions](#permissions--fast-without-blanket-access)). A build
   writes many files; in the default mode every write asks.
3. **MCP server — starts by itself.** Opening the folder in VS Code runs the task *Intent2Code MCP server
   (HTTP :3999)*. The first time, it installs the server's dependencies from `mcp-server/package-lock.json`
   (`npm ci --ignore-scripts`, about 30 seconds), then starts the server; later starts take a few seconds.
   If VS Code asks whether to trust the folder or to allow its automatic tasks, answer **Trust** / **Allow**.
   Claude Code connects when a conversation starts — if one was already open (for example during the first
   install), type `/mcp reconnect all`. Outside VS Code: `npm run start-http` in `mcp-server`. Without the
   server every MCP step uses its scripted fallback — builds work the same way.
4. **Build:** `/intent <your requirement or Functional Design>`. Answer the gate questions and sign
   off the architecture. If your organisation makes `npm install` ask, approve it when the build
   reaches it (typically 2–3 times per app, always inside the app folder).
5. **Run the app** with the command printed in the `/intent` summary (see
   [Run and check a generated app](#run-and-check-a-generated-app)).
6. **Next steps:** `/review` → `/modify` → `/test` → `/document` → `/deploy`.

### Upgrading from 1.08 / 1.09

| What changed in 1.10 | What you do |
|---|---|
| The package no longer sets the permission mode | Choose *Accept edits* once (VS Code mode selector, `Shift+Tab` in the CLI, or your user settings) |
| The MCP server is no longer started by a Claude Code hook on every prompt | Nothing — VS Code installs it on the first start (from the lockfile) and starts it whenever you open the folder; trust the folder / allow automatic tasks once |
| The `/review` HARD STOP hook is an opt-in | Add the snippet from [Permissions](#permissions--fast-without-blanket-access) to your `.claude/settings.local.json` if you want it |
| Personal `.claude/settings.local.json` files are never shipped | Review an old copy carried over from an earlier version or another machine: delete grants you do not need (security scanners also read this file) |
| `cds` and the UI tools run from each project (`npm exec --no -- <tool>`, npm scripts); nothing is downloaded at run time | Nothing — existing apps: run `node .claude/skills/sap-conventions/scripts/stack.mjs apply <app>` once, then `npm install` in the app |
| Release scripts, the package scanner and the unit tests moved to a separate maintainer kit | Nothing for users |
| The sanity checks have two numbered lists: static checks 1–35 and runtime checks 1–10 (they replace check 0–21, UI-n, S-n and R-n; "Gate 1/2" are now "static/runtime checks"; coverage verification is STEP 8.2) | Nothing — to read an older report, use the table at the end of `application-sanity-check/SKILL.md` |
| New static checks 20–22: the production build contains the UI annotations | Existing apps with a custom `cds.build.tasks`: run `ui-health-checks.mjs <app>` once and fix what it reports before the next deployment |

---

## Quick Start Decision Tree

**I have a new requirement or Functional Design:**
→ Use `/intent` command (end-to-end build)

**I have generated code and want to check for issues:**
→ Use `/review` command (read-only audit)

**I want to fix review findings:**
→ Use `/modify` command (apply fixes)

**I have an mta.yaml and want to audit it:**
→ Use the `mta-reviewer` skill or `/deploy` command

**I want to test the application:**
→ Use `/test` command

**I want to generate documentation:**
→ Use `/document` command

---

## Stack versions — one file: `stack.json`

All CAP, UI5 and tooling versions live in **`<plugin-root>/stack.json`** — nowhere else. Builds,
checks and the docs read it; `stack.mjs` (in this skill's `scripts/`) applies it.

| You want to… | Edit in `stack.json` | Then run |
|---|---|---|
| Move the CAP stack (e.g. CDS 9 → 10) | `cap.cdsMajor` (drivers + Node come from `cap.compat`) | `stack.mjs apply <app>` → delete `node_modules/` + `gen/` → `npm install` |
| Change the UI5 release line (e.g. 1.136 → 1.148 LTS) | `ui5.line` (newest verified patch is resolved automatically) | `stack.mjs apply <app>` |
| Pin an exact UI5 patch | `ui5.pin` (verified on the CDN; a non-existent patch is rejected) | `stack.mjs apply <app>` |
| Change a tooling range (`@ui5/cli`, `typescript`, …) | `packages.app` / `packages.root` | `stack.mjs apply <app>` → `npm install` |
| Bump the plugin version | `plugin.version` | the release script of the maintainer kit (not part of the plugin) |

```bash
node .claude/skills/sap-conventions/scripts/stack.mjs resolve            # what the next build will use (UI5 patch resolved + verified)
node .claude/skills/sap-conventions/scripts/stack.mjs check <app>        # drift report (also static check 6); exit 1 on FAIL
node .claude/skills/sap-conventions/scripts/stack.mjs apply <app>        # re-pin an existing app (value edits only; review.lock respected)
node .claude/skills/sap-conventions/scripts/stack.mjs sync-docs          # maintainer: regenerate version tables/snippets in the docs
node .claude/skills/sap-conventions/scripts/stack.mjs lint               # maintainer: fail on stray version literals
```

A new CDS major needs a `cap.compat["<major>"]` entry first (check with
`npm view @cap-js/sqlite@<n> peerDependencies`). Offline, UI5 resolves from the cache or
`stack.lock.json`; it is never guessed.

## Permissions — fast without blanket access

Intent2Code ships a **scoped** `.claude/settings.json`: instead of allowing every shell command, it
pre-approves the exact commands the pipeline runs, so a normal `/intent` run does not stop for
approvals while destructive or downloading commands stay blocked. The package does not change your
permission mode and ships no hooks.

| Pre-approved | Asks first | Blocked |
|---|---|---|
| Read-only commands (`ls`, `cat`, `grep`, `git status / diff / log / ls-files`), `npm install / ci / run / test / pkg / ls / view` (an organisation policy may still ask for `npm install`), `npm exec --no -- cds / ui5lint / tsc / eslint / fiori / ui5`, `cds init`, `yo @sap/fiori:headless`, `mbt build`, the plugin scripts (`stack.mjs`, `ui-health-checks.mjs`, `smoke-check.mjs`, `ui-render-check.mjs`, `free-port.mjs`), the intent2code MCP tools, SAP / npm documentation sites | file edits (until you choose *Accept edits*, below), `cf …` (you deploy), `npm install -g …`, anything not on the list | recursive deletes (the agents use `stack.mjs clean`), one-off package downloads, `git push`, `git reset`, `git clean`, `cf undeploy` / `cf delete*`, reading `.env` / `default-env.json` / SSH / AWS keys |

**One-time choice — accept file edits.** A build writes many files; in the default mode each write asks.
Choose *Accept edits* once and builds run through:

- VS Code: select **Edit automatically** in the mode selector of the Claude Code panel.
- CLI: press `Shift+Tab` until "accept edits" is shown, or start with `claude --permission-mode acceptEdits`.
- For every session on your machine: set `"defaultMode": "acceptEdits"` under `"permissions"` in your
  Claude Code **user** settings (Claude Code documentation → Settings → user scope).

The pre-approved and blocked lists apply in every mode.

**Open the plugin folder itself.** The pre-approved list lives in `.claude/settings.json` and applies only when
VS Code (or `claude`) is opened on the folder that contains `.claude/`. Opened on a parent folder, the list is not
loaded and every command — including `cd <app>` — asks.

**Organisation policies win.** If your company manages Claude Code centrally, its rules come first and no project
setting can switch them off — not even your approval of the architecture at Gate G. A common example: `npm install`
and `curl` always ask. Intent2Code keeps that to the minimum and never uses `curl` (HTTP checks run inside
`smoke-check.mjs`). One root `npm install` covers the CAP project and every UI app (npm workspaces), so a build asks:

| Build | `npm install` prompts |
|---|---|
| CAP + UI (Fiori Elements or freestyle) | 2 — after the CAP model; after the UI scaffold + deployment configuration |
| CAP service only | 1 (a second only if the deployment step changed a `package.json`) |
| Standalone UI app | 1 — after the scaffold |

On a machine without such a policy (for example SAP Business Application Studio) the pre-approved list covers these installs.

**MCP server.** No Claude Code hook starts it. VS Code starts it when you open the folder: the task
*Intent2Code MCP server (HTTP :3999)* in `.vscode/tasks.json` runs `mcp-server/start-http.mjs`, which
installs the server's dependencies the first time — `npm ci --ignore-scripts`: the exact versions in
`package-lock.json`, no package install scripts, and only when they are missing or the lockfile changed —
and then starts the server on 127.0.0.1. Tasks run only in a trusted folder with automatic tasks allowed;
errors appear in the Problems panel. Intent2Code connects over HTTP (`.mcp.json` → `http://localhost:3999/mcp`) because
organisation policies often block MCP servers that Claude Code starts itself (stdio). Without the server
every MCP step has a scripted fallback (`/intent` → COMMAND CONVENTIONS).

**Optional — review HARD STOP hook.** `/review` is read-only by design: its agents have no write
tools and `stack.mjs` refuses to change an app while `.intent2code/review.lock` exists. To also make
the main session unable to write while the lock exists, add this to your personal
`.claude/settings.local.json` (never shipped; organisation policies may disable non-managed hooks):

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Write|Edit|MultiEdit|NotebookEdit",
        "hooks": [{ "type": "command", "command": "bash ./hooks/review-guard.sh" }] }
    ]
  }
}
```

The settings also set `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR=1`: every shell command starts in the plugin
folder. Without it, once an agent has run `cd <app>`, Claude Code refuses to `cd` back up (even with an allow
rule), and the plugin's scripts would ask for approval.

**Want fewer prompts on your own machine?** Add rules to `.claude/settings.local.json` (personal,
never shipped in the release zip). The shared `deny` list still applies there.

**Scanning the package.** Scan the extracted release zip, or a copy of the folder without
`mcp-server/node_modules` and without your personal `.claude/settings.local.json`: the MCP server
dependencies are third-party code (scanners report every executable file in them) and the personal
settings file is not part of the package. NVIDIA Skillspector, static mode:

```text
skillspector scan <folder> --no-llm --format markdown --output report.md                 # whole package
skillspector scan <folder>/.claude/skills --no-llm --format markdown --output skills.md  # skills only
```

Expected for 1.10: 0 findings for `.claude/skills`; for the whole package at most one LOW note (SC4) when
the scanner cannot finish its OSV dependency lookup in time. The recommendation reads CAUTION rather than
SAFE because a few long documents and two regex-heavy scripts are only partially parsed by its static
layer — they are reported as coverage limits, not as findings.

## Run and check a generated app

The `/intent` summary prints the exact run command and URL of your app. Typical commands:

| App type | Start it | Open |
|---|---|---|
| CAP + UI (Fiori Elements, FPM, freestyle UI5 inside the CAP project) | in the app folder: `npm run watch` | `http://localhost:4004/<namespace>.<module>/index.html` (the `watch-<module>` script opens it) |
| CAP service only | in the app folder: `npm run watch` | `http://localhost:4004/odata/v4/<service>/` |
| Standalone UI on an existing OData service | in the app folder: the mock start script from the summary (offline) or `npm start` (real backend through the BTP destination) | `http://localhost:8080/index.html` |

Always start a CAP app with `npm run watch` from its own folder — never with a globally installed
`cds watch` (see CLAUDE.md, hard rule 5).

Check an app at any time (from the plugin folder; each command stops its own server again):

```text
node .claude/skills/application-sanity-check/scripts/ui-health-checks.mjs <app>        # static checks 1–22 (no server)
node .claude/skills/application-sanity-check/scripts/smoke-check.mjs <app> --render     # runtime checks 1–10: starts the app, probes OData, opens it in headless Chrome
node .claude/skills/sap-conventions/scripts/stack.mjs check <app>                       # versions against stack.json
```

Each script prints one table, numbered from 1. Every row reads PASS, WARN, FAIL or SKIP; any FAIL
names the file and the fix. There are two lists — **static checks** (1–22 scripted, 23–35 done by the
agent) and **runtime checks** (1–10) — so a report always says which one: "static check 12",
"runtime check 6". Runtime checks 5–10 run in a real browser and prove what a user sees: UI5 loads,
a page renders, no fatal errors, no failed requests, the first row opens its detail page and a
partial save is accepted.

## Commands

Commands are the entry points to major workflows. They coordinate agents, skills, and specialized MCP servers.

### `/intent` — End-to-End Build from Requirements

**When to use:**
- Starting a brand new SAP BTP application from a Functional Design Document (FDD)
- You have requirements but no code yet
- You want an interactive, gated build with design decisions at each step

**What it does:**

1. Reads your FDD/requirements
2. Runs pre-flight checks (MCP server, Yeoman + SAP Fiori generator, CDS CLI, stack versions); missing global tools are installed after your approval
3. Extracts a complete Requirement Register from the FD
4. Runs Clean Core compliance check (Gate A)
5. Interactive gate decisions — you approve each: backend type, floorplan (freestyle: TypeScript or JavaScript), CAP scope, auth, data model
6. Writes `Application-Architecture.md` and asks for your sign-off before any code is written
7. Spawns CAP agent to build the backend (schema, services, handlers)
8. Spawns Fiori agent to build the frontend (manifest, views, controllers, annotations)
9. Generates the deployment configuration with `deploy-config.mjs` (SAP `cds add mta,workzone-standard`: `mta.yaml`, one html5 module per UI app, `xs-app.json`, launchpad inbound — plus the plugin additions) and `CHANGELOG.md`
10. Runs the static checks (1–35) and the runtime checks (1–10, including a real browser) on the generated app
11. Verifies every requirement is delivered (Coverage Report)
12. Spawns code-review-advisor for a final code quality pass

**Does NOT generate:**

- Technical Design Document (TDD) — use `/document TDD` after `/intent`
- Unit Testing Document (UTD) — use `/document UTD` after `/intent`
- Test files — use `/test` after `/intent`

**Outputs:**
- `deliverables/Requirement-Register.md` — every requirement extracted from the FD, with disposition
- `deliverables/Application-Architecture.md` — gate decisions, data model, auth matrix, build plan
- `deliverables/Coverage-Report.md` — requirement-to-code traceability (Built / Gap)
- Full working CAP + Fiori app under `<app-name>/`
- Deployment configuration ready for `mbt build`: `mta.yaml` (CAP service, HANA deployer, every UI app, HTML5 repository, destinations, XSUAA), `xs-app.json` per UI app, `xs-security.json`

**Example:**
```
/intent Build a Leave Request approval workflow app
```

---

### `/review` — Read-Only Code Audit

**When to use:**
- Code is generated and you want to verify it against best practices
- You want a severity-ranked list of issues before fixing anything
- You want to check for security vulnerabilities, performance risks, deprecated APIs

**What it does:**
1. Creates a `.intent2code/review.lock` file — while it exists the review is read-only: the review agents have no write tools, `stack.mjs` refuses to change the app, and the optional HARD STOP hook (see Permissions) blocks every `Write`/`Edit`
2. Detects project topology (CAP present? UI present? Tests present?)
3. Runs architecture scan (maps stack, auth model, UI floorplan)
4. Spawns code-review-advisor agent to audit against 11 categories:
   - CDS/CAP correctness
   - Authorization completeness
   - Fiori compliance
   - Deprecated APIs
   - OData performance
   - Security (hardcoded secrets, injection, SSRF)
   - Namespace + Clean Core
   - Requirement traceability
   - Deployment readiness
   - Test coverage
   - Code quality
5. Returns findings ranked CRITICAL → WARNING → INFO

**Outputs:**
- Severity-ranked findings table with exact fix snippets
- Category status showing which checks passed/failed/N/A
- Deployment readiness checklist

**Important:** Review is READ-ONLY. Use `/modify` to apply fixes.

**Example:**
```
/review tasktracker
```

---

### `/modify` — Apply Review Findings

**When to use:**
- You have a `/review` findings report and want to fix the issues
- You want to apply recommended fixes automatically
- You want to see before/after diffs of each change

**What it does:**
1. Reads the findings from the previous review
2. Removes the `.intent2code/review.lock` file (allows edits)
3. Applies each fix in sequence, showing before/after for each change
4. Offers to re-run `/review` or `/test` to confirm all fixes landed

**Outputs:**
- Fixed code with exact changes applied
- Summary of changes made per finding
- Option to re-run `/review` to verify no regressions

**Example:**
```
/modify
```

---

### `/deploy` — Deployment Readiness Audit

**When to use:**
- You have an `mta.yaml` and want to validate it before running `mbt build`
- You want to catch deployment errors before they happen
- You want to check xs-app.json routing, xs-security.json, manifest consistency

**What it does:**
1. Detects project topology
2. Spawns deployer sub-agent to:
   - Detect the deployment pattern (html5-apps-repo, standalone approuter, consume-only, etc.)
   - Audit all MTA modules and resources
   - Audit xs-app.json CORS and routing
   - Audit xs-security.json xsappname and scopes
   - Run comprehensive cross-file consistency checks
3. Returns findings with exact fix snippets

**Outputs:**
- Severity-ranked audit findings
- Deployment checklist (mta.yaml bindings, npm audit, health-check, etc.)
- Exact `mbt build` and `cf deploy` commands to run

**Example:**
```
/deploy
```

---

### `/test` — Test Generation and Execution

**When to use:**
- You want to create test files (CAP Jest, UI QUnit/OPA5)
- You want to run the test suite and see results
- You want to measure test coverage

**What it does:**
1. Spawns unit-test-case-generator agent to:
   - Generate Jest test file for CAP service (if CAP present)
   - Generate QUnit tests for Freestyle UI5 formatters/controllers (if UI present)
   - Generate OPA5 journey tests for List Report → Object Page navigation
2. Runs `npm test` and reports:
   - Pass/fail count
   - Coverage metrics
   - Failing test names (if any)

**Outputs:**
- `test/*.test.js` — CAP integration tests
- `app/*/webapp/test/unit/*.test.ts` — UI unit tests
- `app/*/webapp/test/integration/opaTests.qunit.html` — OPA5 journeys
- Coverage report

**Example:**
```
/test
```

---

### `/document` — Generate Deliverables

**When to use:**
- You want to create Technical Design Document (TDD) for an existing project
- You want to create Unit Testing Document (UTD)
- You want to formalize the deliverables

**What it does:**
1. Spawns technical-documentation-generator agent to read the project state
2. Generates either TDD, UTD, or both:
   - **TDD** — entity model, service definitions, role matrix, API endpoints, wireframes, a detailed architecture diagram (§3.4) and the main-flow sequence (§13.4) as Mermaid — generated from the project; view them on GitHub / Azure DevOps / Confluence or in VS Code / BAS with a Mermaid preview extension
   - **UTD** — test scenarios, coverage targets, CAP boundaries, UI journeys

**Outputs:**
- `deliverables/Technical-Design-Document.md`
- `deliverables/Unit-Testing-Document.md`
- Revision history table with version/date/author/change

**Example:**
```
/document TDD
```

---

## Skills

Skills are specialized knowledge packages that agents use. You can invoke them directly via the Skill tool, but usually they're loaded automatically by agents.

| Skill | Category | When to load | Purpose |
|-------|----------|--------------|---------|
| **cap-skill** | Backend | CAP project audit/generation | CDS schema, service definitions, handlers, security, async/await correctness |
| **fiori-bootstrap** | Frontend | Fiori app generation | Manifest routing, Component setup, ui5.yaml bootstrap, local proxy config |
| **fiori-elements** | Frontend | FE app design review | Annotations correctness (CDS and XML), value helps, side effects, criticality |
| **fiori-freestyle** | Frontend | Freestyle UI5 (TypeScript or JavaScript — chosen at Gate C) | Component.ts or Component.js, routing, typed events + `tsc` (TypeScript), sap.ui.define modules (JavaScript), async patterns, controllers |
| **mta-reviewer** | Deployment | MTA validation | 80+ rules for mta.yaml: modules, resources, build commands, destination wiring, JWT propagation |
| **deployment-validation** | Deployment | Pre-flight checks | Templates + validation for mta.yaml, xs-app.json, xs-security.json, manifest.json, package.json |
| **deployment-checklist** | Deployment | Pre-deploy audit | XSUAA bindings, destination service config, npm audit, CORS policy, health-check endpoint |
| **sap-conventions** | Code quality | CAP project audit | Namespace consistency, folder layout, naming conventions, file headers, JSDoc |
| **review-quality-checks** | Code quality | Any code review | Hardcoded secrets, OData injection, SSRF, commented code, TODO/FIXME, CHANGELOG |
| **sap-unit-testing** | Testing | Test design/audit | Jest scenarios (CAP), QUnit/OPA5 (UI), coverage targets, test file structure |
| **sap-architecture** | Design | Architecture gates | Clean Core compliance, released APIs, on-stack modification detection |
| **sap-clean-core** | Design | Clean Core checks | Detailed released-API list, modification class detection, remediation patterns |
| **application-sanity-check** | Quality | Post-build sanity | Static checks 1–35 (1–22 scripted: `ui-health-checks.mjs`) and runtime checks 1–10 (`smoke-check.mjs --render`: server, OData and a real browser) |
| **i18n-completeness** | Localization | i18n audit | Locale config, missing/dead keys, supportedLocales, fallbackLocale |
| **launchpad-workzone** | Integration | Tile registration | Semantic objects, inbound targets, crossNavigation config, Workzone content manager |
| **cap-integration** | Integration | CAP-UI wiring | Mock server, proxy config, OData metadata wiring, approuter xs-app.json patterns |
| **rap-integration** | Integration | External OData | Consuming RAP/external OData, EDMX stubs, mock data, proxy routing |
| **deliverable-templates** | Documentation | Deliverable generation | TDD, UTD, Application Architecture templates with pre-filled examples |

---

## Agents

Agents are specialized AI workers that perform multi-step tasks autonomously. Each agent type has its own capabilities and tools.

### Built-in Agent Types

| Agent | Spawned by | Purpose | Tools available |
|-------|-----------|---------|------------------|
| **cap-code-builder** | `/intent` or `/modify` | Builds CAP backend | Read, Write, Edit, Bash, Skill, CDS/schema tools, handler tools, security tools |
| **fiori-code-builder** | `/intent` or `/modify` | Builds Fiori UI (Elements + Freestyle) | Read, Write, Edit, Bash, Skill, annotation tools, UI5 lint, manifest validation |
| **deployer** | `/deploy` | Audits MTA, xs-app.json, xs-security | Read, Bash, Skill (mta-reviewer, deployment-validation, deployment-checklist) |
| **code-review-advisor** | `/review` | Audits code quality, security, best practices | Read, Grep, Bash, Skill (review-quality-checks, sap-unit-testing, sap-architecture, sap-clean-core, cap-skill, fiori-elements, fiori-bootstrap, fiori-freestyle, i18n-completeness, deployment-checklist, deployment-validation), MCP audit tools |
| **unit-test-case-generator** | `/test` | Generates and runs tests | Read, Write, Edit, Bash, Skill (sap-unit-testing) |
| **technical-documentation-generator** | `/document` | Generates TDD, UTD | Read, Write, Edit, Glob, Grep, Bash, Skill (deliverable-templates), MCP (run_checks, cap_search_model, ui5_get_project_info, fiori_list_apps) |
| **recommendation** | `/review` | Maps stack and architecture ahead of the review | Read, Grep, Bash, Skill (architecture tools) |

### Sub-Agents (spawned by agents, not directly by you)

Sub-agents are spawned automatically by other agents to parallelize work:

| Sub-agent | Spawned by | Purpose |
|-----------|-----------|---------|
| **recommendation** | `/review` command | Detects topology, stack, auth model, floorplan before review begins |
| **cap-code-builder** | `/intent` flow | Generates schema, services, handlers |
| **fiori-code-builder** | `/intent` flow | Generates UI (manifest, views, controllers, annotations) |
| **deployer** | `/deploy` command | Runs mta-reviewer + deployment-validation + deployment-checklist |

---

## MCP Servers

MCP servers are external tools integrated via Claude's MCP protocol. They provide specialized capabilities not built into Claude itself.

### Intent2Code MCP Server

**Tools available:**
- `mcp__intent2code__scaffold_app` — Create a new CAP or UI5 project structure
- `mcp__intent2code__add_cds_entity` — Add an entity to schema.cds with associations
- `mcp__intent2code__configure_service` — Create a CAP service definition with CRUD handlers
- `mcp__intent2code__generate_annotations` — Create Fiori Elements annotations (CDS)
- `mcp__intent2code__patch_manifest` — Snapshot the generator manifest and apply guarded manifest edits
- `mcp__intent2code__gen_mock_from_edmx` — Generate mock data from EDMX/OData metadata
- `mcp__intent2code__create_start_ui` — Scaffold the BPA workflow Start UI app
- `mcp__intent2code__create_task_ui` — Scaffold the BPA workflow Task UI app
- `mcp__intent2code__ui5_get_api_reference` — Look up UI5 control API and properties
- `mcp__intent2code__ui5_get_guidelines` — Get Fiori Design Guideline rules
- `mcp__intent2code__ui5_get_version_info` — Check UI5 version info and library availability
- `mcp__intent2code__ui5_get_project_info` — Read the UI5 project structure and manifest info
- `mcp__intent2code__ui5_run_manifest_validation` — Validate manifest.json syntax
- `mcp__intent2code__ui5_run_ui5_linter` — Run UI5 linter on the app
- `mcp__intent2code__validate_namespace` — Check namespace consistency across 4 files
- `mcp__intent2code__run_checks` — Compile CDS and run validation (`cds build --production`)
- `mcp__intent2code__clean_core_check` — Detect on-stack modifications and released-API violations
- `mcp__intent2code__cap_search_model` — Search CAP documentation for schema/service patterns
- `mcp__intent2code__cap_search_docs` — Search CAP docs for a topic
- `mcp__intent2code__fiori_search_docs` — Search Fiori Elements / Fiori Design docs
- `mcp__intent2code__fiori_list_apps` — List all Fiori apps in the project
- `mcp__intent2code__fiori_download_odata_metadata` — Download EDMX from a URL

22 tools. The server is optional: when it is not running, every step uses its scripted fallback.

**When to use:**
- Agents use these automatically during `/intent`, `/review`, `/modify`, `/deploy`, `/test`
- You can call them directly if you need a quick lookup (e.g., "check if sap.m.Button has a `pressed` event")

---

## Complete Workflow Example

### Scenario: Build a Purchase Order Approval App

**Step 1: Design Phase**
```
/intent Build a Purchase Order management and approval app
        with multi-level approvers, budget tracking, and audit logs.
```
Output: Requirement Register, Application Architecture, Coverage Report, working CAP + Fiori code, mta.yaml.

**Step 2: Review the Generated Code**
```
/review
```
Output: Findings table (CRITICAL, WARNING, INFO).

**Step 3: Fix Issues**
```
/modify
```
Output: Fixed code, change summary, offer to re-run `/review`.

**Step 4: Enhance Tests** (if coverage is incomplete)
```
/test
```
Output: Updated test files, coverage report.

**Step 5: Generate Final Documentation**
```
/document both
```
Output: Final TDD and UTD in `deliverables/`.

**Step 6: Pre-Deployment Audit**
```
/deploy
```
Output: MTA audit findings, deployment checklist.

**Step 7: Resolve Any Deploy Findings**
- Missing or incomplete `mta.yaml` / `xs-app.json` / UI build: regenerate, never edit by hand —
  `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`, then `cd <app> && npm install`
- `xs-security.json` (roles, scopes): edit it, then re-run `/deploy`
- Re-run `/deploy` until all CRITICALs are resolved

**Step 8: Build and Deploy** (you run these — Intent2Code never deploys)
```bash
cd <app>
mbt build                                       # creates mta_archives/<app>_<version>.mtar
cf login -a <your Cloud Foundry API endpoint>
cf deploy mta_archives/<app>_<version>.mtar     # review the deploy summary when cf asks
```

---

## Decision Matrix: Which Command/Skill to Use

| Need | Use command | Or use skill | Why |
|------|----------|-----------|-----|
| Start from requirements | `/intent` | — | End-to-end orchestration |
| Check existing code for issues | `/review` | — | Coordinated multi-layer audit |
| Apply review fixes | `/modify` | — | Safe edits with regression check |
| Validate mta.yaml | `/deploy` or manual | `mta-reviewer` | Same checks, mta-reviewer is re-usable |
| Check CDS model | `/review` or use skill | `cap-skill` → `cap-review-checks.md` | Fast targeted lookup |
| Check Fiori manifest | `/review` or use skill | `fiori-bootstrap` → `list-report-op.md` | Reference pattern verification |
| Audit secrets / hardcoded URLs | `/review` or use skill | `review-quality-checks` → `security-checks.md` | Grep-based scan |
| Check namespace consistency | `/review` or use skill | `sap-conventions` or MCP `validate_namespace` | Single-purpose check |
| Run tests | `/test` | — | Full test generation + execution |
| Generate docs | `/document` | — | Structured deliverables with revision history |
| Look up UI5 API | — | MCP `ui5_get_api_reference` | Single API lookup |
| Look up Fiori guideline | — | MCP `ui5_get_guidelines` | Guideline reference |

---

## Error Recovery

### My review has findings I don't agree with

1. Read the finding explanation and the fix snippet
2. If it's truly a false positive, use `/modify` and manually edit the fix
3. Or note it in a code comment and re-run `/review` to confirm it's still flagged (helps track accepted exceptions)

### My deployment audit failed but I don't understand the error

1. Find the CRITICAL finding in the audit report
2. Read the "Real-World Impact" column to understand why it matters
3. The "Fix" column has the exact code change needed
4. Apply it and re-run `/deploy`

### I generated code but it doesn't compile

1. Run `npm run build` to see the exact error
2. Read the error carefully (usually points to a specific file/line)
3. Run `/review` to audit the code (might catch the issue)
4. Or use MCP `run_checks` for a quick CDS compilation check

### Claude Code asks before `npm install`

Your organisation policy requires it; the package itself pre-approves `npm install`. Approve it — the build runs it
only inside the app folder it names, at most twice per build (see Permissions). A headless run stops at that
point and asks you to run the install. If other commands ask as well (for example `cd <app>`), check that the
workspace is the plugin folder itself (the folder that contains `.claude/`).

### A command asks for approval although it is listed as pre-approved

It was written in a different form: an absolute path to a plugin script, a Git-Bash `/c/…` path, or
several commands chained with `&&` / `|`. Deny it — the agent switches to the pre-approved form
(workspace-relative path, one command per call) — or approve it once.

### MCP tools are not available

Look in the terminal panel for the task *Intent2Code MCP server (HTTP :3999)*: it prints
`HTTP MCP server ready … 22 tools`. An error there or in the Problems panel names the cause (for example no
network access for the first install). If the task did not run at all, the folder is not trusted or
automatic tasks are off: run **Terminal → Run Task → Intent2Code MCP server (HTTP :3999)**. Then type
`/mcp reconnect all` in Claude Code — a conversation connects only when it starts. A message
"blocked by enterprise policy" refers to MCP servers that Claude Code starts itself (stdio); this HTTP setup
is not affected. If MCP is blocked completely, the agents use the scripted fallbacks and the build result is
the same.

### The app shows a blank page

Run `node .claude/skills/application-sanity-check/scripts/smoke-check.mjs <app> --render` and read
runtime checks 5–10: 5 FAIL = UI5 did not load (bootstrap URL or version), 8 FAIL = a request failed
(401 → dev auth, 404 → service path in the manifest). `ui-health-checks.mjs` names the file to fix.

A 404 on `/<app>/odata/v4/<service>/$metadata` (the app name in front of `/odata`) means the manifest
URI lost its leading slash: `sap.app.dataSources.mainService.uri` must stay `/odata/v4/<service>/` exactly
as the generator wrote it (static check 12 reports it). The deployed app needs the relative form: the
`relative-odata-uri` build task (added by `deploy-config.mjs`) writes it into the built app only, so never
edit the source URI for deployment.

### The deployed app opens in SAP Build Work Zone but every OData call returns 404

The built manifest still has the absolute `/odata/v4/<service>/`: the UI module has no `relative-odata-uri`
build task. Run `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`, then
`cd <app> && npm install`, and build again (`/deploy` reports it as UY6).

### `npm run watch` fails after `mbt build` (`@sap/cds` / `@sap/cds-dk` not found)

An html5 module in `mta.yaml` runs its own `npm ci` inside the npm workspace app, which reinstalls the whole
project with only the UI packages. Run `deploy-config.mjs` again (it removes that line — the before-all
`npm ci` installs every app), then `cd <app> && npm install`.

### The deployed app crashes with `TypeError: Cannot read properties of undefined` (works locally)

The browser console shows the error inside `sap.fe.macros` (a table, filter bar or chart), or the List
Report stays empty — but only after deployment. The UI annotations are missing from the deployed
`$metadata`. `cds watch` always loads `app/`; the production build does so only when:

- the nodejs task in `cds.build.tasks` (root `package.json` or `.cdsrc.json`) keeps `"app"` in its
  `model` — `["db", "srv"]` leaves the annotations out (static check 20);
- `app/services.cds` imports each module's annotations: `using from './<module>/annotations';`
  (static check 21);
- every `metaPath` in the view, or `controlConfiguration` key in the manifest, names an annotation
  term and qualifier that exist — e.g. `LineItem#tableMacro` fails when only `UI.LineItem` is defined
  (static check 22).

Fix the reported item, rebuild and redeploy. To confirm, open `<app-url>/<service-path>/$metadata` in
the deployed app and search for the annotation term.

### Error: UNIQUE constraint failed when the app starts

The server log shows the same `init from db\data\<file>.csv` line twice. On Windows this happens when
the server is started from a path whose drive letter is written differently from the stored one —
`c:\…` instead of `C:\…` (VS Code passes folders with a lowercase drive letter). CAP compares paths as
text and imports every seed file twice. The Intent2Code check scripts already start the server from the
exact path; for your own `npm run watch`, run `cd C:\…\<app>` (capital drive letter) first. If the log lists
each CSV only once, the CSV itself contains a duplicate key.

### Error: @sap/cds was loaded from different locations

The app was started with a global `cds`. Stop it and run `npm run watch` in the app folder;
`stack.mjs check <app>` confirms that `@sap/cds` and `@sap/cds-dk` are local and on the same major.

### Port 4004 (or 8080) is already in use

A dev server from an earlier run is still running. `node .claude/skills/application-sanity-check/scripts/free-port.mjs 4004`
stops it if it is a Node.js process.

### The Technical Design Document is incomplete

`/document TDD` writes it section by section and verifies it at the end. To see what is still open:
`node .claude/skills/deliverable-templates/scripts/tdd-scaffold.mjs <app> --check`.

### I want to understand why a finding is CRITICAL vs WARNING

- **CRITICAL** = blocks a build or deploy, or is a security issue
- **WARNING** = best practice, should be fixed before production
- **INFO** = style/convention, nice-to-have improvements

---

## Performance Tips

1. **Use `/intent` for new projects** — it's faster than manually scaffolding
2. **Use `/modify` instead of editing manually** — it applies findings in sequence with diffs
3. **Conditional skills** — mta-reviewer skips sections 8e/8f/8g/8h if those resources aren't present (faster on simple projects)
4. **Run `/review` once per change** — don't iterate on the same code multiple times without applying fixes first

---

## Commands Reference

| Command | What it does |
| ------- | ------------ |
| `/intent` | End-to-end build from requirements |
| `/review` | Read-only code audit |
| `/modify` | Apply review findings |
| `/deploy` | MTA deployment readiness audit |
| `/test` | Generate and run tests |
| `/document` | Generate TDD, UTD, or both |
| `/help` | Claude Code built-in help |

---

## References

- [CLAUDE.md](./CLAUDE.md) — Project-specific engineering standards and MTA deployment pattern
- [README.md](./README.md) — Project overview
- [CHANGELOG.md](./CHANGELOG.md) — What changed in each version
- SAP BTP Help: https://help.sap.com/docs/btp
- CAP Docs: https://cap.cloud.sap/docs
- UI5 SDK: https://ui5.sap.com
- Fiori Design: https://experience.sap.com/fiori-design-web

---

## FAQ

**Q: Can I run `/review` multiple times on the same code?**
A: Yes. Each run detects and reports issues. Use `/modify` to fix them between runs.

**Q: What if `/intent` generates code I don't like?**
A: Use `/modify` to fix specific issues, or manually edit and re-run `/review` to validate.

**Q: Do I have to use `/intent` or can I start with my own code?**
A: You can use your own code. Just run `/review` and `/deploy` to validate it.

**Q: Can I skip the documentation deliverables?**
A: Yes. Deliverables are optional. The application code is the primary output.

**Q: What's the difference between `/review` and manual code review?**
A: `/review` is automated, unbiased, and always covers the same 11 categories. Manual review is better for design feedback and business logic. Use both.

---

*Last updated: 2026-10-19 (Intent2Code 1.10)*
