# Bootstrapping — Working Configs per App Type

Exact, runnable configs for each Intent2Code app type, adapted from the real reference apps in this
workspace (`project1` — freestyle UI5 TypeScript; `purchaseOrder` — CAP + Fiori Elements).
**CAP layer:** scaffold with `cds init <app> --add nodejs,sqlite,hana` (primary — see §A); fall back
to `mcp__intent2code__scaffold_app` (copies a starter from `reference-apps/`) only if the CDS CLI is
unavailable. **UI layer:** scaffold with the Fiori (Yeoman) generator, unchanged. After any scaffold
run `validate_namespace` and `run_checks`. Versions: `@sap/cds ^9`, `@cap-js/sqlite ^2`,
`@cap-js/hana ^2`, `@ui5/cli ^4.0.33`, `cds-plugin-ui5 ^0.17.0`,
`@sap-ux/ui5-middleware-fe-mockserver 2`, OData V4, theme `sap_horizon`.

> **UI5 version — always resolve dynamically.** Call `mcp__intent2code__ui5_get_version_info` at the
> start of every UI build session and store the result as `{RECOMMENDED_UI5_VERSION}`. Replace every
> occurrence of `{RECOMMENDED_UI5_VERSION}` in `manifest.json` (`minUI5Version`) and `index.html`
> (CDN `src` URL) with the resolved value. Reference apps in `reference-apps/` contain a static
> baseline version as a placeholder — it is **always overwritten** at scaffold time. Never ship a
> generated app with the baseline version unchanged.

## The namespace 4-place rule (applies to every app type)

Identical namespace in: `Component.(js|ts)` (`extend`/`@namespace`), `manifest.json` `sap.app.id`,
`index.html` resource-roots, and `ui5.yaml` `metadata.name` (**all lowercase**). Mismatch →
`failed to load Component.js`. Run `validate_namespace` after scaffold and after any edit to these.

---

## Known Bootstrap Pitfalls

These issues cause a blank page or `FUTURE FATAL` error with no obvious stack trace. Check each
one before debugging anything else.

### P-01 · Manifest v2 routing targets use deprecated `viewName`

**Symptom:** `[FUTURE FATAL] sap.ui5/routing/targets/viewName is deprecated and not supported with
manifest version 2. Use the option 'name' instead` — component fails to load, page is blank.

**Cause:** When `_version` is set to `"2.0.0"` in `manifest.json`, all routing target properties
were renamed. Using the old v1 names causes the Router to throw a fatal error during init.

**Fix — rename every routing target property:**

| Manifest v1 (deprecated in v2) | Manifest v2 (required) |
| --- | --- |
| `viewName` | `name` |
| `viewId` | `id` |
| `viewLevel` | `level` |
| `viewType` (on a target) | **Not a rename — move it.** Delete from the target; declare the view technology once in `routing.config.viewType`. On a v2 target `type` means `"View"｜"Component"`, so renaming `viewType: "XML"` → `type: "XML"` yields an invalid target type and clobbers a real `type` if one is present. |
| `routing.config.viewPath` | `routing.config.path` |

**Three `view*` sites are still valid under v2 — never "migrate" these:**

| Location | Why it stays |
| --- | --- |
| `routing.config.viewType` | **Required.** The Router cannot infer the view technology from a target's `"type": "View"`. Confirmed on UI5 1.152 + `_version` 2.0.0: produces no error. |
| `sap.ui5.rootView.viewName` | Unchanged in v2. Also the input to `ui5_run_manifest_validation`'s `namespace_mismatch` rule. |
| `routing.targets.<X>.options.settings.viewName` | A `sap.fe.core.fpm` **component setting**, not a routing-target property. `application-sanity-check` 19b/F4 **fails when it is absent**. |

```jsonc
// ❌ Breaks with _version 2.0.0
"routing": {
  "config": { "routerClass": "sap.m.routing.Router" },
  "targets": {
    "Main": { "viewName": "com.myapp.view.Main", "viewId": "Main", "viewLevel": 1 }
  }
}

// ✅ Correct for _version 2.0.0
// viewType MUST be in routing.config (global default) — the router cannot infer
// the view technology (XML/JS/HTML) from the target "type": "View" alone.
"routing": {
  "config": { "routerClass": "sap.m.routing.Router", "viewType": "XML" },
  "targets": {
    "Main": { "name": "com.myapp.view.Main", "id": "Main", "level": 1, "type": "View" }
  }
}
```

> **Rule:** The trigger is **`_version` ≥ 2.0.0 and nothing else.** Any time you set
> `"_version": "2.0.0"`, audit ALL routing targets in the same edit and replace every `view*`
> property with its v2 equivalent per the tables above.
> Also add `"viewType": "XML"` to `routing.config` — without it the router throws
> `No view type specified` even when `"type": "View"` is set on the target.
>
> **Do NOT key this off `minUI5Version`.** A `_version` `1.x` manifest is correct as authored no
> matter how new the UI5 runtime is — several apps in this workspace run `minUI5Version 1.151.0`
> with `_version 1.86.0` and `routing.config.viewPath`, and flagging them would be a false
> positive.
>
> **Which checks actually catch this:** `application-sanity-check` **static check 24** (self-healing,
> runs before any server start) and `ui5_run_manifest_validation`'s
> `manifest_v2_target_view_key` / `manifest_v2_config_viewPath` rules (error severity → hard-fails
> static check 23). **`ui5lint` does NOT flag these** — it returned 0 errors and 0 warnings on a manifest
> that crashed at runtime with the exact `FUTURE FATAL` above. Do not rely on it for this class of
> defect.

---

### P-02 · `@cap-js/sqlite` version mismatch with CDS 9

**Symptom:** `Failed loading service implementation from @cap-js/sqlite` on `cds watch` start.

**Cause:** `@cap-js/sqlite@1.x` has peer `@sap/cds ">=7.6 <9"` — it does NOT support CDS 9.

**Fix:** Use `@cap-js/sqlite@^2.1.0` which has peer `@sap/cds ">=9"` (no upper bound) and
requires no extra dependencies (2.2.x+ requires `sql.js`).

```json
"dependencies": {
  "@sap/cds": "^9",
  "@cap-js/sqlite": "^2.1.0"
}
```

> **Rule:** Always pin `@cap-js/sqlite` to the same major generation as `@sap/cds`:
> CDS 7–8 → `^1`, CDS 9 → `^2.1.x`, CDS 10 → `^3`.

> **1.09+:** this mapping now lives in `stack.json` → `cap.compat` (one entry per CDS major). `stack.mjs apply`
> writes the matching driver ranges; never type them by hand.

---

### P-03 · Blank UI / 401 in local dev — the CANONICAL auth configuration

> **This block is the single source of truth for CAP auth configuration.** Every other skill,
> agent and template links here instead of carrying its own snippet — copies drifted into four
> different shapes, an agent blended two of them into a block CAP ignores, and the app rendered a
> blank page.

**Symptom:** the Fiori app loads to a blank page (or a List Report with no data), or every action
fails with 401/403. Headless browsers hang on the first `$metadata` call.

**Cause:** the *effective* dev auth is not `dummy`. With `mocked`/`basic`, the browser's OData XHR
gets `401` (+ `WWW-Authenticate: Basic`) and Fiori Elements never renders. The most common way to
get there without noticing: a misplaced block such as `{ "[development]": { "auth": … } }` at the
top level of `.cdsrc.json` (missing `requires`) — it contains the word "dummy" but CAP ignores it
and silently falls back to `mocked`.

**Canonical configuration — root `package.json`, nowhere else:**

```json
"cds": {
  "requires": {
    "[development]": { "auth": "dummy" },
    "[roles]": {
      "auth": {
        "kind": "mocked",
        "users": {
          "viewer": { "roles": ["Viewer"] },
          "editor": { "roles": ["Viewer", "Editor"] },
          "admin":  { "roles": ["Viewer", "Editor", "Admin"] }
        }
      }
    },
    "[production]": { "auth": "xsuaa" }
  }
}
```

| Command | Effective auth | Use for |
|---|---|---|
| `npm run watch` | `dummy` — every request is a privileged user, no login | UI development (the default) |
| `npm run watch -- --profile roles` | `mocked` — Basic auth `viewer:` / `editor:` / `admin:` (empty password) | manual role tests (403 checks, `test.http`) |
| deployed to BTP | `xsuaa` | production |

- `[roles]` user names and role arrays must mirror the `xs-security.json` role-templates and the
  `@restrict` grant matrix (replace the three example users accordingly).
- **No auth anywhere else:** not in `.cdsrc.json`, not as `cds.requires.auth.[development]`, not
  as a top-level `[development]` key. Two sources = drift.
- Jest/`cds.test` role tests set their own users (see `sap-unit-testing`) — they don't need `[roles]`.

**Verify (never grep the files — ask CAP):**

```bash
cd <cap-root> && npm exec --no -- cds env requires.auth.kind --profile development   # → dummy
cd <cap-root> && npm exec --no -- cds env requires.auth.kind --profile roles         # → mocked
cd <cap-root> && npm exec --no -- cds env requires.auth.kind --profile production    # → xsuaa
```

These are part of the deterministic static checks (`application-sanity-check/scripts/ui-health-checks.mjs`, static check 10).

> **Rule:** `[development]` is always `dummy`. `mocked` exists only in the opt-in `[roles]`
> profile. Never add `login_required`/`basic` workarounds for local dev.

---

### P-04 · `@sap/cds` loaded from two locations (dual-load conflict)

**Symptom:**
```
ERROR: @sap/cds was loaded from different locations:
  ~/projects/<workspace>/<project>/node_modules/@sap/cds                     (10.0.6)
  ~/.node_modules_global/lib/node_modules/@sap/cds-dk/node_modules/@sap/cds  (10.0.5)
Ensure a single install to avoid hard-to-resolve errors.
```
`@sap/cds/lib/index.js` records every load root in `global.__cds_loaded_from`;
`@sap/cds/bin/serve.js:_check_setup()` prints this on `listening` and calls `process.exit(1)`
when the set has more than one entry.

**Cause — a resolution-context problem, not a dependency-version problem.**

`@sap/cds-dk` ships `@sap/cds` in **`bundleDependencies`**, so
`node_modules/@sap/cds-dk/node_modules/@sap/cds` exists in *every* correct install, local or
global. **That copy alone is harmless.** It becomes a dual-load only when cds-dk and your project
code resolve `@sap/cds` from **different roots**:

1. `cds-dk/lib/cds.js` picks its `@sap/cds` with
   `require.resolve('@sap/cds', { paths: [process.cwd(), __dirname] })` — "project-local
   preferred", falling back to its own bundled copy.
2. When `@sap/cds` is **not resolvable from the invocation cwd**, `cds-dk/bin/watch.js` sets
   `NODE_PATH` to the global cds-dk's own `node_modules` (and registers an ESM resolve hook).
   Every plugin that lives there — `@sap/cds-fiori`, `@sap/cds-mtxs`, and friends — then loads
   the **bundled** `@sap/cds`, while your `srv/*.js` loads the **project** copy. Two roots → the
   ERROR.
3. Two things make step 2 fire in practice: **(a)** running bare `cds watch`, so the **global**
   cds-dk binary is used, and **(b)** an invocation cwd that is not the project root — most often
   a `.vscode/tasks.json` `cds` task with no `options.cwd`, which inherits the multi-project
   workspace-root folder where no `@sap/cds` is installed. A stale `gen/` from a previous
   `cds build` adds a third root (`gen/srv/node_modules/@sap/cds`).

**Not the cause.** `cds-plugin-ui5` declares `@sap/cds` as a **peerDependency only**
(`>=6.8.2`) with no `dependencies` entry, and `@sap/ux-ui5-tooling` declares no `@sap/cds` at all
— verified on `cds-plugin-ui5@0.17.4` / `@sap/ux-ui5-tooling@1.31.1` (historical fact). A peer dependency is never
installed as a nested copy, so neither package can introduce a second root at any version.
**Pinning `cds-plugin-ui5` to `0.13.6` does not fix this and never did.** Use `^0.17.0` (see the
`CLAUDE.md` stack defaults).

**Fix — make resolution deterministic (see `CLAUDE.md` hard rule 5):**

1. Root `package.json` — `@sap/cds` in `dependencies` and `@sap/cds-dk` in `devDependencies` at the
   `stack.json` ranges (**same major** — `stack.mjs apply` writes both), plus a plain script:
   ```json
   "scripts": { "start": "cds-serve", "watch": "cds watch" }
   ```
2. Run the project with **`npm run watch`**, never bare `cds watch`. `npm run` prepends
   `node_modules/.bin` to PATH and sets cwd to the package root, so `process.cwd()` and
   `__dirname` both land inside the project and the `NODE_PATH` fallback cannot fire.
3. `.vscode/tasks.json` — every `cds` task must set `"options": { "cwd": "${workspaceFolder}" }`
   (or `${workspaceFolder}/<project>` inside a parent workspace) and should invoke
   `npm run watch`.
4. Delete `gen/` before any dependency change with the guarded
   `node .claude/skills/sap-conventions/scripts/stack.mjs clean <cap-root>` (from the workspace
   root); keep `gen/` in `.gitignore`.
5. **Never** set `cds.server.exit_on_multi_install: false`. It silences `process.exit(1)` but not
   the message, and masks a real fault.
6. **Never** try `"overrides": { "@sap/cds": "…" }`. npm cannot rewrite a `bundleDependencies`
   payload — the override is a silent no-op.
7. The global `@sap/cds-dk` is a **scaffolding** tool (`cds init`, `cds add`) only. Never install
   `@sap/cds` globally as a top-level package.

**Diagnosing:** `npm ls @sap/cds --all` shows the bundled copy in every healthy project — its
presence proves nothing. List only the *real* duplicates instead:

```bash
find . -type d -path '*/@sap/cds' \
  -not -path './node_modules/@sap/cds' \
  -not -path '*/@sap/cds-dk/node_modules/@sap/cds'
```

Any output is a genuine second root. Empty output **plus** the ERROR still appearing means the
invocation context is wrong (steps 2–3), not the install. `application-sanity-check` **static checks 1–5**
automate all of this.

**Current stack (generated from `stack.json`):**

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

> **Rule:** When upgrading the CDS major, bump `@sap/cds` **and** `@sap/cds-dk` together, keep
> `@sap/cds-dk` local, delete `node_modules/` and `gen/`, reinstall, and verify with
> `npm run watch` — never bare `cds watch`.

---

## A. CAP service init

**Primary method — `cds init --add`.** Scaffold with the CDS CLI so dependency majors are matched to
the installed `@sap/cds-dk` automatically (no stale pins, no `@cap-js/sqlite` peer-dep conflict, no
unwanted `workspaces`):

```bash
cds init <app> --add nodejs,sqlite,hana   # db/ srv/ package.json with version-matched deps
cd <app>
# model + service + handlers + annotations
#   db/schema.cds  srv/service.cds  srv/service.js  srv/annotations.cds
cds watch --in-memory            # serves service + app same-origin at http://localhost:4004
cds compile '*' --to serviceinfo # list service URLs / entity sets
```

Root `package.json` after `cds init --add nodejs,sqlite,hana` + `stack.mjs apply` (the stack.json CDS major)
(verified against `empapp-poc`):

```json
{
  "name": "<app>", "version": "1.0.0", "type": "module", "private": true,
  "scripts": { "start": "cds-serve" },
  "dependencies": { "@sap/cds": "^9", "@cap-js/hana": "^2" },
  "devDependencies": { "@cap-js/sqlite": "^2" }
}
```

> `cds init` sets **`"type": "module"`** — write `srv/*.js` handlers as ESM
> (`export default (srv) => { … }`), not CommonJS (`module.exports = cds.service.impl(...)`).
> The global `@sap/cds-dk` is used **only** to run `cds init` / `cds add`. Immediately after
> `cds init`, run `stack.mjs apply` (adds `@sap/cds-dk` at the stack.json range) to `devDependencies` and a plain `"watch": "cds watch"`
> script, then run `npm install` — see `CLAUDE.md` hard rule 5 and pitfall **P-04**. Running the
> project through the global CLI is what produces the `@sap/cds` dual-load error.
> `cds-plugin-ui5` is added later by the Fiori UI generator, not by `cds init`.

> **Fallback only (last resort):** if the CDS CLI is unavailable, copy the matching starter from
> `reference-apps/` (`mcp__intent2code__scaffold_app`) and bump its dependency majors to match the
> installed CDS. This applies to the **CAP layer only** — the UI layer is always scaffolded by the
> Fiori (Yeoman) generator.

> If you hit `Cannot find module 'es-errors/type'` on Node 25, pin `express` to `4.18.3` and add
> `es-errors: ^1` to dependencies (see `Troubleshooting.md`).

---

## B. CAP + Fiori Elements (List Report + Object Page)

App lives under `app/<appname>/`, served by `cds watch` (cds-plugin-ui5) — **no proxy, same origin.**

**`app/<appname>/ui5.yaml` — minimal (no `framework`/`server` blocks):**

```yaml
specVersion: '4.0'
metadata:
  name: <appname>          # lowercase; e.g. purchaseorderlist
type: application
resources:
  configuration:
    paths:
      webapp: webapp
```

**`app/<appname>/package.json` — required for cds-plugin-ui5 discovery:**

```json
{
  "name": "<appname>", "version": "1.0.0", "main": "webapp/index.html",
  "scripts": { "start": "ui5 serve", "build": "ui5 build --clean-dest" },
  "devDependencies": { "@ui5/cli": "^4.0.33" }
}
```

**`webapp/manifest.json` — routing + data source (from `purchaseOrder`):**

```jsonc
"sap.app": {
  "id": "<ns>",
  "dataSources": {
    "mainService": { "uri": "/odata/v4/<service>/", "type": "OData",
      "settings": { "odataVersion": "4.0" } }
  }
},
"sap.ui5": {
  "models": {
    "": { "dataSource": "mainService", "type": "sap.ui.model.odata.v4.ODataModel",
      "settings": { "operationMode": "Server", "autoExpandSelect": true,
        "earlyRequests": true, "groupId": "$auto", "updateGroupId": "$auto" } },
    "i18n": { "type": "sap.ui.model.resource.ResourceModel",
      "settings": { "bundleName": "<ns>.i18n.i18n" } }
  },
  "routing": {
    "routes": [
      { "name": "EntityList",   "pattern": ":?query:",             "target": "EntityList" },
      { "name": "EntityDetail", "pattern": "Entity({key}):?query:", "target": "EntityDetail" }
    ],
    "targets": {
      "EntityList": { "type": "Component", "id": "EntityList", "name": "sap.fe.templates.ListReport",
        "options": { "settings": { "contextPath": "/Entity", "variantManagement": "Page",
          "initialLoad": "Enabled",
          "controlConfiguration": { "@com.sap.vocabularies.UI.v1.LineItem": {
            "tableSettings": { "type": "ResponsiveTable", "selectionMode": "Multi" } } },
          "navigation": { "Entity": { "detail": { "route": "EntityDetail" } } } } } },
      "EntityDetail": { "type": "Component", "id": "EntityDetail", "name": "sap.fe.templates.ObjectPage",
        "options": { "settings": { "contextPath": "/Entity", "editableHeaderContent": false } } }
    }
  },
  "dependencies": { "minUI5Version": "{RECOMMENDED_UI5_VERSION}", "libs": {
    "sap.ui.core": {}, "sap.m": {}, "sap.fe.core": {}, "sap.fe.templates": {},
    "sap.fe.macros": {}, "sap.uxap": {}, "sap.ui.layout": {} } }
}
```

`Component.js` extends `sap/fe/core/AppComponent`. Annotations go in `srv/annotations.cds`
(`contextPath` always, never `entitySet`). Run via `npm run watch-listreportapp`. See `reference-apps/cap-fullstack-listreport/`.

---

## C. Freestyle UI5 standalone (TypeScript)

Mirrors `project1`: `fiori-tools-proxy` (UI5 CDN + backend) + `ui5-tooling-transpile` for TS.

**`package.json` (from `project1`):**

```json
{
  "name": "<appname>", "version": "0.0.1", "main": "webapp/index.html",
  "scripts": {
    "start": "fiori run --open \"test/flp.html#app-preview\"",
    "start-mock": "fiori run --config ./ui5-mock.yaml --open \"test/flp.html#app-preview\"",
    "build": "ui5 build --config=ui5.yaml --clean-dest --dest dist",
    "lint": "eslint ./", "ts-typecheck": "tsc --noEmit", "prestart": "npm run ts-typecheck",
    "unit-test": "fiori run --config ./ui5-mock.yaml --open \"test/unit/unitTests.qunit.html\"",
    "int-test":  "fiori run --config ./ui5-mock.yaml --open \"test/integration/opaTests.qunit.html\""
  },
  "devDependencies": {
    "@ui5/cli": "^4.0.33", "@sap/ux-ui5-tooling": "1",
    "@sap-ux/eslint-plugin-fiori-tools": "^10.0.0", "eslint": "^10",
    "@sapui5/types": "~1.136.0", "ui5-tooling-transpile": "^3.10.0",
    "typescript": "^5.9.3", "@sap-ux/ui5-middleware-fe-mockserver": "2"
  }
}
```

**`ui5.yaml` (from `project1` — proxy UI5 from CDN + transpile TS):**

```yaml
specVersion: "4.0"
metadata:
  name: <appname>          # lowercase
type: application
server:
  customMiddleware:
    - name: fiori-tools-proxy
      afterMiddleware: compression
      configuration:
        ignoreCertErrors: false
        ui5:
          path: [/resources, /test-resources]
          url: https://ui5.sap.com
        backend:
          - path: /<servicePath>            # e.g. /V4 ; real backend URL or BAS destination
            url: https://<backend-host>
    - name: fiori-tools-appreload
      afterMiddleware: compression
      configuration: { port: 35729, path: webapp, delay: 300 }
    - name: fiori-tools-preview
      afterMiddleware: fiori-tools-appreload
      configuration: { flp: { theme: sap_horizon } }
    - name: ui5-tooling-transpile-middleware
      afterMiddleware: compression
      configuration:
        debug: true
        transformModulesToUI5: { overridesToOverride: true }
        excludePatterns: [/Component-preload.js]
builder:
  customTasks:
    - name: ui5-tooling-transpile-task
      afterTask: replaceVersion
      configuration:
        debug: true
        transformModulesToUI5: { overridesToOverride: true }
```

**`index.html` — ComponentSupport bootstrap (no inline init script; CSP-safe; the `<script>` goes
in `<head>`, the `<div>` in `<body>`):**

```html
<script id="sap-ui-bootstrap"
  src="resources/sap-ui-core.js"
  data-sap-ui-theme="sap_horizon"
  data-sap-ui-resource-roots='{"<ns>": "./"}'
  data-sap-ui-on-init="module:sap/ui/core/ComponentSupport"
  data-sap-ui-compat-version="edge" data-sap-ui-async="true"
  data-sap-ui-frame-options="trusted"></script>

<div data-sap-ui-component data-name="<ns>" data-id="container"
     data-settings='{"id": "<ns>"}' data-handle-validation="true"></div>
```

**`webapp/Component.ts` (from `project1`):**

```typescript
import BaseComponent from "sap/ui/core/UIComponent";
import { createDeviceModel } from "./model/models";

/** @namespace <ns> */
export default class Component extends BaseComponent {
  public static metadata = {
    manifest: "json",
    interfaces: ["sap.ui.core.IAsyncContentCreation"]
  };
  public init(): void {
    super.init();
    this.setModel(createDeviceModel(), "device");
    this.getRouter().initialize();
  }
}
```

Run: `npm run start-mock` (offline) or `npm start` (proxy to backend). See `reference-apps/freestyle-ui5-ts/`.

---

## D. Freestyle UI5 inside CAP

Same freestyle app placed under `<cap-root>/app/<appname>/`, served by `cds watch` (cds-plugin-ui5)
— **no `fiori-tools-proxy`, no `ui5-mock.yaml`**, because the CAP service is same-origin. Use the
**minimal `ui5.yaml`** and `package.json` from section B, but `Component` extends
`sap/ui/core/UIComponent` (freestyle) and you keep your own XML views/controllers. Run with
`cds watch --in-memory` from the CAP root. See `reference-apps/freestyle-in-cap/`.

---

## E. External-service-bound app (mock + proxy, both)

Bound to a RAP / existing OData service via its EDMX. **Policy: always generate both** an offline
mock and a real-backend proxy, and flip with npm scripts (exactly how `project1` does it).

1. **Manifest data source** points at the consumed service with a `localUri` for the mock:

```jsonc
"dataSources": {
  "mainService": { "uri": "/<servicePath>/", "type": "OData",
    "settings": { "localUri": "localService/mainService/metadata.xml", "odataVersion": "4.0" } } }
```

2. **Mock — `ui5-mock.yaml`** adds `sap-fe-mockserver` (from `project1`, on top of the section C middleware):

```yaml
    - name: sap-fe-mockserver
      beforeMiddleware: csp
      configuration:
        mountPath: /
        services:
          - urlPath: /<servicePath>
            metadataPath: ./webapp/localService/mainService/metadata.xml
            mockdataPath: ./webapp/localService/mainService/data
            generateMockData: true
        annotations: []
```

3. **Proxy — `ui5.yaml`** carries the `fiori-tools-proxy` `backend` block from section C
   (`path: /<servicePath>`, `url:` real host in VS Code, or `destination:` in BAS).

4. **Scripts:** `start:mock` → `--config ./ui5-mock.yaml`; `start:proxy` / `start` → `ui5.yaml`.

`mcp__intent2code__gen_mock_from_edmx` writes the metadata + sample data + `ui5-mock.yaml`;
`configure_service` writes the manifest data source + proxy/approuter/mta snippets. See
`reference-apps/fiori-elements-external-service/` and the `cap-integration` skill.

---

## Post-scaffold checklist

`validate_namespace` (4 places identical, lowercase `ui5.yaml` name) · `contextPath` not `entitySet`
· theme `sap_horizon` · V4 model settings · async routing + `IAsyncContentCreation` · i18n for all
labels · `npm install` · run (CAP `cds watch --in-memory`; freestyle/external `start-mock` /
`start`) · `run_checks` (CAP: `cds build`/`npm test`; UI5: `ui5lint`/tests/`tsc --noEmit`).
