# Intent2Code — Engineering Standards

Single source of truth for every agent working in this workspace.
Skills encode deeper patterns; this file establishes the non-negotiable defaults.

---

## Stack defaults — generated from `stack.json` (the single source of truth for versions)

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

---

## The five hard rules (never break these)

### 1. Namespace must match in all four places

`Component.(js|ts)`, `manifest.json → sap.app.id`, `index.html → resource-roots`, `ui5.yaml → metadata.name` (lowercase).
A single mismatch → `failed to load Component.js` at runtime. Run `validate_namespace` after scaffolding.

### 2. No standalone approuter module

Use the **html5-apps-repo pattern** — the BTP HTML5 Application Runtime is the public entry point.
There is no `approuter.nodejs` module. `mta-reviewer` rule G1 flags any legacy approuter.

### 3. `forwardAuthToken: true` in two places

Must appear in **both** `srv` module `provides.srv-api.properties` **and** the srv-api destination entry
(`HTML5.ForwardAuthToken: true` — in the app deployer `parameters.config.destinations` of the generated layout,
or in the destination `init_data` of a hand-written one; `deployment-validation` → `references/mta-layouts.md`).
Omitting either one silently breaks RBAC — every OData call returns 403 even with a valid user token.

### 4. No `console.log` in production code

Use `cds.log('<module>')` in CAP handlers; use the UI5 `Log` module (`sap/base/Log`) in the frontend.

### 5. `cds` is always invoked through an npm script, never as a bare command

Every generated CAP root `package.json` carries `@sap/cds-dk` in `devDependencies` pinned to the
**same major** as `@sap/cds` in `dependencies`, plus a plain `"watch": "cds watch"` script.
Run the project with `npm run watch` — **never** bare `cds watch`.

**Why.** `@sap/cds-dk` ships `@sap/cds` in `bundleDependencies`, so
`node_modules/@sap/cds-dk/node_modules/@sap/cds` exists in every correct install and can never be
deduped away. That copy is **harmless on its own**. It becomes the
`ERROR: @sap/cds was loaded from different locations` failure only when cds-dk resolves
`@sap/cds` from a *different root* than project code does. cds-dk picks its copy with
`require.resolve('@sap/cds', { paths: [process.cwd(), __dirname] })`; when `@sap/cds` is not
resolvable from the invocation cwd, `cds-dk/bin/watch.js` sets `NODE_PATH` to the **global**
cds-dk's `node_modules`, and every plugin living there (`@sap/cds-fiori`, `@sap/cds-mtxs`, …)
loads the bundled copy while `srv/*.js` loads the local one. Two roots →
`@sap/cds/bin/serve.js:_check_setup()` prints the ERROR and calls `process.exit(1)`.

`npm run` prepends `node_modules/.bin` to PATH and sets cwd to the package root, so
`process.cwd()` and `__dirname` both land inside the project and the fallback branch can never
fire. A bare `cds watch` uses whichever global binary PATH happens to expose, with whatever cwd
the shell or IDE happens to have.

**Corollaries.**

- Every `.vscode/tasks.json` `cds` task **must** set `options.cwd` to the project root — VS Code
  tasks otherwise inherit the workspace-root folder, which in a multi-project workspace has no
  `@sap/cds`.
- **Never** set `cds.server.exit_on_multi_install: false` in `.cdsrc.json` or `package.json`. It
  suppresses the `process.exit(1)` but not the message, and hides a real resolution fault.
- **Never** use npm `overrides` to force `@sap/cds` — `bundleDependencies` is immune to it, so
  the override is a silent no-op.
- `cds build` output (`gen/`) contains its own `node_modules/@sap/cds`. Keep `gen/` in
  `.gitignore` and delete it before any dependency change.
- The global `@sap/cds-dk` is for **scaffolding only** (`cds init`, `cds add`). Never install
  `@sap/cds` globally as a top-level package.

See `sap-conventions` → `bootstrapping.md` pitfall **P-04** for the full diagnosis, and
`application-sanity-check` **static checks 1–5** for the automated gate.

---

## Skill map — which skill to load for which task

| Task | Load this skill |
|---|---|
| Scaffolding a new project | `cap-skill` → `cap-project-structure.md` first |
| CDS schema / data model | `cap-skill` → `cap-schema.md` |
| Service CDS + `@restrict` | `cap-skill` → `cap-service.md` |
| Handler logic (`srv/*.js`) | `cap-skill` → `cap-handlers.md`, `srv-structure.md` |
| Async / await correctness | `cap-skill` → `cap-async.md` |
| Remote services | `cap-skill` → `cap-remote.md` |
| XSUAA, roles, `xs-security.json` | `cap-skill` → `cap-security.md` |
| Fiori Elements manifest / routing | `fiori-bootstrap` skill |
| Fiori Elements annotations (CDS / XML) | `fiori-elements` skill |
| FPM building block annotations | `fiori-elements` → `fpm-annotations.md` |
| FPM bootstrapping (manifest, Component, PageController) | `fiori-bootstrap` → `fpm.md` |
| ANY FPM app (floorplan = FPM, any backend) | MUST ALWAYS load `fiori-bootstrap` → `fpm.md` + `fiori-elements` → `fpm-annotations.md` — CAP → Walkthrough B, external → Walkthrough A |
| Freestyle UI5 | `fiori-freestyle` skill |
| Mock server + proxy wiring | `cap-integration` skill |
| Consume an existing RAP / external OData (UI-only build) | `rap-integration` skill |
| `mta.yaml` deep audit | `mta-reviewer` skill |
| Full deployment pre-flight (all files + cross-file consistency) | `deployment-validation` skill |
| Deployment readiness | `deployment-checklist` skill |
| Launchpad tile + Workzone registration | `launchpad-workzone` skill |
| Architecture gates + Clean Core | `sap-architecture` skill |
| Deliverables (TDD, UTD) | `deliverable-templates` skill |
| Testing (Jest, OPA5, QUnit) | `sap-unit-testing` skill |
| i18n completeness | `i18n-completeness` skill |
| Code quality / security review | `review-quality-checks` skill |

---

## Key prohibitions (apply across all generated code)

- **No hardcoded URLs or credentials** anywhere — use Destination Service for backend URLs, env vars for secrets.
- **No `xs-security.json` inlined in `mta.yaml`** — always reference via `path: ./xs-security.json`.
- **No raw SQL** in CAP handlers — CQL only (`SELECT.from`, `INSERT.into`, `UPDATE`, `DELETE.from`).
- **No `req.user.id` or email checks** for authorization — use `req.user.is('RoleName')`.
- **No two-way OData binding** on read-only data — one-way or one-time binding only.
- **No jQuery** — deprecated in UI5 1.120+.
- **No `SimpleForm`** — use `sap.ui.layout.form.Form` with `ColumnLayout`.
- **No entity without `@restrict`** in a service — missing restriction = open to all authenticated users.
- **No `gen/` committed to git** — `gen/` must be in `.gitignore`; it is rebuilt by `mbt build`.
- **No `default-env.json` committed** — contains live VCAP_SERVICES credentials.
- **No `mocked` auth in `[development]`, no auth in `.cdsrc.json`** — the effective dev auth must be `dummy` or the browser's OData calls get 401 and the Fiori UI is blank. Use only the P-03 canonical block (`bootstrapping.md`).
- **No `{i18n>key}` in `.cds` without the key in `<cap-root>/_i18n/i18n.properties`** — CAP never reads `app/*/webapp/i18n`; unresolved keys show as raw property names in the UI. Every `UI.SelectionFields` property also needs a property-level `@title`/`@Common.Label` (LineItem labels don't reach the filter bar).
- **No unverified UI5 version** in `index.html` — the CDN `src` must answer 200 (a guessed `1.136.1` 404s → blank page).
- **No leading `/` removed from a CAP dataSource URI** — the SOURCE `manifest.json` of a CAP app always keeps the absolute `/odata/v4/<service>/` the generator writes. A relative URI there (bare `odata/v4/<service>/` or destination-prefixed `<destination>/odata/…`) is requested under the app path (`/<app>/odata/…`), CAP returns 404 and the UI is blank. The deployed app gets the relative `odata/v4/<service>/` from the `relative-odata-uri` UI5 build task that `deploy-config.mjs` adds (BUILT manifest and Component-preload only, the source never changes). Static check 12 fails the bare form; `deployment-validation` MAN7 fails any relative CAP source URI and UY6 fails a CAP UI app without the build task.
- **No production build that leaves out `app`** — a `cds.build.tasks` nodejs task with `"model": ["db", "srv"]` drops every UI annotation from the deployed app (`sap.fe.macros` TypeError, empty List Report) while `cds watch` still works. Use `["db", "srv", "app"]` or CAP's default, and import every `app/<module>/annotations.cds` from `app/services.cds` (`using from './<module>/annotations';`). Static checks 20–22 enforce this.
- **No `fiori-tools-appreload` in apps served by `cds-plugin-ui5`** — it crashes every `cds watch` restart (`EADDRINUSE`).
- **No UPDATE validator that requires fields a PATCH does not carry** — check required fields only on CREATE or when present.
- **No hand-written sanity-check tables** — run `node .claude/skills/application-sanity-check/scripts/ui-health-checks.mjs <cap-root>` (static checks 1–22) and `node .claude/skills/application-sanity-check/scripts/smoke-check.mjs <cap-root> --render` (runtime checks 1–10; starts and stops its own server, includes the headless-browser check); paste both outputs verbatim; never renumber, re-define or skip a check. Always name the list — "static check 12", "runtime check 6". HTTP 200 on `index.html` is not proof that a UI renders.
- **No invented commands when the intent2code MCP server is unavailable** — use the scripted fallbacks in `/intent` → COMMAND CONVENTIONS (namespace = `ui-health-checks.mjs` static check 11, generator snapshot = `stack.mjs snapshot`, lint = `npm exec --no -- ui5lint`). Paths are workspace-relative or `C:/…`, never Git-Bash `/c/…`. Plugin scripts run as `node .claude/skills/<skill>/scripts/<script>.mjs` — never from the absolute skill base directory (not pre-approved). Every cds / npm / yo / mbt / plugin-script Bash call sets `timeout: 600000` (a backgrounded command's output sits outside the workspace and needs an approval).
- **No npx, inline node code, curl or recursive deletes in agent commands, and no blanket permissions** — `.claude/settings.json` pre-approves exact commands only (`/intent` → COMMAND CONVENTIONS): local CLIs via `npm exec --no -- <bin>` (never downloads), plugin scripts via `node .claude/skills/<skill>/scripts/<script>.mjs` from the workspace root, deletes via `stack.mjs clean`. Never re-spell a denied command to get around a prompt.
- **No `existing_destinations_policy: fail`** — breaks every redeploy; use `update`.
- **No `synchronizationMode` in OData V4 model settings** — removed in UI5 1.110+; causes silent grey screen (model fails to initialize, no `$metadata` fires). Always use `type: "sap.ui.model.odata.v4.ODataModel"` + `groupId: "$auto"` + `earlyRequests: true` instead.
- **CDN bootstrap uses `sapui5.hana.ondemand.com`** — more reliably reachable in BAS/BTP than `ui5.sap.com`. Full URL pattern: `https://sapui5.hana.ondemand.com/<version>/resources/sap-ui-core.js`.

---

## CAP authorization pattern (mandatory on every service)

```cds
service MyService @(requires: 'authenticated-user') {
  entity MyEntity @(restrict: [
    { grant: 'READ',              to: ['Viewer', 'Editor', 'Admin'] },
    { grant: ['CREATE','UPDATE'], to: ['Editor', 'Admin'] },
    { grant: 'DELETE',            to: 'Admin' }
  ]) as projection on db.MyEntity;
}
```

Roles are defined in `xs-security.json`. Auth is configured **only** in root `package.json`
`cds.requires` using the canonical block in `sap-conventions` → `bootstrapping.md` **P-03**:
`[development]` = `dummy` (UI works with no login), `[roles]` = `mocked` users for opt-in role
tests (`npm run watch -- --profile roles`), `[production]` = `xsuaa`. Never put auth in
`.cdsrc.json`. Verify with `cd <app> && npm exec --no -- cds env requires.auth.kind --profile development` → `dummy`.

---

## MTA deployment pattern (html5-apps-repo, no standalone approuter)

```
Browser → BTP HTML5 Application Runtime → Destination Service → CAP srv → HANA Cloud
```

Generated, never hand-written: `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`, then
`cd <app> && npm install` (`cds add mta,workzone-standard` plus the plugin additions; idempotent — rerun it
to fix a missing or incomplete deployment file).

`mta.yaml` modules: `*-srv` (nodejs, `path: gen/srv`, `builder: npm-ci`, srv-api with `forwardAuthToken`) · `*-db-deployer` (hdb, `gen/db`) · one html5 module per UI app, named `<ID without dashes><app folder>` (`build-result: dist`) · `*-app-deployer` (com.sap.application.content; uploads the app zips and holds the srv-api destination) · `*-destinations` (com.sap.application.content; html5 repo + xsuaa destinations with `sap.cloud.service`)

`mta.yaml` resources: `*-auth` (xsuaa, `path: ./xs-security.json`) · `*-db` (com.sap.xs.hdi-container, no `service-name` needed) · `*-destination` (destination) · `*-html5-repo-host` (html5-apps-repo/app-host) — every managed service with an explicit `service-name`

Per UI app: `app/<folder>/xs-app.json` (`^/?odata/(.*)$` → destination `srv-api`) and the `relative-odata-uri` + `ui5-task-zipper` build tasks in `app/<folder>/ui5.yaml`.
Hand-written projects (srv-api destination in the destination `init_data`, `*-destination-content`) are equally valid — `deployment-validation` → `references/mta-layouts.md` maps every rule to both layouts.

For the full annotated pattern run the `mta-reviewer` skill. For the `xs-app.json` + destination wiring see `cap-integration` → `deploy-approuter-mta.md`.

---

## Launchpad tile registration (every deployed app)

Add `crossNavigation.inbounds` to `manifest.json` and ensure `sap.cloud.service` (top-level `sap.cloud` block) matches the `mta.yaml` destinations content module — `deploy-config.mjs` writes both. After deploy, register the app in SAP Build Workzone Content Manager. See `launchpad-workzone` skill.

---

## Scope (what Intent2Code builds)

✅ CAP Node.js + Fiori Elements (LR+OP, ALP, Object Page, FPM)
✅ CAP Node.js + Freestyle UI5 (TypeScript or JavaScript)
✅ Fiori Elements consuming external OData / RAP (mock + proxy)
✅ SAP BPA workflow Start UI + Task UI
🚫 MDK (planned, not implemented)
🚫 RAP/ABAP Cloud development (consumption only)
🚫 Pro-code side-by-side extensibility (planned, not implemented)
🚫 Event-driven / SAP Event Mesh (planned, not implemented)
🚫 Multi-tenancy (planned, not implemented)
