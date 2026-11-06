---
name: fiori-freestyle
description: >
  Freestyle SAPUI5 (TypeScript or JavaScript) development for Intent2Code — hand-built MVC when
  Fiori Elements cannot express the UX. Covers Component + async routing, XML views/controllers,
  OData V4 model settings, i18n, and standalone vs in-CAP serving. Load when building a freestyle
  UI5 app or writing UI5 controllers/views. Keywords: freestyle, UI5, TypeScript, JavaScript, MVC,
  Router, navTo, XML view, controller, JSONModel, ODataModel v4, IAsyncContentCreation, sap.m.
---

# Freestyle UI5 (TypeScript or JavaScript)

Use only when a floorplan (Fiori Elements) cannot express the required UX (Gate C). The UI language
is the Gate C answer `uiLanguage`: **TypeScript** (`ts`, the default) or **JavaScript** (`js`).

**How the shell is created (same rule as Fiori Elements — generator first):**
- **Default:** the main thread scaffolds the app with `scaffold-ui.mjs --lang ts|js` — SAP Fiori
  generator floorplan `FF_SIMPLE` ("Basic"), `sapux: false`, `project.enableTypeScript` = `true` for
  `ts`, `false` for `js` — into `<app>/app/<module>/` (in CAP, served by `cds watch` via
  `cds-plugin-ui5`) or `<app>/` (standalone). The generator output is authoritative: build
  views/controllers on top of it and never overwrite `manifest.json`, `Component.ts` / `Component.js`,
  `index.html`, `ui5.yaml` or `package.json` whole.
- **Fallback only** (generator unavailable): `scaffold_app` (`cap-freestyle` / `freestyle-ui5`) or the
  matching `reference-apps/*.md`. The fallback starters are TypeScript; for a JavaScript app without
  the generator, return a blocking issue (the main thread asks whether TypeScript is acceptable).
- Never hand-roll the bootstrap files from memory.

## TypeScript vs JavaScript — what differs

| | TypeScript (`ts`) | JavaScript (`js`) |
|---|---|---|
| Files | `Component.ts`, `controller/*.controller.ts`, `model/*.ts`, `tsconfig.json` | `Component.js`, `controller/*.controller.js`, `model/*.js` — no `tsconfig.json` |
| Module style | ES `import` / `export default class … extends Controller` | `sap.ui.define([...deps], (Controller, …) => Controller.extend("<ns>.controller.<Name>", { … }))` with `"use strict"` — the generator style |
| Build tooling | `ui5-tooling-transpile` (middleware + task in `ui5.yaml`), `typescript`, `@sapui5/types` | none — the `.js` files are served and built as they are |
| Type check | `npm run ts-typecheck` (`tsc --noEmit`) | none — JSDoc on every function documents the parameter and return types (`sap-conventions` §9) |
| Extending a controller | `export default class X extends BaseController` | `return BaseController.extend("<ns>.controller.X", { onInit() { … } })` |
| Same in both | everything else on this page: XML views, manifest, routing, OData V4 settings, i18n, the pitfalls table | |

**TypeScript event types** (verified in `@sapui5/types` 1.136 — import the type from the control module, e.g.
`import { SearchField$SearchEvent } from "sap/m/SearchField";`, then `onSearch(event: SearchField$SearchEvent)`):

| Handler | Type | Module |
|---|---|---|
| route `patternMatched` | `Route$PatternMatchedEvent` | `sap/ui/core/routing/Route` |
| router `routeMatched` | `Router$RouteMatchedEvent` | `sap/ui/core/routing/Router` |
| `SearchField` search / liveChange | `SearchField$SearchEvent` · `SearchField$LiveChangeEvent` | `sap/m/SearchField` |
| table / list `itemPress` · `selectionChange` | `ListBase$ItemPressEvent` · `ListBase$SelectionChangeEvent` | `sap/m/ListBase` |
| row `press` (`ColumnListItem type="Navigation"`) | `ListItemBase$PressEvent` | `sap/m/ListItemBase` |
| `Input` valueHelpRequest · liveChange · change | `Input$ValueHelpRequestEvent` · `Input$LiveChangeEvent` · `InputBase$ChangeEvent` | `sap/m/Input` · `sap/m/InputBase` |
| `Select` change · `ComboBox` selectionChange | `Select$ChangeEvent` · `ComboBox$SelectionChangeEvent` | `sap/m/Select` · `sap/m/ComboBox` |
| `SelectDialog` search · confirm | `SelectDialog$SearchEvent` · `SelectDialog$ConfirmEvent` (`selectedItem` is a `StandardListItem`) | `sap/m/SelectDialog` |
| `DatePicker` change · `Button` press | `DatePicker$ChangeEvent` · `Button$PressEvent` | `sap/m/DatePicker` · `sap/m/Button` |

Pattern: `<Control>$<EventName>Event` from the module of the control that fires it (inherited events from the base
class module: `ListBase`, `ListItemBase`, `InputBase`). A handler typed `Event` without the import falls back to the
browser DOM `Event` (`getSource` does not exist) — type every handler. Also strict mode: `ResourceBundle.getText(…)`
returns `string | undefined` (write `getText("key") ?? "key"`), and `getBindingContext()` may be undefined (`?.`).
Verify with `npm exec --no -- tsc --noEmit` in the module folder (verified fix of a real build: 15 errors → 0).

JavaScript rules: one `sap.ui.define` per file with the dependency array and the factory parameters
in the same order; module paths with `/` and the app namespace (`com/i2c/app/model/formatter`);
no globals, no `jQuery.sap.*`, no `sap.ui.getCore()`; formatters in `model/formatter.js` returned as
an object; never mix `.ts` and `.js` application files in one app.

## Conventions (HARD CONSTRAINTS)
- Theme `sap_horizon`; controls `sap.m.*` only (`sap.m.Table` responsive unless dense/analytical).
- `Component` extends `sap/ui/core/UIComponent` with `IAsyncContentCreation`; async routing on.
- Navigate via `Router.navTo()`; model access via `this.getView().getModel()` — never
  `sap.ui.getCore()`, no jQuery.
- OData V4 model settings: `type: "sap.ui.model.odata.v4.ODataModel"`, `operationMode: "Server"`, `autoExpandSelect: true`, `groupId: "$auto"`, `earlyRequests: true`. **NEVER** include `synchronizationMode` — it was removed in UI5 1.110+ and causes a silent grey screen (model fails to initialize, no `$metadata` request fires).
- All user-facing strings in i18n; no `console.log` (use the UI5 `Log` module); no hardcoded URLs.
- Never use `fetch`, `XMLHttpRequest`, or `$.ajax` for service calls — use OData V4 `bindContext`
  (for actions/functions) or `bindList`/`bindContext` (for entity reads/writes). Direct HTTP calls
  bypass CSRF token handling, session management, and the OData V4 batch queue.
- Namespace identical in Component / manifest `sap.app.id` / index.html resource-roots / `ui5.yaml`
  (lowercase) — run `mcp__intent2code__validate_namespace`.

## Verified runtime pitfalls (each one blanked or broke a generated app — HARD CONSTRAINTS)

| # | Rule | What happens otherwise |
|---|---|---|
| P1 | The UI5 version in `index.html` (CDN `src`) must **exist**: resolve it with `ui5_get_version_info`, or read `https://sapui5.hana.ondemand.com/resources/sap-ui-version.json`, and confirm `<cdn>/<version>/resources/sap-ui-core.js` answers 200. **Never guess a patch number.** | A guessed patch that was never published → 404 → `sap-ui-core.js` never loads → blank page |
| P2 | **Formatters get converted values.** OData V4 types every property from `$metadata` and hands a formatter the value *already converted to the target control property's type* — `Edm.Int32` 3 arrives as `"3"` for a string property like `ObjectStatus.state`/`icon`. Coerce (`Number(v)`) or add `targetType: 'any'` to the binding before comparing. | `switch (v) { case 3: … }` never matches → state "None", no colour/icon, no error anywhere |
| P3 | **Form + ColumnLayout fields are form controls only** (`Input`, `Text`, `Select`, `ComboBox`, `DatePicker`, `StepInput`, `ObjectStatus`, …) — never `HBox`/`VBox`/`FlexBox`/`Toolbar`. A value help is `<Input showValueHelp="true" valueHelpOnly="true" valueHelpRequest=".onValueHelp"/>`, not Text + Button in an HBox. | `Element sap.m.HBox … is not a valid Form content` → the whole route fails to render |
| P4 | Saving uses **PATCH = only the changed fields**. Backend UPDATE validators must validate a field only when it is present (see `cap-code-builder` handler rules). | every Save → `400` ("… is required") |
| P5 | In a CAP project the app is served by `cds-plugin-ui5` at **`/<ui5.yaml metadata.name>/index.html`** (TypeScript transpiled there; JavaScript served as is). `/<module>/webapp/index.html` is CAP's raw static folder → `Component.js` 404 → blank. The watch script must be `cds watch --open <metadata.name>/index.html?sap-ui-xx-viewCache=false --livereload false`, and STEP 10 prints exactly that URL. | user opens the wrong URL and sees a blank page |
| P6 | Root `package.json` must have `"workspaces": ["app/*"]` (the generator adds it only for Fiori Elements) so one root `npm install` installs the app tooling (TypeScript: `ui5-tooling-transpile`/`typescript`). | `ui5.yaml` middleware cannot load → `.ts` never transpiled → blank |
| P7 | Remove the generated `fiori-tools-appreload` middleware from `ui5.yaml` when served by `cds-plugin-ui5` (`cds watch` live-reloads already) and point middlewares that ran after it to `afterMiddleware: compression`. | `listen EADDRINUSE` → the dev server dies on every backend change |
| P8 | **TypeScript: `tsc --noEmit` must pass.** `npm run build` runs it first (`prebuild` → `ts-typecheck`), so `mbt build` stops on any type error even though `cds watch` works (the transpile step does not type-check). Type every event handler with the typed event of its control — never `Event` from `sap/ui/base/Event` (its `getParameter` accepts nothing → `not assignable to parameter of type never`). When you remove or rename a generated view/controller (`View1`), also fix the generated tests that import it. | `mbt build` fails: `could not build the html5 module … ts-typecheck` |

All eight are enforced by the checks in `application-sanity-check`:
`scripts/ui-health-checks.mjs` (static checks 7–9, 18 and 19), static check 25 (`ui5lint`, plus `tsc --noEmit`
for TypeScript modules — P8) and `scripts/smoke-check.mjs --render` (runtime checks 5–10, real browser incl.
navigation and a partial save).

## References
- Standalone freestyle (own router/index.html) → [`references/freestyle-standalone.md`](references/freestyle-standalone.md)
- Freestyle inside a CAP project (served by cds watch) → [`references/freestyle-in-cap.md`](references/freestyle-in-cap.md)

Manifest routing/config details are in the `fiori-bootstrap` skill; tests in `sap-unit-testing`.
