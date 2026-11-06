---
name: application-sanity-check
description: >
  Technical sanity checklist for a generated Intent2Code project — run after the build agents
  complete and before coverage verification or review. Two numbered lists, each starting at 1:
  STATIC CHECKS 1–35 (no server; 1–22 are one script, scripts/ui-health-checks.mjs, and 23–35 are
  done by the agent) and RUNTIME CHECKS 1–10 (scripts/smoke-check.mjs --render; 1–4 start the
  app's own dev server and probe it, 5–10 load the UI in headless Chrome/Edge). Static checks
  cover toolchain resolution integrity (@sap/cds and @sap/cds-dk local at the same major, no
  duplicate @sap/cds copy, a plain watch script, no exit_on_multi_install band-aid, options.cwd in
  .vscode/tasks.json), stack.json versions, effective dev auth dummy, namespace consistency, the
  manifest dataSources URI = the path CAP serves (cds compile --to serviceinfo; never a lowercase
  rule) with its leading / kept (a bare odata/v4/... URI is requested under the app path → 404 →
  blank page), destination-prefixed URIs without a leading / (Workzone 404), a production build
  model that includes app/, every app annotation file imported, every annotation a List Report or
  sap.fe.macros building block uses present in the production build (TypeError in the deployed
  app), manifest validation, manifest v2 routing keys (name/id/level, routing.config path — v1
  names are FUTURE FATAL and blank the page), ui5lint, auth annotations on every entity, no
  console.log or hardcoded secrets, CSV UUIDs, i18n supportedLocales includes en, CollectionPath
  entities inside the service block, and FPM wiring. Load at STEP 8.1 of the /intent flow: static
  checks 1–35, then runtime checks 1–10. Keywords: sanity check, static checks, runtime checks,
  build validation, cds build, validate_namespace, ui5lint, @restrict, @requires, console.log,
  hardcoded URL, CSV UUID, cds watch, runtime, OData metadata, pre-review check, dummy auth,
  mocked auth, --open path, manifest URI, service path, relative URI, destination prefix, leading
  slash, Workzone, managed approuter, GUID app context, supportedLocales, i18n, en locale,
  CollectionPath, value help entity, service block, 404 value help, loaded from different
  locations, dual-load, bundleDependencies, cds-dk, exit_on_multi_install, NODE_PATH, npm run
  watch, toolchain integrity, duplicate @sap/cds, manifest v2, _version 2.0.0, routing targets,
  viewName, viewId, viewLevel, viewType, viewPath, FUTURE FATAL, blank page, No view type
  specified, cds.build.tasks, production build model, sap.fe.macros, metaPath, annotation
  qualifier.
---

# Sanity Check — Technical Build Validation

> **Running this skill's scripts:** always `node .claude/skills/application-sanity-check/scripts/<script>.mjs …` from the workspace root (every
> Bash call starts there). Do **not** build the path from the absolute base directory shown when the skill loads —
> `node "C:/…/.claude/skills/…"` is not pre-approved and stops for an approval; the relative form is.

## How the checks are numbered

There are **two lists, each numbered from 1**. Always name the list — "static check 12",
"runtime check 6". A bare "check 12" is ambiguous.

| List | Numbers | Run by | Server |
|---|---|---|---|
| **Static checks** | 1–22 | `scripts/ui-health-checks.mjs` — one table, always in number order | not needed |
| | 23–35 | the agent, in this order (MCP tool, or Grep + Read) | not needed |
| **Runtime checks** | 1–4 | `scripts/smoke-check.mjs` — starts the project's own dev server, probes it, stops it | started by the script |
| | 5–10 | `scripts/ui-render-check.mjs` in headless Chrome/Edge — `smoke-check.mjs --render` runs it and prints its rows in the same table | |

**Order at STEP 8.1:** static checks 1–35 → fix until all pass → runtime checks 1–10. Fix every
failure before coverage verification (STEP 8.2) or review (STEP 9). Reports from before
version 1.10 used other IDs (check 0–21, UI-n, S-n, R-n) — see the mapping at the end.

**How commands are run.** Plugin scripts are always invoked from the **workspace root** (the folder
that contains `.claude/`) with the relative path `node .claude/skills/<skill>/scripts/<script>.mjs …`;
if the shell may be elsewhere, use `cd "<workspace root>" && node .claude/skills/…`. The CDS CLI is
always the project's local one, run from the CAP root: `cd <cap-root> && npm exec --no -- cds <args>`.

---

## Static checks 1–22 — `scripts/ui-health-checks.mjs` (MANDATORY)

**Why a script:** agents re-wrote this checklist from memory and reported a broken app as all-PASS
(a check relabelled, checks marked "fixed" that were not). The script asks CAP itself (`cds env`,
`cds compile`) instead of grepping config files — a misplaced block can contain the right word and
still be ignored by CAP — and prints one fixed table.

```bash
# from the workspace root (the folder that contains .claude/)
node .claude/skills/application-sanity-check/scripts/ui-health-checks.mjs <project-root>
# if the shell may be elsewhere:
cd "<workspace root>" && node .claude/skills/application-sanity-check/scripts/ui-health-checks.mjs <project-root>
```

| # | Check | What it prevents |
|---|---|---|
| 1 | CAP tools installed locally, same major (`@sap/cds` + `@sap/cds-dk` in `<cap-root>/node_modules`) | `@sap/cds was loaded from different locations` → server exits |
| 2 | Only one `@sap/cds` copy (nested installs, `app/*/node_modules`) — the bundled `@sap/cds-dk/node_modules/@sap/cds` and `gen/` are never reported | same |
| 3 | Plain `"watch": "cds watch"` script in the root `package.json` | same (a bare global `cds watch` picks another resolution root) |
| 4 | No `exit_on_multi_install` band-aid (FAIL); an `overrides` entry for `@sap/cds` is a WARN | the real fault stays hidden |
| 5 | `.vscode/tasks.json` (if any) runs `npm run watch` with `options.cwd` — `cds init` generates a bare `cds watch` task (WARN) | dual-load when started from VS Code |
| 6 | Versions match `stack.json` (CDS/driver ranges, engines.node, app tooling, UI5 line + published patch, specVersion, mta schema) — delegates to `sap-conventions/scripts/stack.mjs check` | drift from the single source of truth; unpublished UI5 patch → blank page |
| 7 | Every `ui5.yaml` middleware (e.g. TypeScript transpile) **and every package declared in the UI module's `package.json`** is installed; `Component.ts` apps have the transpile middleware | app not served / `.ts` never transpiled → blank page; a declared but uninstalled package (e.g. `ui5-task-zipper` after `cds add mta`) stops the dev server |
| 8 | No `fiori-tools-appreload` in apps served by `cds-plugin-ui5` | `EADDRINUSE` → dev server dies on every backend change |
| 9 | A `cds watch --open <ui5.yaml metadata.name>/index.html` script exists (WARN) | user opens `/<module>/webapp/` → raw TypeScript → blank page |
| 10 | Effective dev auth is `dummy` (`cds env`) | 401 on `$metadata` → blank page |
| 11 | Namespace identical in `Component.(js\|ts)`, `sap.app.id`, `index.html` resource-roots and `ui5.yaml` metadata.name (hard rule 1) — the scripted form of `validate_namespace` | `failed to load Component.js` → blank page |
| 12 | Manifest `mainService.uri` = a path CAP serves (`cds compile --to serviceinfo`), leading `/` kept | 404 on `$metadata` → blank page |
| 13 | A destination-prefixed URI has no leading `/` | Workzone 404 |
| 14 | Nothing from the generator manifest lost (`.intent2code/manifest.generated.json`) | missing dataSource / annotations |
| 15 | Every `{i18n>key}` in `.cds` exists in a CAP bundle (`_i18n/`) | raw property names as labels |
| 16 | Every `UI.SelectionFields` property has a property label | raw names in the filter bar |
| 17 | List Report `initialLoad: "Enabled"` (WARN) | empty table until "Go" |
| 18 | The UI5 bootstrap URL in `index.html` exists on the CDN (HTTP 200) | guessed patch version → `sap-ui-core.js` 404 → blank page |
| 19 | `<fields>` of a Form contain only form controls (no HBox/VBox/FlexBox/Toolbar) | "not a valid Form content" → route crashes |
| 20 | The production build model (`cds.build.tasks`, nodejs task `options.model`) includes `app` | UI annotations missing after deploy → `sap.fe.macros` TypeError, empty List Report |
| 21 | Every `app/**/*.cds` annotation file is reached through `using` from one of the build roots (`app/services.cds` or `app/<module>-ui.cds` imports `./<module>/annotations`) | annotations not loaded, with no error — locally **and** after deploy |
| 22 | Every annotation the app uses (List Report `LineItem`/`controlConfiguration` qualifiers, FPM `macros:Table`/`FilterBar`/`Chart` `metaPath`/`contextPath`) exists in the production `$metadata` | macro `TypeError: Cannot read properties of undefined` → page crash |

Standalone UI apps (`freestyle-ui5`, `external-fe`) get the CAP-only rows as `SKIP`. A row that does
not apply (no `app/*/ui5.yaml`, no List Report, no snapshot) is `SKIP` with the reason — every
number always appears.

**Rules:**

- Paste the script output **verbatim** into the STEP 8 report. Never renumber, re-define, re-word
  or skip a row, and never mark a row PASS that the script did not print as PASS.
- Exit code `1` (any FAIL) = hard stop: apply the fix printed under "Fixes:" (one line per failing
  check, `- Static N (FAIL): …`), re-run the script, repeat until exit code `0`. WARN rows must be
  fixed or justified in the TDD.
- Needs `node_modules` installed in the CAP root (it runs the project's local `@sap/cds-dk`
  directly with node — no npx, nothing is downloaded). Exit `2` = setup error (`npm install` first).

### Fix guide — static checks 1–5 (toolchain & resolution integrity, no `@sap/cds` dual-load)

**Why:** `@sap/cds-dk` ships `@sap/cds` in `bundleDependencies`, so
`node_modules/@sap/cds-dk/node_modules/@sap/cds` **always** exists and is **harmless**. The
`ERROR: @sap/cds was loaded from different locations` failure appears only when cds-dk resolves
`@sap/cds` from a different root than project code — which happens when `cds watch` is invoked
with a cwd from which `@sap/cds` is not resolvable, or via a global binary. Catching it statically
avoids burning a full server start in runtime check 1. See `CLAUDE.md` hard rule 5 and
`sap-conventions` → `bootstrapping.md` pitfall P-04.

**Fail action (self-healing — apply, then re-run the static checks):**

| Static check · finding | Auto-fix (no user prompt) |
|---|---|
| 1 — `@sap/cds` missing | `node .claude/skills/sap-conventions/scripts/stack.mjs apply <app> --scope cap` (adds `@sap/cds` at the stack.json range), then `npm install` in `<app>/` |
| 1 — `@sap/cds-dk` missing | `node .claude/skills/sap-conventions/scripts/stack.mjs apply <app> --scope cap` (adds `@sap/cds-dk` at the stack.json range), then `npm install` |
| 1 — major mismatch | `node .claude/skills/sap-conventions/scripts/stack.mjs apply <app> --scope cap` (aligns both to `stack.json` `cap.cdsMajor`), then `node .claude/skills/sap-conventions/scripts/stack.mjs clean <app> --node-modules` (guarded delete of `gen/` + `node_modules/`), then `npm install` |
| `gen/` exists | **Not a failure** (excluded from static check 2). Only confirm `gen/` is in `.gitignore`; never delete-and-rebuild it inside the check loop |
| 2 — extra copies listed | A genuine nested install. `node .claude/skills/sap-conventions/scripts/stack.mjs clean <app> --node-modules` (removes `node_modules/` at the project root **and** in each `app/*` workspace, plus `gen/`), then `npm install` from the root |
| 3 | Add `"watch": "cds watch"` to root `package.json` `scripts` (keep any existing `watch-*` entries) |
| 4 | Remove the `server.exit_on_multi_install` key from `.cdsrc.json` / the `package.json` `cds` block. **Never** re-add it — it hides the fault, it does not fix it. Remove any `overrides` entry for `@sap/cds` (no-op against `bundleDependencies`) |
| 5 (WARN) | `node .claude/skills/sap-conventions/scripts/stack.mjs apply <app> --scope cap` — rewrites the bare `cds watch` task that `cds init` generates to `npm run watch` with `options.cwd`. Never edit `.vscode/*` with Edit/Write: VS Code config is a protected path (a task runs commands when the folder opens) and the edit is refused or prompts |

> **Never** report `node_modules/@sap/cds-dk/node_modules/@sap/cds` as a duplicate —
> static check 2 deliberately excludes it. It is a `bundleDependencies` payload present in
> every correct install, and flagging it would make this check fire on every project forever.

### Fix guide — static check 9 (watch script `--open` path)

`cds-plugin-ui5` mounts the Fiori app at `/{ui5.yaml metadata.name}/index.html`
(e.g. `/com.myapp.webapp/index.html`). An `--open` argument that uses the folder name
(e.g. `--open myapp/index.html`) opens a 404 URL. **Auto-fix (no user prompt):** read
`app/*/ui5.yaml` for `metadata.name`, then set the `watch-*` script in root `package.json` so the
`--open` value is `<metadata.name>/index.html?sap-ui-xx-viewCache=false`.

### Fix guide — static check 10 (the EFFECTIVE dev auth must be `dummy`)

**Why:** with `mocked`/`basic` dev auth the browser's OData XHR gets `401` (+ `WWW-Authenticate:
Basic`), the metadata request fails and the Fiori app renders a blank page. **Never grep the config
files** — a misplaced block such as `{ "[development]": { "auth": { "kind": "dummy" } } }` at the
top of `.cdsrc.json` (missing `requires`) contains the word "dummy" and is ignored by CAP without an
error, which falls back to `mocked`. The script asks CAP; to confirm by hand:

```bash
cd <cap-root> && npm exec --no -- cds env requires.auth.kind --profile development
```

**Pass:** prints `dummy`, and no auth block exists in `.cdsrc.json` (a second source = WARN).

**Auto-fix (no user prompt):** apply the canonical P-03 block (`sap-conventions` →
`bootstrapping.md`) to root `package.json` `cds.requires` — `[development]: { "auth": "dummy" }`,
`[roles]` mocked users (opt-in role tests), `[production]: { "auth": "xsuaa" }` — and **delete every
other auth block** (`.cdsrc.json` `requires.auth`, any top-level `[development]` key,
`cds.requires.auth.[development]`). Never "fix" it by switching to `mocked`. Re-run; it must print
`dummy`.

### Fix guide — static check 11 (namespace)

The MCP tool `mcp__intent2code__validate_namespace` on the UI app folder gives the same result with
more detail; static check 11 is the scripted form and is authoritative when the MCP server is not
available. **Fail action:** re-spawn `fiori-code-builder` with the exact mismatch — the namespace
must be identical in `Component.(js|ts)`, `manifest.json sap.app.id`, `index.html
data-sap-ui-resource-roots` and `ui5.yaml metadata.name` (lowercase).

### Fix guide — static checks 12 and 13 (manifest dataSource URI)

**Why:** if the manifest URI does not match the path CAP actually serves, every metadata request
returns 404 and the entire UI is blank. CAP strips the `Service` suffix and **kebab-cases** the
rest (`OrdersService` → `/odata/v4/orders/`, `PurchaseOrderService` → `/odata/v4/purchase-order/`),
honours `@path`, and services may be declared in any `srv/*.cds` file — so the expected path comes
from the CDS compiler (`cds compile srv --to serviceinfo`), never from a lowercase/strip rule (a
hand-derived `/odata/v4/purchaseorder/` is a 404 and the "fix" would break a correct generator URI).

| URI form | Example | Where it belongs | Checked by |
|---|---|---|---|
| Absolute served path | `/odata/v4/student/` | **Source manifest of every CAP app** | static check 12 |
| Bare relative | `odata/v4/student/` | Only the **built** CAP app (dist, Component-preload) — written by the `relative-odata-uri` build task that `deploy-config.mjs` adds | in source: **FAIL** (static check 12) |
| Destination-prefixed | `myapp-srv-api/odata/v4/student/` | Standalone UI apps behind a destination (never with a leading `/`) | static check 13; in a CAP source: **FAIL** (static checks 12 + 13) |

- **CAP source URIs stay absolute.** The OData V4 model resolves relative URIs against the URL of the
  app, not the server root. `cds watch` serves the app at `http://localhost:4004/<namespace>/`, so a
  relative `odata/v4/student/` becomes `/<namespace>/odata/v4/student/` — a 404 and a blank page.
- **The deployed app needs the relative form.** In SAP Build Work Zone the app runs under its own
  path; `xs-app.json` routes `^/?odata/(.*)$` to the `srv-api` destination. The UI5 build task
  `relative-odata-uri` rewrites the URI in the built manifest only, so source and deployment never
  conflict. Never edit the source URI for deployment.
- **Destination-prefixed URIs (standalone apps) must not start with `/`** — a leading slash makes
  the URI absolute and every OData call returns 404 in Work Zone.

**Auto-fix — static check 12 (no user prompt):** set `sap.app.dataSources.mainService.uri` to the
served path of the service that app binds to, via `configure_service { appDir, source: "cap",
serviceUrl: <served>, force: true }` (changes the `uri` only; keeps `settings`) or a single-key
`Edit`. A bare `odata/v4/<service>/` URI gets its leading slash back exactly as the generator wrote
it (`/odata/v4/<service>/`). If more than one service is served and it is unclear which one the app
binds to, ask the developer instead of guessing. **Never strip the leading slash here.**

**Auto-fix — static check 13, CAP app:** a destination prefix in a CAP source manifest is fixed like
static check 12 (absolute served path); `deploy-config.mjs` makes the deployed URI relative.

**Auto-fix — static check 13, standalone app (destination-prefixed URIs only — never plain OData URIs):** static
check 13 reads `mainService`; also look at every other `sap.app.dataSources.<key>.uri`
(`grep -n '"uri"' app/*/webapp/manifest.json`, Read the file when a hit's parent is unclear).

```javascript
// Before: "/leaversapp-srv-api/odata/v4/leavers/"
// After:  "leaversapp-srv-api/odata/v4/leavers/"
//
// GUARD: only strip when the URI is a destination-prefix form.
// Never strip from a URI whose first segment is "odata" — that breaks local cds watch.
const PLAIN_PREFIXES = ['/odata/', '/resources/', '/test-resources/'];
if (uri.startsWith('/') && !PLAIN_PREFIXES.some(p => uri.startsWith(p))) {
  uri = uri.replace(/^\//, '');
}
```

### Fix guide — static check 14 (generator snapshot guard)

**Why:** "metadata missing from the manifest" happens when something rewrites `manifest.json` after
the generator ran (a whole-file `Write`, a walkthrough "repair", an old `configure_service`).
`patch_manifest` snapshots the untouched generator manifest on its first call; this check proves
nothing it contained has since disappeared. The compared facts are every `sap.app.dataSources`
entry, its exact `uri`, each `settings.annotations` entry and `settings.localUri`, and every
`sap.ui5.models` → `dataSource` binding. The MCP form is `patch_manifest { appDir: "app/<module>",
mode: "verify" }`. No snapshot (Path B fallback, or freestyle without a generator) → `SKIP`.

**Auto-fix (no user prompt):** restore exactly the missing entries from
`.intent2code/manifest.generated.json` into `webapp/manifest.json` with single-key `Edit`s (never
copy the snapshot over the manifest — later legitimate corrections would be lost). Never edit the
snapshot. Then report which step overwrote it, so the root cause gets fixed.

### Fix guide — static checks 20–22 (UI annotations in the production build)

**Why:** `cds watch` loads `app/` automatically, so an app can work locally and still crash after
deployment: a `cds.build.tasks` nodejs task with `"model": ["db", "srv"]` leaves every UI
annotation out of the deployed model, and an `sap.fe.macros` building block then fails with
`TypeError: Cannot read properties of undefined` — the List Report or FPM page is empty or crashes.
CAP also loads a folder only through its `index.cds` or its top-level `*.cds` files, so
`app/<module>/annotations.cds` is loaded only when `app/services.cds` (or `app/<module>-ui.cds`)
imports it.

| Static check | Auto-fix (no user prompt) |
|---|---|
| 20 | Add `"app"` to the nodejs task's `options.model` (`["db", "srv", "app"]`) — or remove the custom `cds.build.tasks` entry so CAP's default (which includes `app`) applies |
| 21 | Add `using from './<module>/annotations';` to `app/services.cds` (create it if missing) for every file the detail lists |
| 22 | Fix 20 and 21 first. Otherwise make the view's `metaPath` / `contextPath`, or the manifest's `controlConfiguration` key, name exactly the annotation term, qualifier and entity set that `annotations.cds` defines (e.g. `@com.sap.vocabularies.UI.v1.LineItem` vs `LineItem#tableMacro`). After deploying, open `<app-url>/<service-path>/$metadata` and search for the term |

---

## Static checks 23–35 — run by the agent

Run in this order after static checks 1–22 pass. Each check names the tool or the Grep pattern.

### 23. Fiori Manifest Validation *(Fiori Elements and Freestyle apps only)*

**Tool:** `mcp__intent2code__ui5_run_manifest_validation` on the app folder.

**Pass:** No errors. Warnings are acceptable but must be noted.

**Fail action:** Re-spawn `fiori-code-builder` with the validation output.

---

### 24. Manifest v2 Routing Keys — Targets Use `name`/`id`/`level`, Config Uses `path`

**Why:** When `_version` is `"2.0.0"` or higher, UI5 renamed every routing **target** property. A
target that still carries a v1 name aborts Component init with
`[FUTURE FATAL] sap.ui5/routing/targets/viewName is deprecated and not supported with manifest
version 2. Use the option 'name' instead` — the page renders blank with no stack trace. Neither
static check 23 (`ui5_run_manifest_validation`) nor static check 25 (`ui5_run_ui5_linter`)
reported anything on a real broken manifest — **both returned 0 errors** — so this static check is
the gate that catches it, before a full server start in the runtime checks.
See `sap-conventions` → `bootstrapping.md` pitfall P-01.

| v1 name (fatal under `_version` ≥ 2.0.0) | v2 name (required) |
|---|---|
| `routing.targets.<X>.viewName` | `name` |
| `routing.targets.<X>.viewId` | `id` |
| `routing.targets.<X>.viewLevel` | `level` |
| `routing.targets.<X>.viewType` | **move** to `routing.config.viewType` — see SCOPE, not a rename |
| `routing.config.viewPath` | `path` |

> **SCOPE — read before applying the auto-fix or this check breaks working apps.**
>
> | Location | Under `_version` ≥ 2.0.0 | Action |
> |---|---|---|
> | `routing.targets.<X>.viewName` / `viewId` / `viewLevel` | **Fatal** | Rename to `name` / `id` / `level` |
> | `routing.targets.<X>.viewType` | **Fatal** | Move value to `routing.config.viewType`; delete from target |
> | `routing.config.viewPath` | **Fatal** | Rename to `path` |
> | `routing.config.viewType` | **Valid and REQUIRED** | **Never touch** |
> | `sap.ui5.rootView.viewName` | **Valid** | **Never touch** |
> | `routing.targets.<X>.options.settings.viewName` | **Valid and REQUIRED** | **Never touch** |
> | Any manifest with `_version` `1.x` | **Valid as authored** | **Never touch** |
>
> - **`routing.config.viewType` must stay.** The Router cannot infer the view technology from a
>   target's `"type": "View"`; without it you get `No view type specified`. P-01 mandates it.
>   Empirically confirmed on UI5 1.152 with `_version` 2.0.0: `routing.config.viewType: "XML"`
>   produces **no** error.
> - **Target `viewType` is not a rename.** On a v2 target, `type` means `"View"` | `"Component"`.
>   Renaming `viewType: "XML"` to `type: "XML"` produces an invalid target type and overwrites a
>   real `type` if one is present. Move the view technology into `routing.config.viewType`.
> - **`rootView.viewName` must stay.** Unchanged in v2, and the `namespace_mismatch` rule of static
>   check 23 reads it to compare against `sap.app.id`. Renaming it breaks both.
> - **`options.settings.viewName` must stay.** That is a `sap.fe.core.fpm` *component setting*, not
>   a routing target property — **static check 35, item 4 FAILS when it is absent**. This check
>   reads only the target object's own keys and never descends into `options`.
> - **Gate on `_version` alone — never on `minUI5Version`.** Working apps in this workspace run at
>   `minUI5Version` 1.151 with `_version` 1.86.0 and `routing.config.viewPath`; they are correct
>   and must not be flagged.

**Pattern** (Grep to locate, Read to decide — run from the CAP root, or the app root for a
standalone UI5 app):

```bash
# 1. The gate: _version of every manifest
grep -n '"_version"' app/*/webapp/manifest.json webapp/manifest.json 2>/dev/null
# 2. Candidate v1 keys (each hit still has to be placed — see step 4)
grep -nE '"(viewName|viewId|viewLevel|viewType|viewPath)"' app/*/webapp/manifest.json webapp/manifest.json 2>/dev/null
```

3. **Gate — manifest v2 only.** Skip every manifest whose `_version` major is `1` (`1.x` keeps the
   `view*` names and is CORRECT as authored).
4. For each manifest with `_version` ≥ `2.0.0`, **Read** its `sap.ui5.routing` block and place every
   hit from step 2. Look at the **own keys** of each `routing.targets.<X>` object only — never inside
   `options.settings` (`options.settings.viewName` is a required `sap.fe.core.fpm` setting, static
   check 35, item 4) — and at `routing.config`:

   | Hit | Report |
   |---|---|
   | `routing.targets.<X>.viewName` | `FAIL <file> [_version <v>] sap.ui5.routing.targets.<X>.viewName -> rename to 'name'` |
   | `routing.targets.<X>.viewId` | `FAIL <file> [_version <v>] sap.ui5.routing.targets.<X>.viewId -> rename to 'id'` |
   | `routing.targets.<X>.viewLevel` | `FAIL <file> [_version <v>] sap.ui5.routing.targets.<X>.viewLevel -> rename to 'level'` |
   | `routing.targets.<X>.viewType` | `FAIL <file> [_version <v>] sap.ui5.routing.targets.<X>.viewType -> delete from the target and put the value in routing.config.viewType (on a v2 target 'type' means View\|Component)` |
   | `routing.config.viewPath` | `FAIL <file> [_version <v>] sap.ui5.routing.config.viewPath -> rename to 'path' (leave viewType alone)` |
   | `routing.config.viewType`, `sap.ui5.rootView.viewName`, `targets.<X>.options.settings.viewName` | nothing — valid, never flagged (see SCOPE) |

5. No `FAIL` line → report `manifest-v2-routing:OK (N manifest(s) checked)`.

**Pass:** `manifest-v2-routing:OK (N manifest(s) checked)` and no `FAIL` lines. A manifest with
`_version` `1.x` is skipped by design and counts as a pass.

**Fail condition:** Any `FAIL` line — i.e. a manifest with `_version` ≥ 2.0.0 that has `viewName`,
`viewId`, `viewLevel` or `viewType` as an **own key of a routing target**, or `viewPath` in
`routing.config`.

**Auto-fix (no user prompt):**

1. For each `targets.<X>.viewName` / `viewId` / `viewLevel` FAIL: rename the key in place to
   `name` / `id` / `level`. **Keep the value byte-identical** — the view name and level are
   correct; only the key was wrong.
2. For each `targets.<X>.viewType` FAIL: **delete** the key from the target. If
   `routing.config.viewType` is absent, add it there with the same value (normally `"XML"`).
   Do **not** rename it to `type`.
3. For a `routing.config.viewPath` FAIL: rename the key to `path`; keep the value.
4. Then confirm `routing.config` still declares the view technology — `"viewType": "XML"` must be
   present, plus `"type": "View"` either in `routing.config` as the default or on each view target.
   Without `viewType` the Router throws `No view type specified` and the fix trades one blank page
   for another.
5. Do **not** touch `sap.ui5.rootView`, `targets.<X>.options.settings`, or
   `routing.config.viewType` (see SCOPE).
6. Re-run static check 24, then static check 23 (`ui5_run_manifest_validation`) — its
   `manifest_v2_target_view_key` and `manifest_v2_config_viewPath` rules must both be clear.
7. **Never** "fix" this by downgrading `_version` back to `1.x`. That silences the symptom and
   strands the app on a deprecated manifest generation. Rename the keys.

Reference shape of a correct v2 routing block (freestyle):

```jsonc
"routing": {
  "config": {
    "routerClass": "sap.m.routing.Router",
    "controlAggregation": "pages",
    "controlId": "app",
    "transition": "slide",
    "type": "View",
    "viewType": "XML",
    "path": "com.myapp.employees.view"
  },
  "targets": {
    "TargetEmployeeList": { "id": "EmployeeList", "name": "EmployeeList", "transition": "slide" }
  }
}
```

---

### 25. UI5 Lint + TypeScript type check *(Fiori Elements and Freestyle apps only)*

**Tool:** `mcp__intent2code__ui5_run_ui5_linter` on the app folder (without the MCP server:
`cd <app-folder> && npm exec --no -- ui5lint`). **TypeScript modules** (`webapp/Component.ts`) also:
`cd <app-folder> && npm exec --no -- tsc --noEmit` — the same type check `npm run build` runs first
(`prebuild` → `ts-typecheck`), so a type error passes `cds watch` but stops `mbt build`.

**Pass:** No ui5lint ERRORS (exit 0; warnings noted, not blocking) and, for TypeScript, `tsc` exit 0.

**Fail action:** Re-spawn `fiori-code-builder` with the linter / `tsc` output. The usual `tsc` causes are in
`fiori-freestyle` → P8: a handler typed as `Event` from `sap/ui/base/Event` (use the typed event of the control,
e.g. `SearchField$SearchEvent`), or a generated test that still imports a removed `View1` controller.
`Cannot find module sap/...` in a CAP project = the app `tsconfig.json` misses the root `typeRoots` that
`scaffold-ui.mjs` adds (npm workspaces install the types in the root `node_modules`).

---

### 26. No Deprecated `synchronizationMode` in OData V4 Model Settings

**Why:** `"synchronizationMode"` was removed from the OData V4 model in UI5 1.110+. Any occurrence causes the UI5 linter to emit a deprecation error. It has no effect even in older versions and must never appear in generated manifests.

**Pattern:**

```bash
grep -rn "synchronizationMode" app/*/webapp/manifest.json
```

**Pass:** No results.

**Fail condition:** Any `manifest.json` contains the string `synchronizationMode`.

**Auto-fix (no user prompt):** Delete the `"synchronizationMode"` key and its value from the OData model `settings` block in `manifest.json`. Do not change any surrounding settings.

---

### 27. Auth Annotations Present on Every Service and Entity

**Pattern:** Grep `srv/` for any `service ` declaration missing `@(requires:` and any `entity ` projection missing `@(restrict:`.

```
# Services must have @requires
grep -rn "^service " srv/ | grep -v "@(requires:"

# Entity projections must have @restrict (writable ones)
grep -rn "as projection on" srv/ | grep -v "@(restrict:"
```

**Pass:** No results from either grep (every service and writable entity is annotated).

**Fail action:** Re-spawn `cap-code-builder` listing the missing annotations.

---

### 28. No `console.log` in Production Source

**Pattern:** Grep `srv/` for `console.log`.

```
grep -rn "console\.log" srv/
```

**Pass:** No results.

**Fail action:** Re-spawn `cap-code-builder` to replace with `cds.log()`.

---

### 29. No Hardcoded URLs or Secrets

**Pattern:** Grep source files for common patterns.

```
grep -rn "http://" srv/ app/
grep -rn "https://" srv/ app/ --include="*.js" --include="*.ts" --include="*.cds"
grep -rn -i "password\|secret\|apikey\|api_key\|token" srv/ app/ --include="*.js" --include="*.ts"
```

**Pass:** No results that are actual credentials (ignore comments and documentation strings).

**Fail action:** Re-spawn the relevant developer to move values to environment variables or the Destination service.

---

### 30. CSV Seed Data — Valid UUIDs

**Pattern:** Grep `db/data/` for any ID column value that is NOT UUID format.

```
grep -rn "^[^,]*," db/data/ | grep -v "[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}"
```

Check all `ID` and `*_ID` (foreign key) columns contain valid UUID strings — not short strings like `01`, `lv-01`, `cat-01`. See `cap-schema` for the readable UUID pattern.

**Pass:** All ID values match UUID format.

**Fail action:** Re-spawn `cap-code-builder` to regenerate CSVs with valid UUID seed data.

---

### 31. Draft Configuration *(if any FE create/edit flow exists)*

**Pattern:** For every entity exposed in a Fiori Elements app that has create or edit navigation, confirm `@odata.draft.enabled` is present on the service projection.

```
grep -rn "odata.draft.enabled" srv/
```

**Pass:** Present on every entity that feeds a Fiori Elements object page with edit capability.

**Fail action:** Re-spawn `cap-code-builder` to add the annotation; re-spawn `fiori-code-builder` if the manifest navigation also needs updating.

---

### 32. Value Help Completeness *(if any field has a constrained vocabulary)*

**When to run:** Any time the Requirement Register lists a plant/material/cost-centre/status search
help, OR the view XML contains `showValueHelp="true"` on any input.

**Pattern:** For every field with a value help:

1. Confirm a CAP function that returns the value list is declared in `srv/*.cds`:
   ```
   grep -rn "returns array of" srv/*.cds
   ```
2. Confirm a matching `srv.on` handler exists:
   ```
   grep -rn "srv.on\|this.on" srv/*.js
   ```
3. Confirm `valueHelpRequest` is wired in the view:
   ```
   grep -rn "valueHelpRequest" app/
   ```
4. Confirm a `SelectDialog` (or `ValueHelpDialog`) is created in the controller:
   ```
   grep -rn "SelectDialog\|ValueHelpDialog" app/
   ```

**Pass:** All four grep patterns return results for every value-help field.

**Fail action:** Re-spawn `cap-code-builder` to add the missing CAP function + handler; re-spawn
`fiori-code-builder` to add the missing view wiring + controller dialog. See
`fiori-freestyle/references/value-help-select-dialog.md` for the complete pattern.

---

### 33. i18n `supportedLocales` Includes `"en"`

**Why:** When `fallbackLocale` is `""` (the root bundle, used as default English), UI5 still
internally enumerates `"en"` as a locale candidate during startup. If `"en"` is not listed in
`supportedLocales`, UI5 logs `"The fallback locale 'en' is not contained in the list of
supported locales"` on every page load, which appears in browser console output and can mask
real errors.

**Pattern:**

```bash
# Locate both i18n blocks in every manifest.json (arrays may span several lines)
grep -n -A4 '"supportedLocales"\|"fallbackLocale"' app/*/webapp/manifest.json
```

Read each manifest at those lines and record `sap.app.i18n.supportedLocales` and
`sap.ui5.models.i18n.settings.supportedLocales` (a missing array counts as `[]`).

**Pass:** Both `supportedLocales` arrays include `"en"`.

**Fail condition:** Either array is missing `"en"` while `fallbackLocale` is `""`.

**Auto-fix (no user prompt):** Insert `"en"` into both `supportedLocales` arrays in
`manifest.json` — add it as the second element after `""`:
`["", "en", ...]`.

---

### 34. Value Help `CollectionPath` Entities Are Inside the Service Block

**Why:** `@Common.ValueList CollectionPath` tells Fiori Elements which OData entity set to call
for the dropdown data (e.g. `GET /odata/v4/leavers/EmployeeTypes`). CAP only exposes entity
projections as OData entity sets when they are declared **inside** a `service { }` block.
A projection defined at the top level of a `.cds` file is valid CDS syntax (it can be used for
reuse or `extend`) but it is never mounted as an OData endpoint — the GET returns
`404 Invalid resource path` and the dropdown stays empty with no visible browser error.

**Pattern:**

```bash
# 1. Collect every CollectionPath value from annotations.cds
COLLECTION_PATHS=$(grep -h "CollectionPath:" app/*/annotations.cds \
  | grep -oP "(?<=CollectionPath: ')[^']+(?=')" \
  | sort -u)

# 2. For each, verify the entity name appears INSIDE the service block in srv/service.cds
#    (i.e. between "service X {" and the matching closing "}")
#    A simple but reliable heuristic: entity must appear before the first top-level "}" line
for NAME in $COLLECTION_PATHS; do
  echo "== $NAME"
  grep -nE "^\s*service\s|^\}|entity\s+$NAME\b" srv/service.cds
done
```

Per name: the `entity <Name>` line number must lie between the `service … {` line and the first
top-level `}` line after it → report `OK: entity <Name> is inside the service block`; an
`entity <Name>` line after that `}`, or no such line at all → report
`FAIL: entity <Name> is NOT inside the service block — value help will 404`.

**Pass:** Every entity name that appears as a `CollectionPath` in any `annotations.cds` file is
also declared (as a `entity <Name>`) inside the `service { }` block of `srv/service.cds`.

**Fail condition:** Any `CollectionPath` entity is missing from the service block — either it is
defined after the closing `}`, or it is not in the service at all.

**Auto-fix (no user prompt):**

1. Read `srv/service.cds`. Find the closing `}` of the service block.
2. For each missing entity, check if it exists as a top-level projection after the `}`.
   - **If it does:** Move it (cut + paste) to just before the closing `}` of the service block.
   - **If it doesn't exist at all:** Add `  @readonly entity <Name> as projection on db.<Name>;`
     before the closing `}` and re-spawn `cap-code-builder` to confirm the `db.<Name>` entity
     exists in `db/schema.cds`.
3. After the fix, re-run the static checks and runtime check 1 to confirm the service still compiles.

---

### 35. FPM Wiring (run ONLY when a routing target has `"name": "sap.fe.core.fpm"`)

Skip this check entirely (`N/A`) when no manifest routing target has `"name": "sap.fe.core.fpm"`.
It has seven items; report the check as one row and name the failing item(s).

**Item 1.** `Component.js` extends `sap/fe/core/AppComponent` (NOT `sap/ui/core/UIComponent`).

```bash
grep -rn "sap/ui/core/UIComponent" app/*/webapp/Component.js
```

**Pass:** No results. **Auto-fix:** Replace the import and base class with `sap/fe/core/AppComponent`.

**Fail action:** Re-spawn `fiori-code-builder` with the finding.

**Item 2.** The FPM page controller extends `sap/fe/core/PageController`.

```bash
grep -rn "sap/fe/core/PageController" app/*/webapp/ext/
```

**Pass:** At least one result matching the FPM target's `viewName` controller path.

**Fail action:** Re-spawn `fiori-code-builder` to fix the controller base class.

**Item 3.** `sap.ui5.flexEnabled === true` in `manifest.json`.

```bash
grep -n '"flexEnabled"' app/*/webapp/manifest.json
```

**Pass:** `"flexEnabled": true` inside the `sap.ui5` block (Read the file to confirm the block). **Auto-fix (no user prompt):** Set `"flexEnabled": true` in the `sap.ui5` block of `manifest.json`.

**Item 4.** The FPM routing target has `name === "sap.fe.core.fpm"` AND `options.settings.viewName`.

```bash
# Locate every FPM routing target
grep -n '"sap.fe.core.fpm"' app/*/webapp/manifest.json
```

Read each target found (the object under `sap.ui5.routing.targets.<k>` whose `name` is
`sap.fe.core.fpm`) and confirm it has `options.settings.viewName`; a target without it →
report `FAIL target <k> missing viewName`.

**Pass:** No `FAIL` line. **Fail action:** Re-spawn `fiori-code-builder` to add `viewName` to the FPM target settings.

**Item 5.** `sap.fe.core` AND `sap.fe.macros` are both in `sap.ui5.dependencies.libs`.

```bash
# Exact library keys (the closing quote excludes "sap.fe.core.fpm")
grep -nE '"sap\.fe\.(core|macros)"' app/*/webapp/manifest.json
```

Both keys must appear inside `sap.ui5.dependencies.libs` (Read the block to confirm). Missing
`sap.fe.core` → `FAIL: sap.fe.core missing from dependencies.libs`; missing `sap.fe.macros` →
`FAIL: sap.fe.macros missing from dependencies.libs`.

**Pass:** No `FAIL` line. **Auto-fix (no user prompt):** Add the missing library entries to `sap.ui5.dependencies.libs` in `manifest.json`.

**Item 6.** The root FPM view declares `xmlns:macros="sap.fe.macros"` and its `controllerName` matches the FPM target's `viewName`.

```bash
grep -rn 'xmlns:macros="sap.fe.macros"' app/*/webapp/ext/
```

**Pass:** At least one result for each file referenced by a FPM target's `viewName`.

**Fail action:** Re-spawn `fiori-code-builder` to add the namespace declaration to the view root element.

**Item 7 (CAP-embedded only).** `dataSources.mainService` has no `localUri` and no `annotations`
array entry. That the module's `annotations.cds` is actually loaded is static check 21, and that
every `metaPath` the view uses exists is static check 22.

```bash
# Check for incorrect localUri / annotations array in manifest — Read the hits: only entries
# inside sap.app.dataSources.mainService.settings count
#   localUri there              → FAIL: localUri present in mainService — CAP-embedded must not have it
#   non-empty annotations there → FAIL: annotations array present in mainService — CAP-embedded must not have it
grep -n '"localUri"\|"annotations"' app/*/webapp/manifest.json
```

**Pass:** No `localUri`, no `annotations` array.

**Auto-fix (no user prompt):** remove `localUri` and `annotations` from
`dataSources.mainService.settings` in `manifest.json` — CAP serves annotations from CDS; a local
file is not needed and causes a 404 in `cds watch`. If static check 21 fails, add
`using from './<module>/annotations';` to `app/services.cds` — without it CAP does not load
`app/<module>/annotations.cds` and every FPM building block renders with no columns, filters or
charts.

---

## Runtime checks 1–10 — `scripts/smoke-check.mjs --render` (MANDATORY)

**When to run:** always, for every app, after static checks 1–35 pass. The script picks its mode
itself: **CAP mode** for CAP projects (`cds serve` with the local cds-dk) and **UI mode** for
standalone UI5 / Fiori apps (`freestyle-ui5`, `external-fe`: the local `fiori run` with
`ui5-mock.yaml`, else `ui5-local.yaml`, else `ui5.yaml` — the offline mock answers the OData calls;
absolute external URLs are reported SKIP, never contacted). Pass the project root (`<cap-root>` or
the standalone app root).  
**Self-healing mandate:** Do NOT report and wait. For every `FAIL` row, apply the auto-fix defined
below for that runtime check, then re-run the script. Only escalate to `AskUserQuestion` if an
auto-fix requires a decision the developer must make (e.g. a port held by a non-node process).
Maximum 3 auto-fix attempts per runtime check before escalating.

**Pattern** — ONE command, from the workspace root (the folder that contains `.claude/`). It
replaces every hand-run step (port pre-flight, background server start, log polling, HTTP probes,
killing the port, log clean-up, browser start):

```bash
node .claude/skills/application-sanity-check/scripts/smoke-check.mjs <cap-root> --render
# if the shell may be elsewhere:
cd "<workspace root>" && node .claude/skills/application-sanity-check/scripts/smoke-check.mjs <cap-root> --render
```

Options: `--entity <Name>` (main entity set, when no Fiori Elements route names one) ·
`--port <N>` (first port to try, default 4004 in CAP mode, 8080 in UI mode) · `--route "#/<hash>"`
(an extra screen for the browser checks, repeatable — e.g. a freestyle route) · `--timeout <s>`
(startup wait, default 420).

The browser checks open the start page **and every other Fiori Elements list page of the manifest**
(`"Departments:?query:"` → `#/Departments`), each with its first row's detail page: one set of rows 5–10
per page, labelled `(start page)`, `(#/Departments)` … — STEP 8.2 uses them as the evidence per screen.

What the script does — so you never re-implement it by hand:

- Starts the project's **own** CAP server through the local `@sap/cds-dk` (`cds serve all
  --with-mocks --in-memory?` — what `npm run watch` runs, without file watching or `--open`), with
  cwd = the CAP root. That is the same single `@sap/cds` resolution root as `npm run watch`
  (`CLAUDE.md` hard rule 5); nothing is downloaded, no global `cds` is used.
- Picks a **free port** itself, starting at `--port`. It never stops another process, so a busy
  4004 is not a failure.
- Waits for `server listening`, not for the first `[cds]` line — `loaded model …` is printed long
  before the port is bound (measured: first `[cds]` line at 223 s, `server listening` at 291 s on a
  cold Windows machine).
- Derives the OData paths from `cds compile srv --to serviceinfo` — never by hand. CAP strips the
  `Service` suffix and **kebab-cases** the rest (`PurchaseOrderService` → `/odata/v4/purchase-order/`,
  not `/odata/v4/purchaseorder/`), honours `@path`, and services may live in any `srv/*.cds` file.
- With `--render`, runs `ui-render-check.mjs` in headless Chrome/Edge against every served UI and
  merges its rows into the same table.
- Always stops the server, writes its log to the path printed in the `Summary:` line, and prints
  one fixed table, always in number order:

| # | Check |
|---|---|
| 1 | Server starts (READY) and the startup log has no fatal error — this also proves the CDS model compiles |
| 2 | Every OData service answers `$metadata` with 200 (one row per service) |
| 3 | The main entity set returns 200 (`--entity`, else the `contextPath`/`entitySet` of the Fiori Elements route, else the first entity set) |
| 4 | Every UI module is served — CAP: `/<ui5.yaml metadata.name>/index.html` (`cds-plugin-ui5`); UI mode: `/index.html` (else `/test/flp.html`) |
| 5 | UI5 core loaded in the browser |
| 6 | A view/page rendered |
| 7 | No fatal console errors / uncaught exceptions (known local-dev noise filtered; non-fatal framework error logs = WARN) |
| 8 | No failed requests (>= 400) |
| 9 | The first list row opens its detail page without new errors |
| 10 | Save: an empty PATCH on the first row is accepted (UPDATE validators do not reject partial saves; draft-enabled entities SKIP) |

Every number always appears: the server did not start → 2–10 `SKIP`; no `--render` → 5–10 `SKIP`;
no Chrome/Edge (set `CHROME_PATH`) → 5–10 `SKIP` "the UI was NOT verified in a browser".

**Rules:** paste the table and the `Summary:` line **verbatim** into the STEP 8 report. Never
renumber, re-word or skip a row, and never mark a row PASS that the script did not print as PASS.
Exit `0` = no FAIL · `1` = at least one FAIL · `2` = setup error (`@sap/cds-dk` not installed in
`<cap-root>` → `npm install` there, re-run).

**Auto-fix table — keyed by the runtime check that FAILs; apply the fix, then re-run `smoke-check.mjs`:**

| Runtime check · what the detail says | Diagnosis | Auto-fix (no user prompt) |
|---|---|---|
| 1 · `@sap/cds was loaded from different locations` | Resolution-context fault, **not** a version fault | Re-run static checks 1–5 and apply their fix table. Most often: delete `gen/` with `node .claude/skills/sap-conventions/scripts/stack.mjs clean <app>`, add a plain `"watch": "cds watch"` script, add `@sap/cds-dk` to `devDependencies`, remove `server.exit_on_multi_install`. Do **not** pin `cds-plugin-ui5` to `0.13.6`; it declares `@sap/cds` as a peerDependency only and cannot cause this |
| 1 · `Cannot find module 'cds-plugin-ui5'` | UI plugin missing | Run `npm install cds-plugin-ui5@^0.17.0 --save-dev` in `<app>/` |
| 1 · `Cannot find module '@sap/cds'` (or another declared dependency) | Dependencies not installed | Run `npm install` in `<app>/` |
| 1 · `Failed loading service implementation from ./srv/service` | Handler does not load | Read `srv/service.js` and the error lines in the server log (path printed in the `Summary:` line); re-spawn `cap-code-builder` with the exact error line |
| 1 · `Failed loading service implementation from @cap-js/sqlite` | DB driver does not match the CDS major | Run `node .claude/skills/sap-conventions/scripts/stack.mjs apply <app> --scope cap` (sets `@cap-js/sqlite` to the driver matching `stack.json` `cap.cdsMajor`); run `npm install` |
| 1 · `No service definition found for` | Service definition not found | Verify `srv/service.cds` exists and the `using` import path is correct |
| 1 · `UNIQUE constraint failed` during `init from db/data/*.csv` (the log lists a CSV twice) | The server was started from a path whose drive-letter case differs from the stored one (`c:\…` vs `C:\…`): CAP compares paths as strings and imports every seed file twice | `smoke-check.mjs` already starts CAP from the exact path, so this appears only in a manual run — `cd` into the project with the exact spelling (`C:\…`) and start again. If the log lists each CSV only once, the CSV itself has duplicate keys: fix the seed data |
| 1 · a CDS compile error | Model does not compile | Run the CDS build diagnostic (below) and re-spawn `cap-code-builder` with its error output |
| 1 · `EADDRINUSE` | A leftover dev server from an earlier run grabbed the chosen port | Run `node .claude/skills/application-sanity-check/scripts/free-port.mjs <port>` (stops it only if it is a node process), re-run. Exit `1` = held by a non-node process → `AskUserQuestion` |
| 1 · `not listening after …s` (TIMEOUT) | Slow machine — not a code fault | Report the last 30 lines of the server log to the developer; do **not** restart blindly |
| 2 · `→ 401` | Dev auth is not `dummy`, or auth required in a no-auth build | Apply the fix of static check 10; for a no-auth build check `srv/service.cds` for a stray `@requires` and re-spawn `cap-code-builder` to remove it |
| 2 · `→ 404` | Wrong service path | The path comes from the compiler — check `@path` on the service (`cd <cap-root> && npm exec --no -- cds compile srv --to serviceinfo`) and that the service is actually served; align the manifest with static check 12 |
| 2 · `returned no OData service` | Model does not compile | Run the CDS build diagnostic (below) and re-spawn `cap-code-builder` with its error output |
| 2 / 3 · `→ 500` | Handler crash | Read the stack trace in the server log (path printed in the `Summary:` line); re-spawn `cap-code-builder` with it |
| 3 · `→ 404` | Entity name is case-sensitive | Match exactly what appears in `srv/service.cds`; re-run with `--entity <ExactName>` if the manifest route names another set |
| 3 · `→ 400` | Broken `$select`/`$expand` from `autoExpandSelect` | Check whether a `virtual` field is in the model and remove the `virtual` keyword (`virtual` fields are excluded from `$select`) |
| 4 · `not 200` | `cds-plugin-ui5` not serving the app | 1. Confirm `cds-plugin-ui5` is in root `devDependencies`. 2. Confirm the root `package.json` `workspaces` / `"sapux": ["app/<appname>"]` entry lists the app — add if missing; the folder name must match exactly. 3. Confirm `app/<appname>/package.json` exists with `"main": "webapp/index.html"` and `app/<appname>/ui5.yaml` has `metadata.name`. 4. Run `npm install` and re-run |
| 5 · `sap-ui-core.js never ran` | Bootstrap does not load | Static check 18 (CDN version) and static check 7 (TypeScript transpile middleware); the failed request in row 8 names the file |
| 6 · `nothing rendered — blank page` | Component or `$metadata` fails | Read rows 7 and 8: `Component.js` 404 → static checks 11 and 7; `$metadata` 401 → static check 10; 404 → static check 12 |
| 7 · `TypeError` / `Cannot read propert…` in an `sap.fe.macros` building block | An annotation the page uses is missing | Static checks 20–22; then re-spawn `fiori-code-builder` with the error line |
| 7 · `is not a valid … content` | Invalid Form content | Static check 19 |
| 7 · other fatal error | UI code fault | Re-spawn `fiori-code-builder` with the exact error line |
| 8 · `401` / `404` on `$metadata` | Auth or service path | Static checks 10 / 12 |
| 8 · `404` on a value-help entity set | Entity outside the service block | Static check 34 |
| 9 · `FAIL` | The detail page crashes | Fix the error printed in the detail (often static check 19); re-spawn `fiori-code-builder` with it |
| 10 · `FAIL` | An UPDATE validator requires fields a PATCH does not carry — every Save fails | Re-spawn `cap-code-builder`: check required fields only on CREATE, or on UPDATE only when present |

**Pass definition:** every row PASS, except that `SKIP` is acceptable for row 9 (rows are not
navigable), row 10 (draft-enabled entity, or no bound row) and rows 4–10 of a project with no UI
module. Rows 5–10 `SKIP` because there is no Chrome/Edge are reported as "UI not verified in a
browser", never as PASS. WARN rows must be fixed or justified in the TDD.  
**Auto-fix loop:** for any FAIL row, apply the fix for that row, re-run `smoke-check.mjs`, and mark
pass/fail. After 3 consecutive auto-fix attempts on the same runtime check without resolution,
escalate with `AskUserQuestion` showing the exact log excerpt (from the server log path printed in
the `Summary:` line).  
**Do not proceed to STEP 8.2 with any runtime check still failing.**

### Diagnostic — CDS compile (only when runtime check 1 or 2 points to the model)

**Command:** `cd <cap-root> && npm exec --no -- cds compile srv --to edmx -o .intent2code/edmx` — prints the
compiler errors and warnings in seconds, writes no `gen/`. The server start of runtime check 1 already proves the
model compiles, so run this only to get the compiler output. (`cds build --production` belongs to `mbt build` and
`/deploy`, not to `/intent`.)

**Fail action:** re-spawn `cap-code-builder` with the exact error output.

### Browser part alone — `scripts/ui-render-check.mjs`

`smoke-check.mjs --render` runs it for you. To re-check only the browser part against a dev server
that is already running on localhost (the script refuses any non-local URL):

```bash
node .claude/skills/application-sanity-check/scripts/ui-render-check.mjs http://localhost:<port>/<ui5.yaml metadata.name>/index.html
```

It prints "Runtime checks 5–10 (browser)" with the same numbers and titles. `--json` prints the rows
as JSON (this is how `smoke-check.mjs` merges them).

---

## Sanity Check Result

Report the two script tables verbatim, plus one row per agent check:

| Check | Result | Action taken |
| --- | --- | --- |
| Static checks 1–22 — `ui-health-checks.mjs` table pasted verbatim | exit 0 / exit 1 | — / fixes applied per "Fixes:" line |
| Static 23 · Manifest validation | ✅ / ❌ | |
| Static 24 · Manifest v2 routing keys (targets `name`/`id`/`level`, `config.path`) | ✅ / ❌ / N/A | — / renamed v1 `view*` keys |
| Static 25 · UI5 lint | ✅ / ❌ | |
| Static 26 · No deprecated `synchronizationMode` | ✅ / ❌ | |
| Static 27 · Auth annotations | ✅ / ❌ | |
| Static 28 · No console.log | ✅ / ❌ | |
| Static 29 · No hardcoded secrets | ✅ / ❌ | |
| Static 30 · CSV UUID validity | ✅ / ❌ | |
| Static 31 · Draft configuration | ✅ / N/A | |
| Static 32 · Value help completeness | ✅ / N/A | |
| Static 33 · i18n `supportedLocales` includes `"en"` | ✅ / ❌ | |
| Static 34 · `CollectionPath` entities declared inside the service block | ✅ / N/A | |
| Static 35 · FPM wiring (items 1–7) | ✅ / ❌ / N/A | |
| Runtime checks 1–10 — `smoke-check.mjs --render` table pasted verbatim | exit 0 / exit 1 | — / auto-fix applied per failing row |

**All checks must pass before proceeding to STEP 8.2 (coverage verification) and STEP 9 (review).**

---

## Numbers used before version 1.10

Older reports, TDDs and notes use these IDs. Read them with this table; never use them in a new
report.

| Before 1.10 | Now |
|---|---|
| check 0 · UI-0 (A/B, C, D, E, F) | static checks 1, 2, 3, 4, 5 |
| check 1 (CDS build) | runtime check 1 (the server start compiles the model) + the CDS build diagnostic |
| check 2 · UI-14 | static check 11 |
| checks 3, 3a, 4, 4a | static checks 23, 24, 25, 26 |
| checks 5, 6, 7, 8, 9, 10 | static checks 27, 28, 29, 30, 31, 32 |
| check 11 · S-1, S-2, S-3, S-4 | runtime checks 1, 2, 3, 4 |
| S-5 · R-1 … R-6 | runtime checks 5 … 10 |
| check 12 · UI-1 | static check 10 |
| check 13 · UI-11 | static check 9 |
| check 14 · UI-2 | static check 12 |
| checks 15, 16 | static checks 33, 34 |
| check 17 · UI-3 | static check 13 |
| checks 18–20 (F1–F7) | static check 35, items 1–7 |
| check 21 · UI-4 | static check 14 |
| UI-5, UI-6, UI-7 | static checks 15, 16, 17 |
| UI-8, UI-9, UI-10 | static checks 7, 18, 19 |
| UI-12, UI-13 | static checks 8, 6 |
| — | static checks 20, 21, 22 (new) |
| Gate 1 · UI health gate | static checks |
| Gate 2 · smoke check | runtime checks |
| STEP 8.3 (coverage verification) | STEP 8.2 |
