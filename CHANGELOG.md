# Changelog

All notable changes to Intent2Code. Format: [Keep a Changelog](https://keepachangelog.com/).
The plugin version lives in `stack.json` → `plugin.version`; `stack.mjs release` syncs it everywhere.

## [1.10] - 2026-10-16

Security hardening from the NVIDIA Skillspector scan of 23.09.2026 (39 findings) plus a manual review
of the whole package (Skill_Scan_Report_23.09.2026 → Issues "Solution" column and the "Additional
findings" sheet), the Technical Design Document fix, and the fixes found by building every supported
app type end to end under the new permissions. Verified with Skillspector itself (static mode) on the
whole package and on `.claude/skills` — see "Validated".

### Security
- **Scoped permissions** (`.claude/settings.json`): no blanket `Bash(*)` / `PowerShell(*)` / `Write` / `Edit` /
  `WebFetch`, and the package does not set a permission mode — accepting file edits is the developer's
  one-time choice (USER_GUIDE → Permissions). The exact commands the pipeline runs are pre-approved;
  destructive and downloading commands are denied; `cf` and `npm audit fix` ask.
  `env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR=1` keeps every shell call in the workspace root (Claude
  Code refuses a `cd` back up after `cd <app>`).
- **No bundled hooks.** The MCP auto-start hook (an install plus a background server on every prompt) and
  the no-op advisory hook are removed; the review HARD STOP hook is an opt-in snippet (USER_GUIDE →
  Permissions). `/intent` PRE-FLIGHT never installs or starts the MCP server; a VS Code folder-open task runs
  `mcp-server/start-http.mjs` instead, which installs the server dependencies with `npm ci --ignore-scripts`
  (exact lockfile versions, no package install scripts, only when they are missing or the lockfile changed)
  and then starts the server on 127.0.0.1.
- **No package downloads at run time:** every one-off package-runner call (the unrelated npm package named
  "cds", the third-party kill-port helper, the UI5 linter and `@sap/ux-ui5-tooling@latest` downloads) is
  replaced by the project's local binaries (`npm exec --no -- <bin>`).
- **MCP server:** no CORS `*`; Host / Origin validation against DNS rebinding (+ the SDK's own
  protection); tools run local CLIs with an argument array instead of a shell string (closes a command
  injection through `filePatterns` / `projectDir`); SDK pinned to `1.32.1`.
- **No hidden text:** HTML comments removed from all markdown; doc-generator markers are a visible caption;
  version-lint exceptions live in the reviewed `stack.lint-allow.json`; literal U+FEFF characters in JS
  replaced by escapes.
- **Guarded deletes:** `stack.mjs clean <project>` is the only delete the agents use (only gen/,
  node_modules or one half-generated app/<module>, inside a verified CAP/UI5 project, never during a
  review lock).
- `cf deploy` examples no longer skip the Cloud Foundry confirmation; "Intent2Code never runs cf deploy —
  the developer does".
- The committed-secrets check reads `git ls-files` (a git-ignored local file is not a finding) and never
  opens the file.
- `ui-render-check.mjs` refuses non-local URLs; UI5 is resolved / probed only on the SAP CDN hosts.
- **Maintainer code is not shipped.** The release script, the package scanner (security rules) and the
  unit tests live in a separate maintainer kit, so a scan of the plugin folder is a scan of exactly what
  ships.

### Added
- `deliverable-templates/scripts/tdd-scaffold.mjs` — writes the TDD's factual sections from the project
  (data model, services, actions, selection / list / create fields, roles, authorization matrix, validation
  messages, integrations, tech stack, test data, requirement traceability) and `--check` (fails on unwritten
  sections, placeholders, empty sections, unmapped REQs).
- `application-sanity-check/scripts/smoke-check.mjs` — runtime checks 1–10 as one command on a free port: CAP
  mode (`cds serve`) and UI mode for standalone apps (`fiori run` + mock); server rows 1–4 and the browser rows
  5–10 (`ui-render-check.mjs --json`) in one table; log inside the project.
- `application-sanity-check/scripts/free-port.mjs`; `stack.mjs clean`, `stack.mjs snapshot` (scripted fallback
  for `patch_manifest` snapshot); static checks 1–5 (toolchain integrity) and 11 (namespace in 4 places —
  scripted fallback for `validate_namespace`); the static checks now run on standalone UI apps.
- Static checks 20–22 (`ui-health-checks.mjs`): the production build model (`cds.build.tasks`) includes `app`;
  every `app/**/*.cds` annotation file is imported; every annotation a List Report or an `sap.fe.macros`
  building block uses (term + qualifier) exists in the production `$metadata`. Deployment rule PKG12 and the
  `fpm.md` / User Guide troubleshooting describe the same cause.
- `@ui5/linter` (`^1.23.0`) as a stack.json-managed devDependency of every UI module.
- `.vscode/tasks.json` — task *Intent2Code MCP server (HTTP :3999)*, run when the folder opens (trusted folder,
  automatic tasks allowed): `mcp-server/start-http.mjs` installs from the lockfile on the first start (about
  30 s), then starts the server; errors appear in the Problems panel. The plugin keeps the HTTP transport because organisation policies often block MCP servers that Claude
  Code starts itself (stdio) — verified on a managed machine: stdio blocked, HTTP connected with all 22 tools.
- `/intent` COMMAND CONVENTIONS (pre-approved command forms, MCP-tool fallbacks, paths, timeouts) and a
  USER_GUIDE "Permissions" section (including how to scan the package).
- Maintainer kit (outside the plugin): `release.mjs` with gates — version lint, package scan (security
  rules S1–S9, P1–P8, integrity I1–I6), unit tests, MCP smoke test on a staged copy (the plugin folder never
  receives `node_modules`), and a Skillspector gate: 0 findings on the package and on `.claude/skills`.

### Changed
- **Technical Design Document: detailed architecture diagram.** `tdd-scaffold.mjs` generates §3.4 *Detailed
  Architecture Diagram* as a Mermaid flowchart from the project (users and roles, SAP Build Work Zone tiles, HTML5
  runtime, each UI app and floorplan, the srv-api destination, XSUAA, each CAP service with path, entities, draft and
  actions, handlers, database, remote services) and §13.4 as a Mermaid sequence of the main use case; `--check` fails
  a §3.4 without its diagram. Verified: 11 generated diagrams (6 app types) parse and render with Mermaid 11. The
  floorplan label now recognises an OData V4 Analytical List Page.
- **Freestyle UI5 in TypeScript or JavaScript:** Gate C asks the UI language when freestyle is chosen (TypeScript
  stays the default); `scaffold-ui.mjs --lang ts|js`; the `fiori-freestyle` skill (TypeScript vs JavaScript table),
  the UI builder and the review (freestyle detected by a manifest without `sap.fe`, not by `Component.ts`) cover
  both. Verified: a CAP + JavaScript freestyle app built end to end with `/intent`.
- **Fewer `npm install` prompts:** at most two per build (CAP + UI: after the CAP model, and one after the UI
  scaffold + deployment configuration together), one for a service-only or standalone app. The deployment step runs
  right after the scaffold, `deploy-config.mjs` asks for an install only when it changed a `package.json`, and the
  scaffold declares the offline mock server of a standalone freestyle app (no later install). The User Guide states
  why an organisation policy still asks and why the workspace must be the plugin folder.
- **Faster builds** (measured on 16 test builds: about 71 agent minutes each, a third of it in steps a script can do):
  - `sap-conventions/scripts/preflight.mjs` — PRE-FLIGHT checks 2 + 3 as one command: tool versions read from the
    global package files (no `cds --version` / `yo --version` / `npm list -g`, which took minutes on scanned
    machines), the generator test and stack resolution in parallel, a 24-hour cache (a later build: about a second).
    It never installs; missing tools come back as FIX commands for the agent, so install prompts still apply.
  - `sap-conventions/scripts/scaffold-ui.mjs` — the UI scaffold as one command: generator config from the gate
    answers (floorplans and EDMX escaping as in the validated builds), generator run, manifest snapshot, `stack.json`
    versions, `workspaces`, removal of `fiori-tools-appreload`. It prints the `npm install` to run instead of running
    it. Replaces about ten agent turns, the failing `yo --help` probes and regenerations after a wrong floorplan name.
  - `sap-conventions/scripts/deploy-config.mjs` — the deployment configuration as one command (see Fixed).
  - No `cds build --production` during `/intent` (it took minutes and left a `gen/` folder): the builders check the
    model with `cds compile srv --to edmx -o .intent2code/edmx` (seconds, prints only warnings); `cds build` runs
    in the `mta.yaml` before-all hook at `mbt build` and at `/deploy`.
  - The UI builder no longer works out CDS annotation syntax by trial and error (one build: 3 h 30 min, 99 tool
    calls): the verified forms are in the skill, every annotation edit is followed by one compile check, and a
    form that still warns after two attempts goes back to the main thread instead of into compiler source code.
  - STEP 8.1 starts the static checks script, `ui5lint` and the grep checks together.
  - The review (STEP 9) starts in the background as soon as STEP 8.1 is green and runs while STEP 8.2 checks
    coverage; inside `/intent` the review agent runs in fast mode — it skips what the static and runtime checks
    already proved, coverage, deployment and tests, and reviews logic, authorization, security, performance and
    code quality.
- **Sanity check numbering:** two lists, each numbered from 1, printed in number order — **static checks
  1–35** (1–22 `ui-health-checks.mjs`, 23–35 agent checks) and **runtime checks 1–10** (`smoke-check.mjs
  --render`: 1–4 server, 5–10 browser). They replace check 0–21, 3a/4a, 18a–20b, UI-0…UI-14, S-1…S-5 and
  R-0…R-6. Every number always appears (SKIP with the reason when it does not apply). "Gate 1 / Gate 2 / UI
  health gate" are now "static checks / runtime checks" ("Gate" is used only for the decision gates 0 and
  A–H); coverage verification is STEP 8.2. The sanity-check skill ends with an old → new table.

### Fixed
- **Technical Design Document "content never generated":** the agent composed the whole TDD (40–80 KB) in one
  Write; above the model output limit the call was cut off and nothing was saved (reproduced: 38 min, no file).
  Now scaffold → one section per Edit → `--check` (same app and limit: 759-line TDD, 0 FAIL, 14 min).
- Standalone UI apps (`freestyle-ui5`, `external-fe`) had no runtime / browser check.
- `cds init`'s bare `cds watch` VS Code task: rewritten by `stack.mjs apply --scope cap` (agents never edit `.vscode/*`).
- The toolchain check and the review grep inventory ran multi-part shell pipelines (each needed an approval) →
  static checks 1–5 and Grep / Glob tool steps; inline node code snippets → Read / `npm pkg get`.
- Removed a leftover `.vscode/settings.json` that carried a tenant-specific SAP HANA tooling URL.
- **Blank page from a stripped manifest URI:** a build removed the leading `/` from the CAP dataSource URI
  (`/odata/v4/employee/` → `odata/v4/employee/`); the browser then requested `/<app>/odata/v4/employee/$metadata`
  (404). The checks missed it — the URI check normalised the slash away, and the snapshot guard and the MCP
  `patch_manifest` verify compared without it. Static check 12 now fails a bare relative CAP URI, static check 14
  and `patch_manifest` verify compare the exact generator value, and CLAUDE.md, the sanity-check skill,
  deployment rule MAN3, the deployment templates (manifest URI `{BACKEND_DEST}/…`, no leading `/`) and the User
  Guide state the URI forms (source manifest of a CAP app: `/odata/…`; bare `odata/…` only in the built app — see
  the deployment fix below).
- **Deployed Fiori Elements / FPM app crashes with `TypeError: Cannot read properties of undefined` in
  `sap.fe.macros`** (works locally): a `cds.build.tasks` nodejs model `["db", "srv"]` left the UI annotations
  out of the deployed `$metadata`. Static checks 20–22 catch it; the deployment template no longer suggests a
  `cds.build.tasks` entry with `["db", "srv"]`.
- The filter-bar label check (now static check 16) never compiled the service — its `cds compile` arguments
  were passed as one string. It now runs.
- **The MCP server never started in a freshly unzipped package:** the folder-open task ran `index.js`, but the
  zip ships no `node_modules`, so Node stopped at the first import — and the task terminal stayed hidden. The
  task now runs `start-http.mjs` (install when needed, then start), errors name a file so VS Code lists them
  in the Problems panel, and `/intent` PRE-FLIGHT tells the developer `/mcp reconnect all` when a conversation
  opened before the server was up.
- **Runtime check 1 failed with `UNIQUE constraint failed` on every CAP app built from VS Code:** VS Code passes
  the workspace as `c:\…`; CAP compares paths as text, so a server started from a lowercase drive letter
  imported every `db/data` CSV twice (and added the outbox model). `smoke-check.mjs` and `ui-health-checks.mjs`
  now start CAP from the exact stored path (`realpath`). Reproduced on CAP 9.9: `c:\…` fails, `C:\…` starts;
  the test apps never showed it because they were started from `C:\…`.
- **List Report crashed with `TypeError: t.some is not a function`** (no rows) when the builder put a
  `UI.ConnectedFields` column into a `UI.LineItem`. Tested in a real browser on UI5 1.136: ConnectedFields in a
  table always crashes (with or without `$Type: 'Core.Dictionary'`); in an Object Page form it works; a
  `UI.FieldGroup` column shows several fields in one cell. The `fiori-elements` skill and `list-report.md` now
  prescribe the FieldGroup column and forbid ConnectedFields in tables; runtime check 7 fails on the crash.
- **STEP 8.2 could not finish for apps with several list pages:** the browser checks opened only the start
  page, so UI requirements of the other screens (e.g. Departments, Courses) could never be promoted to Built.
  `smoke-check.mjs --render` now opens every Fiori Elements list page of the manifest (and its first detail
  page), with `--route` for other screens; STEP 8.2 uses those rows, checks that the user can actually reach
  each screen, and asks once instead of blocking when no browser is installed.
- **Dev server stopped after `cds add mta` / deploy config** (`Unable to locate module ui5-task-zipper`): the
  generated devDependency was never installed. `/intent` now runs `npm install` after the MTA step, and static
  check 7 fails on any package declared in a UI module's `package.json` but not installed.
- **No status during the build (after STEP 7):** STEP 8 ran as one step for up to an hour (scaffold, deployment
  configuration, a 31-minute install waiting for approval, background agents) with no status line. STEP 8 now shows
  every sub-step (`Build 3/7 · UI scaffold — in progress, about 3–6 min`), every `npm install` line says it may wait for
  the approval prompt, a background agent announces how long the chat stays quiet (type `status` for the board), and
  the run never points to an earlier board ("see above"). The check results are shown in full: STEP 8.1 prints every
  row of static checks 1–35 and runtime checks 1–10 (again after every re-run) and STEP 9 prints the review category
  table and every finding before Gate H, then the findings with their status after the fixes — a run printed only
  "static checks pass" and "0 CRITICAL · 3 WARNING · 7 INFO".
- `/intent` shows a **progress board** at every step change, before every gate question and when it stops:
  every completed step with its recorded gate answer (✅), skipped steps (⏭), the current step (▶) and the steps
  still to come; other messages start with a one-line form (`▶ /intent · STEP 8.1 · Validation — in progress`).
- `/intent` prints the **Requirement Register** (every requirement as a table row, conflicts, analysis) before
  Gate 0, the **Application Architecture** (gate decisions, data model, grant matrix, build plan) before Gate G
  and the **Coverage Report** at STEP 8.2 in the chat as rendered tables — the `.md` files stay the record.
- `ui-render-check.mjs`: a `CHROME_PATH` that points to a missing file is reported as SKIP ("could not start")
  instead of ending the script with an unhandled error.
- **The Fiori UI never reached BTP** (review finding "mta.yaml only deploys the CAP service"): `/intent` ran
  `cds add mta`, which writes only the CAP service, db deployer and xsuaa — no html5 module, app deployer, HTML5
  repository or destination wiring — and the instructions said it did. `deploy-config.mjs` now runs SAP
  `cds add mta,workzone-standard` (every UI app as an html5 module, app deployer with the srv-api destination,
  destination content, html5-repo-host, `xs-app.json`, `ui5-task-zipper`, `sap.cloud.service`, launchpad inbound)
  and adds `forwardAuthToken` on srv-api, `service-name` on every managed service, the stack.json schema and
  build line. Verified: `mbt build` succeeds and the app zip in the `.mtar` is complete.
- **Local and Work Zone need different manifest URIs:** `cds watch` serves the app at `/<namespace>/` and needs
  `/odata/v4/<svc>/`; the HTML5 Application Runtime needs `odata/v4/<svc>/`. One form for both would need a local
  proxy to a fixed port, which points at the wrong server when 4004 is taken. A UI5 build task
  (`relative-odata-uri`, added per app by `deploy-config.mjs`) writes the relative form into the built manifest and
  `Component-preload.js` only. Verified: the source stays absolute and the runtime checks pass; the `.mtar`
  carries the relative URI. The task is a small local extension package (`app/<module>/ui5-tasks/`, a `file:`
  devDependency), so the app `ui5.yaml` stays one YAML document — a second document there makes every later
  `cds add` fail (found when re-running the script). Static checks 12 and 13 now also fail a
  destination-prefixed URI in a CAP source manifest (blank page locally, like the bare form).
- **`mbt build` broke `npm run watch`:** the generated html5 module ran its own `npm ci` inside the npm workspace
  app, which reinstalled the whole tree with only the UI packages — afterwards the project had no `@sap/cds` /
  `@sap/cds-dk`. `deploy-config.mjs` drops that `npm ci` for workspace apps (the before-all `npm ci` installs
  them; also about 1.5 min faster per app). Verified: after `mbt build` the root install is complete and the
  runtime checks pass.
- **`/deploy` rules aligned with the generated layout** (`deployment-validation` → new `references/mta-layouts.md`,
  `mta-reviewer`, `deployment-checklist`, `launchpad-workzone`, the `deployer` agent, `/deploy`, CLAUDE.md):
  both the generated layout and a hand-written one pass; new rules UY6 / U7 (CAP UI app without the URI build
  task) and MAN7 / U8 (relative URI in a CAP source manifest); the workspace exception for `npm ci`; any
  `srv/*.cds` file name; remote-service checks no longer fire on `cds add` platform switches; the XSUAA
  update after an `xs-security.json` change is a redeploy (a plain `cf update-service` fails when `mta.yaml`
  sets the xsappname); `deployment-checklist` no longer describes an approuter module. Verified with two blind
  audits: the generated app has no CRITICAL finding, and a copy with four planted defects (no
  `forwardAuthToken`, wrong route destination, no URI task, relative source URI) gets all four as CRITICAL.
- **Freestyle apps did not deploy:**
  - `cds add workzone-standard` adds `ui5-task-zipper` only to apps listed in the root `sapux` entry (Fiori
    Elements), so a freestyle app shipped no zip and `mbt build` stopped at the missing artifact —
    `deploy-config.mjs` now adds the same zipper entry;
  - a TypeScript freestyle app passed every local check but `npm run build` runs `tsc --noEmit` first: in a CAP
    project the generated `tsconfig.json` did not see the UI5 types installed in the root (`scaffold-ui.mjs` adds the
    root `typeRoots`), and handlers typed as `Event` from `sap/ui/base/Event` failed (`fiori-freestyle` P8 lists the
    typed events, verified in `@sapui5/types`). Static check 25 now also runs `tsc --noEmit` for TypeScript modules.
  Verified: the TypeScript freestyle app from the test builds (15 type errors → 0) and the `.mtar` is created.
- **`CHANGELOG.md` missing in every generated app** (a review and `/deploy` warning each time): `/intent` writes
  it after the build.
- **Value helps on CAP associations and action parameters** (the 3 h 30 min build): an annotation on the generated
  foreign key (`department_code`) is dropped by the compiler with only an `Element not found` warning, and an
  action parameter needs `annotate <Entity> with actions { <action>(<param> @(…)); }`. Verified with the cds 9
  compiler, including the forms that fail; now in `fiori-elements` (SKILL.md, `value-helps.md`). MCP
  `generate_annotations` annotates the association when given the foreign key; `clean_core_check` accepts a value
  help on the association for a foreign-key filter field.
- `mta.yaml` before-all: `npm exec --no -- cds build --production` (`stack.mjs apply --scope deploy` rewrites the
  package-runner line `cds add` generates).
- Wording that Skillspector reads as an instruction (a command named in a "blocked" list, a comment naming
  the command a function replaces, an auto-install phrase in a fallback step) rewritten; `/intent`
  PRE-FLIGHT installs go through the normal approval prompt.

### Validated
Built end to end with `/intent` (headless, plugin settings only, *Accept edits* chosen for the run) on
20–21.10.2026 and re-verified independently with the static checks 1–22 and runtime checks 1–10 — every app
0 FAIL. Build time per app (headless legs, without the install pauses) in brackets:

| App type | Test app | Static checks 1–22 | Runtime checks 1–10 | Deployment |
|---|---|---|---|---|
| Fiori Elements List Report + Object Page | Leave Requests (37 min) | 23 PASS | 8 PASS · 1 WARN | `mbt build` OK, relative URI in the `.mtar` |
| Analytical List Page | Sales Analytics (34 min) | 23 PASS | 7 PASS · 1 WARN | `mbt build` OK, relative URI in the `.mtar` |
| Form Entry Object Page | Supplier Onboarding (38 min) | 21 PASS | 7 PASS · 1 WARN | `mbt build` OK, relative URI in the `.mtar` |
| FPM custom page | Equipment Tracker (37 min) | 23 PASS | 8 PASS · 1 WARN | `mbt build` OK, relative URI in the `.mtar` |
| Freestyle UI5 (TypeScript) on CAP | Help Desk (49 min) | 17 PASS | 10 PASS | `mbt build` OK after the type-check fixes (15 → 0) |
| Freestyle UI5 (JavaScript) on CAP | Equipment Booking (27 min) | 18 PASS | 10 PASS | `mbt build` OK, relative URI in the `.mtar` |
| CAP service only | Credit Check API (25 min) | 8 PASS | 3 PASS · 7 SKIP (no UI) | `mta.yaml` without UI modules |
| Standalone freestyle UI5 on an external OData service | PO Viewer (31 min) | 6 PASS | 9 PASS · 1 SKIP (draft) — UI mode | not generated (no CAP root) |
| Fiori Elements on an external OData service | PO List (21 min) | 5 PASS | 8 PASS · 1 WARN · 1 SKIP (draft) — UI mode | not generated (no CAP root) |

WARN = runtime check 7: non-fatal `sap.fe` framework log lines ("S/CUBE is not yet supported").
The first four apps were built before `deploy-config.mjs` existed: their deployment column is the script run on a
copy. Help Desk: the `fiori-freestyle` P8 fixes applied to a copy as the rule prescribes (static check 25 now
reports such type errors in STEP 8.1).
Deployment: after `mbt build` the root install is complete (`npm run watch` still works) and the app zip in the
`.mtar` carries `manifest.json` and `Component-preload.js` with `odata/v4/<svc>/` plus `xs-app.json`; the source
manifests keep `/odata/v4/<svc>/` and the runtime checks pass. `deploy-config.mjs` re-runs without changes.
`/deploy` rules, two blind audits: the generated app has no CRITICAL finding; a copy with four planted defects
(no `forwardAuthToken`, wrong route destination, no URI task, relative source URI) gets all four as CRITICAL.
CDS annotation forms verified with the cds 9 compiler (value help on association vs foreign key, four
action-parameter variants). MCP smoke test 22 tools; version lint 0 findings.
Release gates (all required for this zip): version lint 0 findings, package scan (no HIGH / MEDIUM), unit
tests, MCP smoke test on a staged copy, NVIDIA Skillspector (static) 0 findings on the package and on
`.claude/skills`.

## [1.09] - 2026-10-16

### Stack
- CAP: `@sap/cds ^9`, `@sap/cds-dk ^9`, `@cap-js/sqlite ^2`, `@cap-js/hana ^2`, node `>=20`
- UI5: line `1.136` → newest verified patch (resolved at build time)

### Added
- **`stack.json` — single source of truth for every version** (CDS major + driver compat map, UI5 release
  line, tooling ranges, Node engines, ui5.yaml specVersion, MTA schema, generator, plugin version).
- **`stack.mjs`** (`sap-conventions/scripts/`, zero dependencies, works without MCP):
  `resolve` (UI5 line → newest patch from SAP's CDN, verified with HEAD = 200, cache + `stack.lock.json`
  offline fallback, never guessed) · `apply <app>` (formatting-preserving value edits, idempotent,
  respects review.lock) · `check <app>` (drift report) · `sync-docs` / `lint` (docs generated from the
  stack, 0 stray literals) · `release` (version sync, CHANGELOG, zip).
- UI health gate **UI-13** (project versions match stack.json) plus UI-8 … UI-12 (TypeScript tooling
  installed, UI5 bootstrap URL exists, valid Form content, served-URL watch script, no appreload under
  cds-plugin-ui5) and the real-browser gate **`ui-render-check.mjs`** (R-1 … R-6: UI5 loaded, view
  rendered, no fatal console errors, no failed requests, first row navigates, empty PATCH accepted).
- MCP tool `patch_manifest` (deterministic manifest corrections + generator snapshot guard, check 21).
- Canonical dev-auth block (bootstrapping P-03): `[development]` dummy · opt-in `[roles]` mocked users ·
  `[production]` xsuaa — in root `package.json` only.

### Changed
- `/intent` PRE-FLIGHT: the global `@sap/cds-dk` is scaffolding-only (any major); projects are pinned by
  `stack.mjs apply`. **Removed the runtime self-edit of CLAUDE.md / reference-apps (old CHECK 3 Step D).**
- `/intent` STEP 8.1: smoke-first pipeline (one `cds build`, one ui5lint, Gate 1 static + Gate 2 smoke +
  browser check); coverage may mark UI requirements Built only after the browser check passes.
- Generator-first scaffolding with a generator-ownership rule (no whole-file manifest rewrites);
  freestyle headless config sets `enableTypeScript`; root `workspaces` enforced.
- CLAUDE.md / README / skill docs: version tables and template snippets generated from `stack.json`.

### Fixed
- `ui5_get_version_info` parsed SAP's `version.json` incorrectly (`latestLTS: "unknown"`) → a patch was
  guessed (`1.136.1`, which does not exist) and blanked a generated app.
- `configure_service` no longer replaces an already-wired dataSource (annotations / V2 / URI preserved).
- Sanity check 14 derives the service path from `cds compile --to serviceinfo` (the lowercase rule
  produced 404 URIs); check 12 reads the effective dev auth via `cds env` (grep passed broken configs).
- `run_checks` linted with a non-existent npm package (`ui5lint` → `@ui5/linter`).
- Check 11 waited 30 s and broke on the first log line → false "server down" + restart loops.
- 18 contradictory version statements across ~60 files (CDS 9 vs 10, sqlite ^2 vs ^3,
  cds-plugin-ui5 ^0.16 vs ^0.17, UI5 1.116 … 1.150) — now generated from one file.
- MCP server dependencies upgraded (`@modelcontextprotocol/sdk` 1.32, `fast-uri`) — 0 known vulnerabilities.
