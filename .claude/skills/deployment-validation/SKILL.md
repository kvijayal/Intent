---
name: deployment-validation
description: >
  Prescriptive deployment configuration guide for CAP + Fiori apps on SAP BTP — provides
  correct file templates AND validates existing files. Load this skill whenever creating or
  checking mta.yaml, xs-app.json, ui5.yaml, ui5-deploy.yaml, app/package.json, xs-security.json,
  or manifest.json for deployment. Generate-first: CAP projects get the deployment files from
  deploy-config.mjs (layout A); references/deployment-templates.md holds the hand-written
  layout B; references/mta-layouts.md maps every rule to both layouts; then run the
  validation workflow to confirm cross-file consistency. Derived from real-world VCleavers
  project analysis with all issues resolved. Keywords: deployment, mta.yaml, xs-app.json,
  ui5.yaml, ui5-deploy.yaml, manifest, xs-security.json, package.json, destination,
  forwardAuthToken, archiveName, sap.cloud.service, npm ci, xsappname, production auth,
  cross-file consistency, deployment ready.
---

# Deployment Validation — Templates + Pre-Flight Checklist

> **Two modes — use both:**
> 1. **Template mode** (generating files) — CAP projects: run
>    `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`, then `cd <app> && npm install`
>    (layout A, the default). Hand-written layout B: load `references/deployment-templates.md` and
>    substitute the six identity constants. Every file is correct by construction.
> 2. **Validation mode** (checking existing files) — run the workflow below (Steps 0–5).
>    Every check has a fix snippet. A project passes when zero CRITICALs remain.
>
> **Both layouts are valid.** Identify the layout first (`references/mta-layouts.md`): layout A is
> what deploy-config.mjs generates (`cds add mta,workzone-standard`), layout B keeps the srv-api
> destination in the destination resource `init_data`. Check every rule where the detected layout
> keeps the item. The fix for any missing or incomplete generated deployment file is the
> regenerate command above, never a hand-written `mta.yaml`.

---

## The Six Identity Constants

Derive these once from `mta.yaml` + `app/*/webapp/manifest.json`. Every file uses them.

| Constant | Source | Example (layout A · layout B) |
|---|---|---|
| `MTA_ID` | `mta.yaml ID:` (lowercase) | `leave-app` · `vcleavers` |
| `APP_ID` | `sap.app.id` in manifest = `ui5.yaml metadata.name` | `com.i2c.leaverequests` · `project2` |
| `SRV_MODULE` | srv module `name:` | `leave-app-srv` · `vcleavers-srv` |
| `BACKEND_DEST` | `Name:` of the srv-api URL destination — layout A: app deployer `parameters.config.destinations`; layout B: destination resource `init_data` | `srv-api` · `vcleavers-srv-api` |
| `CLOUD_SERVICE` | destinations content module `sap.cloud.service:` (layout A `<id>-destinations`, layout B `<id>-destination-content`) | `leaveapp.service` · `vcleavers` |
| `XSAPPNAME` | `xs-security.json xsappname` (use lowercase = `MTA_ID`) | `leave-app` · `vcleavers` |

> **Rule:** `XSAPPNAME` must equal `MTA_ID` (lowercase). Set them to the same value. Case
> mismatch causes silent XSUAA binding failures in some BTP regions. A `config.xsappname` on the
> mta.yaml xsuaa resource overrides the file; the generated `<MTA_ID>-${org}-${space}` is accepted.
>
> The app folder, the html5 module name and the zip name are per app and need not equal `APP_ID`:
> layout A uses `app/leaverequests`, module `leaveappleaverequests`, zip `leaverequests.zip`.
> What must match is listed in XFC1, XFC3 and XFC8; where each item lives per layout is in
> `references/mta-layouts.md`.

---

## Template Mode

CAP projects: run `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>` from the
workspace root, then `cd <app> && npm install`. The script writes layout A (`mta.yaml`, `xs-app.json`,
the UI build with `ui5-task-zipper` and `relative-odata-uri`, `sap.cloud.service`, the launchpad
inbound) and passes the validation workflow below with zero CRITICAL findings.

Layout B (hand-written, or a project without a CAP root): load `references/deployment-templates.md`
to get ready-to-use templates for every file.
Substitute `{MTA_ID}`, `{APP_ID}`, `{SRV_MODULE}`, `{BACKEND_DEST}`, `{CLOUD_SERVICE}`,
`{XSAPPNAME}` with the actual values. The templates encode all rules — a project built from
them passes the validation workflow below with zero CRITICAL findings.

---

## Validation Mode — Step-by-Step Workflow

### Step 0 — File Presence

```bash
test -f mta.yaml          && echo MTA_OK       || echo MTA_MISSING
test -f xs-security.json  && echo XSSEC_OK     || echo XSSEC_MISSING
find app -name "xs-app.json"     2>/dev/null | head -5
find app -name "ui5.yaml"        2>/dev/null | head -5
find app -name "ui5-deploy.yaml" 2>/dev/null | head -5
find app -name "manifest.json" -path "*/webapp/*" 2>/dev/null | head -5
find app -name "package.json"    2>/dev/null | head -5
```

Every missing file is a CRITICAL finding, except `ui5-deploy.yaml`: it exists only in layout B
(in layout A the zipper lives in `ui5.yaml`), so its absence is not a finding. `xs-app.json` sits in
`app/<folder>/` (layout A) or `app/<folder>/webapp/` (layout B); either location passes.
Fix (CAP projects): `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`, then
`cd <app> && npm install`. Without a CAP root: generate from the template in
`references/deployment-templates.md` before proceeding.

---

### Step 1 — Derive the Six Identity Constants

Read `mta.yaml` and the first `app/*/webapp/manifest.json`. Fill in the constants table above and
name the layout (A or B, `references/mta-layouts.md` § recognise it by) in the report header.
All subsequent checks reference these constants by name — never re-derive mid-check.

---

### Step 2 — Per-File Checks

#### `mta.yaml`

Quick-scan greps (catch the two most common critical failures first):

```bash
grep -n "forwardAuthToken\|ForwardAuthToken" mta.yaml   # expect ≥ 2 hits
grep -n "existing_destinations_policy"       mta.yaml   # expect all = 'update'
grep -n "npm install"                        mta.yaml   # expect ZERO hits
grep -n "service-name:"                      mta.yaml   # every managed-service resource needs one
```

The two `forwardAuthToken` hits: the srv module `provides` block, and the srv-api destination
(layout A: app deployer `parameters.config.destinations`; layout B: destination resource `init_data`).

| # | Check | Severity | Correct value |
|---|---|---|---|
| MTA1 | `_schema-version` equals the stack.json version as a YAML string: `"3.3"`, `"3.3.0"`, or unquoted `3.3.0` (what `cds add mta` writes, a string because it is not a number). Only an unquoted `3.3` (a YAML float) fails | CRITICAL | `"3.3"` or `3.3.0` |
| MTA2 | `parameters.deploy_mode: html5-repo` | WARNING | present at top level |
| MTA3 | `parameters.enable-parallel-deployments: true` | WARNING | present at top level |
| MTA4 | `before-all` commands: `npm ci` then `npm exec --no -- cds build --production` — in that order. `npx` installs from npm when the project has no local `@sap/cds-dk`, and the npm package literally named `cds` is an unrelated project; `npm exec --no` runs the local bin or fails, it never downloads. The same line with an `npx` prefix (what `cds add mta` generates) is a **WARNING**, fix: `node .claude/skills/sap-conventions/scripts/stack.mjs apply <app> --scope deploy` (rewrites the line) | CRITICAL | see template |
| MTA5 | No `npm install` anywhere in any module's `commands:` | CRITICAL | replace with `npm ci` |
| MTA6 | srv `type: nodejs`, `path: gen/srv` (never `srv/`) | CRITICAL | `gen/srv` |
| MTA7 | srv `build-parameters.builder: npm-ci` | CRITICAL | `npm-ci` |
| MTA8 | srv `provides.srv-api.properties.forwardAuthToken: true` | CRITICAL | must be present |
| MTA9 | srv `provides.srv-api.properties.srv-url: ${default-url}` | CRITICAL | must be present |
| MTA10 | `HTML5Runtime_enabled: true` is present — layout A: app deployer `requires` entry for the html5 repo host, `parameters.config`; layout B: destination resource `config` | CRITICAL | must be present |
| MTA11 | The srv-api destination (`BACKEND_DEST`; layout A: app deployer `parameters.config.destinations`, layout B: destination `init_data`) has `HTML5.ForwardAuthToken: true` | CRITICAL | must be present |
| MTA12 | The srv-api destination has `URL: ~{srv-api/srv-url}` — never hardcoded | CRITICAL | `~{srv-api/srv-url}` |
| MTA13 | The module or resource that holds the srv-api destination has `requires: - name: srv-api` (layout A: app deployer; layout B: destination resource) | CRITICAL | must be present |
| MTA14 | All `existing_destinations_policy:` values are `update` | CRITICAL | `update` |
| MTA15 | Every `org.cloudfoundry.managed-service` resource has explicit `service-name:`. A `com.sap.xs.hdi-container` resource is not a managed service and needs none unless something references its name | CRITICAL | see template |
| MTA16 | HTML5 module build commands never use `npm install` (CRITICAL). Install step: an app covered by the root `package.json` `workspaces` runs only its build script — the before-all `npm ci` installs it (correct); its own `npm ci` there is a WARNING (reinstalls the whole tree without the root packages, `npm run watch` fails after `mbt build`); an app outside the workspaces runs `npm ci` first (missing = WARNING) — see `references/mta-layouts.md` | CRITICAL / WARNING | remove `npm install`; regenerate with deploy-config.mjs |
| MTA17 | HTML5 module `build-result: dist` | CRITICAL | `dist` |
| MTA18 | The destinations content module (layout A `<id>-destinations`, layout B `<id>-destination-content`) has `build-parameters.no-source: true` | CRITICAL | must be present |
| MTA19 | XSUAA resource `parameters.path: ./xs-security.json` | CRITICAL | `./xs-security.json` |
| MTA20 | `description:` is not `"A simple CAP project."` placeholder | WARNING | update to meaningful text |
| MTA21 | A `ui5` CDN destination is optional (layout A has none — not a finding). When present it points to `https://ui5.sap.com` and has no `ForwardAuthToken` | WARNING | see template |
| MTA22 | No `URL:` key inside any `parameters.content.instance.destinations` entry in the destinations content module. The GACD only accepts `ServiceInstanceName`+`ServiceKeyName` entries. A `URL:` entry here fails at deploy with `Missing destination property [ServiceInstanceName]`. URL-based destinations (srv-api, ui5) belong in the app deployer `parameters.config.destinations` (layout A) or the destination **resource** `config.init_data` (layout B). | CRITICAL | regenerate (layout A) or move to `init_data` (layout B) |
| MTA23 | Every URL-based destination (app deployer `parameters.config.destinations` or `init_data`) must have `ProxyType: Internet` and `Type: HTTP` — without these the HTML5 Runtime cannot classify the destination | CRITICAL | add both properties |

Fix (CAP projects): `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`, then
`cd <app> && npm install` — it regenerates layout A; never hand-write `mta.yaml`. Layout B reference:
`references/deployment-templates.md` § mta.yaml. Rule-to-location map: `references/mta-layouts.md`.

---

#### Root `package.json`

| # | Check | Severity | Correct value |
|---|---|---|---|
| PKG1 | `cds.requires.[production].auth` is `"xsuaa"` — NOT `"dummy"` or `"mocked"`. **Skip if `xs-security.json` does not exist** — project is intentionally using no-auth. | CRITICAL | `"xsuaa"` |
| PKG2 | `name` is lowercase | WARNING | match `MTA_ID` |
| PKG3 | `cds-plugin-ui5` is `^0.17.0` (CAP+Fiori projects only). It declares `@sap/cds` as a **peerDependency only**, so it is **not** a P-04 dual-load cause — do not pin `0.13.6`. | WARNING | `"^0.17.0"` |
| PKG4 | If `connectivity` resource in mta.yaml: `cds.requires.[production].connectivity` not `false` | CRITICAL | remove the `false` override |
| PKG5 | `scripts.build` calls `mbt build` — optional convenience; absent is not a finding (the generated layout has none, `mbt build` runs directly) | INFO | present |
| PKG10 | If `cds.requires.db.kind` is `"sqlite"` without a `[production]` override to HANA: `@cap-js/sqlite` must be in `dependencies`, not `devDependencies` — CF sets `NODE_ENV=production` and skips devDependencies at runtime | CRITICAL | move to `dependencies` |
| PKG11 | `@sap/cds-dk` in `devDependencies` at the **same major** as `@sap/cds`, AND a plain `"watch": "cds watch"` script exists, AND no `server.exit_on_multi_install` anywhere (P-04 dual-load — see `CLAUDE.md` hard rule 5) | CRITICAL | present / present / absent |
| PKG12 | If `cds.build.tasks` (root `package.json` or `.cdsrc.json`) defines a `nodejs` task with `options.model`, that model includes `app`. `cds watch` always loads `app/`, so a `["db", "srv"]` model works locally and deploys a `$metadata` without UI annotations — empty Fiori pages, `sap.fe.macros` TypeError | CRITICAL | `["db", "srv", "app"]`, or no custom `cds.build.tasks` |

Fix PKG1: `"[production]": { "auth": "xsuaa" }` in `cds.requires`.
Fix PKG10: move `@cap-js/sqlite` from `devDependencies` to `dependencies` in root `package.json`.
Fix PKG11: `node .claude/skills/sap-conventions/scripts/stack.mjs apply <app> --scope cap` (pins `@sap/cds-dk` to the stack.json range) and `npm pkg set scripts.watch="cds watch"`, then delete any `server.exit_on_multi_install` key from `package.json` / `.cdsrc.json` and any `overrides` entry for `@sap/cds` (a no-op against `bundleDependencies`). Run the project with `npm run watch`, never bare `cds watch`. Verified by `application-sanity-check` static checks 1–5.
Fix PKG12: add `"app"` to the nodejs task's `options.model` (or remove the custom `cds.build.tasks` so CAP's default applies), and make sure `app/services.cds` imports every `app/<module>/annotations.cds` (`using from './<module>/annotations';`). Verified by `application-sanity-check` static checks 20–22.

---

#### `app/*/package.json`

| # | Check | Severity | Correct value |
|---|---|---|---|
| APKG1 | `name` matches the app folder name exactly | CRITICAL | the folder name — e.g. `"project2"` not `"project1"` in `app/project2` |
| APKG2 | `name` is unique across all `app/*/package.json` files (npm workspaces reject duplicates). It does not have to equal `sap.app.id`: the generated `leaverequests` next to `sap.app.id` `com.i2c.leaverequests` is correct | CRITICAL | unique folder name |
| APKG3 | The script the mta.yaml html5 module runs exists and builds with the ui5 config that holds the `ui5-task-zipper` task — layout A: `scripts.build` = `ui5 build preload --clean-dest` (uses `ui5.yaml`); layout B: `scripts.build:cf` = `ui5 build ... --config ui5-deploy.yaml` | CRITICAL | must be present |
| APKG4 | `devDependencies` includes `ui5-task-zipper` | CRITICAL | required by the zipper task (`ui5.yaml` or `ui5-deploy.yaml`) |
| APKG5 | `devDependencies` includes `@ui5/cli` | WARNING | `^4` |
| APKG6 | `devDependencies` includes `@sap/ux-ui5-tooling` | WARNING | `1` |

Fix (CAP projects): `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`, then
`cd <app> && npm install`. Layout B: see `references/deployment-templates.md` § app/package.json.

---

#### `xs-security.json`

| # | Check | Severity | Correct value |
|---|---|---|---|
| XS1 | `xsappname` equals `MTA_ID` in lowercase (a mta.yaml xsuaa `config.xsappname` of `<MTA_ID>-${org}-${space}` overrides it and is accepted) | WARNING | `"{MTA_ID}"` |
| XS2 | `tenant-mode: "dedicated"` | WARNING | `"dedicated"` |
| XS3 | No hardcoded credentials anywhere | CRITICAL | n/a |

Fix: see `references/deployment-templates.md` § xs-security.json.

---

#### `app/*/xs-app.json`

Derive the expected OData route source from the BUILT dataSources uri (MAN3):
- `odata/v4/{service}/` (layout A, from the `relative-odata-uri` task) → source `^/?odata/(.*)$`,
  target `/odata/$1`, e.g. `BACKEND_DEST = srv-api`
- destination-prefixed `{BACKEND_DEST}/odata/v4/{service}/` → source `^/{BACKEND_DEST}/(.*)$`,
  target `$1`, e.g. `BACKEND_DEST = vcleavers-srv-api` → source pattern `^/vcleavers-srv-api/(.*)$`

| # | Check | Severity | Correct value |
|---|---|---|---|
| XA1 | A route exists whose source matches the first path segment of the BUILT dataSources uri | CRITICAL | `^/?odata/(.*)$` (layout A) or `^/{BACKEND_DEST}/(.*)$` |
| XA2 | That route `authenticationType: "xsuaa"` | CRITICAL | `"xsuaa"` |
| XA3 | That route `destination: "{BACKEND_DEST}"` | CRITICAL | matches `BACKEND_DEST` |
| XA4 | OData route `csrfProtection: true` | WARNING | `true` for write operations |
| XA5 | Catch-all route exists: `source: "^(.*)$"`, `service: "html5-apps-repo-rt"`, `authenticationType: "xsuaa"` | CRITICAL | must be last route |
| XA6 | Catch-all is the **last** route in the array | CRITICAL | position it last |
| XA7 | `authenticationMethod: "route"` at top level | INFO | `"route"` |
| XA8 | All `destination` values in routes exist as a destination `Name` in mta.yaml (layout A: app deployer `parameters.config.destinations`; layout B: `init_data`), or in the subaccount for an external service | CRITICAL | cross-check names |

Fix (CAP projects): `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`, then
`cd <app> && npm install`. Layout B: see `references/deployment-templates.md` § xs-app.json.

---

#### `app/*/ui5.yaml`

| # | Check | Severity | Correct value |
|---|---|---|---|
| UY1 | `metadata.name` matches `APP_ID` | CRITICAL | `"{APP_ID}"` |
| UY2 | `metadata.name` is lowercase (`CLAUDE.md` hard rule 1). It does not have to equal the app folder name: layout A has `com.i2c.leaverequests` in `app/leaverequests` | CRITICAL | lowercase `APP_ID` |
| UY3 | `type: application` | CRITICAL | `application` |
| UY4 | `specVersion: "4.0"` | WARNING | `"4.0"` |
| UY5 | No `framework:` block when bootstrapping from CDN | CRITICAL | omit it |
| UY6 | UI app served by the CAP project: the ui5 config the build script uses (layout A `ui5.yaml`, layout B `ui5-deploy.yaml`) lists `relative-odata-uri` in `builder.customTasks` (`beforeTask: generateComponentPreload`) and the task is resolvable — the extension package `app/<folder>/ui5-tasks/relative-odata-uri/` (`ui5.yaml` with `kind: extension`, `task.cjs`) referenced by the `file:` devDependency `ui5-task-relative-odata-uri` in the app `package.json` — or another build step makes the BUILT dataSources uri relative. Missing: the deployed app requests `/odata/...` without the app path and every OData call returns 404 in SAP Build Work Zone | CRITICAL | see `references/mta-layouts.md` § the data source URI |

Fix UY6 (CAP projects): `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`, then
`cd <app> && npm install`. Other checks: see `references/deployment-templates.md` § ui5.yaml.

---

#### `app/*/ui5-deploy.yaml`

> Layout A has no `ui5-deploy.yaml`: the zipper sits in `ui5.yaml` `builder.customTasks`, and the
> UDY checks below apply to that file. The absence of `ui5-deploy.yaml` is not a finding.

| # | Check | Severity | Correct value |
|---|---|---|---|
| UDY1 | `metadata.name` matches `APP_ID` (same as `ui5.yaml`) | CRITICAL | `"{APP_ID}"` |
| UDY2 | `builder.customTasks` includes `ui5-task-zipper` | CRITICAL | must be present |
| UDY3 | `ui5-task-zipper.configuration.archiveName` + `.zip` equals the `artifacts` entry the mta.yaml app deployer lists for this html5 module | CRITICAL | layout A: the app folder, e.g. `leaverequests` → `leaverequests.zip`; layout B: `"{APP_ID}"` → `{APP_ID}.zip` |
| UDY4 | `ui5-task-zipper.configuration.additionalFiles` includes `xs-app.json` | CRITICAL | routing config must be in the zip |
| UDY5 | The zipper runs after the last enabled build task: `afterTask: generateVersionInfo` (layout A, what `cds add` writes) or `afterTask: generateCachebusterInfo` when the build script includes that task (layout B `--include-task=generateCachebusterInfo`) | WARNING | correct order |
| UDY6 | `builder.resources.excludes` includes `/test/**` and `/localService/**` | INFO | keep dist clean |

Fix (CAP projects): `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`, then
`cd <app> && npm install`. Layout B: see `references/deployment-templates.md` § ui5-deploy.yaml.

---

#### `app/*/webapp/manifest.json`

| # | Check | Severity | Correct value |
|---|---|---|---|
| MAN1 | `sap.app.id` matches `APP_ID` | CRITICAL | `"{APP_ID}"` |
| MAN2 | `sap.cloud.service` matches `CLOUD_SERVICE` | CRITICAL | `"{CLOUD_SERVICE}"` |
| MAN3 | The BUILT OData `dataSource uri` (`dist/manifest.json` and `dist/Component-preload.js`) is relative, with no leading `/`: `odata/v4/{service}/` (layout A, written by the `relative-odata-uri` task) or destination-prefixed `{BACKEND_DEST}/odata/v4/{service}/`. Its first path segment is matched by an xs-app.json route to `BACKEND_DEST` (XA1, XFC5). Verify with UY6 when no `dist/` exists — the source manifest keeps `/odata/v4/{service}/` (MAN7, static check 12) | CRITICAL | built: `"odata/v4/{service}/"` |
| MAN4 | OData model settings include `operationMode: "Server"`, `autoExpandSelect: true`, `earlyRequests: true` (V4) | WARNING | all three must be present |
| MAN5 | `minUI5Version` in the SOURCE manifest is on the `stack.json` UI5 line (published patch); the build copies it unchanged and deploy-config.mjs does not touch it | WARNING | `stack.mjs apply <app>` (static check 6 checks it) |
| MAN6 | `sap.ui5.flexEnabled: true` | WARNING | `true` |
| MAN7 | UI app served by the CAP project: the SOURCE `webapp/manifest.json` dataSources uri is absolute, exactly the path CAP serves (`/odata/v4/{service}/`). A relative uri in the source — bare `odata/v4/{service}/` or destination-prefixed `{BACKEND_DEST}/odata/...` — makes `cds watch` request `/<namespace>/odata/...` → 404, blank page. The deployed form comes from the build (UY6), never from editing the source | CRITICAL | `"/odata/v4/{service}/"` |

Fix MAN7: restore the leading `/` exactly as `cds compile srv --to serviceinfo` reports the path.
Fix MAN3 (CAP projects): `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`, then
`cd <app> && npm install` (adds the `relative-odata-uri` task). Layout B: see
`references/deployment-templates.md` § manifest.json.

---

### Step 3 — Cross-File Consistency (most deployments break here)

Run after all per-file checks. These are the silent killers — everything compiles fine but
the app returns 404 or blank page after deploy.

| # | What must match | Files | Severity |
|---|---|---|---|
| XFC1 | Zipper `archiveName` (layout A `ui5.yaml`, layout B `ui5-deploy.yaml`) + `.zip` = the mta.yaml app deployer `artifacts[]` entry for that html5 module | ui5 config ↔ mta.yaml | CRITICAL |
| XFC2 | `manifest.json sap.cloud.service` = mta.yaml destinations content module `sap.cloud.service` | manifest ↔ mta.yaml | CRITICAL |
| XFC3 | `manifest.json sap.app.id` = `ui5.yaml metadata.name` (= `ui5-deploy.yaml metadata.name` when that file exists); app folder name = app `package.json name`; the html5 module `name:` is free (layout A: `<MTA_ID without dashes><folder>`) but is the name the app deployer lists | 5 files | CRITICAL |
| XFC4 | `xs-app.json` OData route `destination` = the srv-api destination `Name:` (layout A: app deployer `parameters.config.destinations`; layout B: `init_data`) | xs-app.json ↔ mta.yaml | CRITICAL |
| XFC5 | First path segment of the BUILT `dataSources uri` (MAN3) is matched by the `xs-app.json` OData route source — layout A: `odata` ↔ `^/?odata/(.*)$` | manifest ↔ xs-app.json | CRITICAL |
| XFC6 | mta.yaml destinations content module `ServiceInstanceName` = resource `service-name` for each service | mta.yaml modules ↔ resources | CRITICAL |
| XFC7 | `xs-security.json xsappname` (lowercase) = `MTA_ID` | xs-security.json ↔ mta.yaml | WARNING |
| XFC8 | mta.yaml HTML5 module `path:` = `app/<app folder>` | mta.yaml | CRITICAL |
| XFC9 | mta.yaml app deployer (layout A `<id>-app-deployer`, layout B `<id>-app-content`) `build-parameters.requires[].name` lists every HTML5 module | mta.yaml | CRITICAL |

---

### Step 4 — External Service Checks (conditional — skip unless remote services detected)

**Run this step only if `cds.requires` in `package.json` declares a remote service** — an entry with `kind` `odata`, `odata-v2`, `odata-v4`, `rest` or `hcql`, or with `credentials.destination` / `credentials.url`. Detection: read the root `package.json` and look at each `cds.requires` entry. Platform switches that `cds add` writes are NOT remote services: `db`, `auth`, `destinations`, `html5-repo`, `workzone`, `connectivity`, `multitenancy`, `extensibility`, `toggles`, `messaging`, `outbox` (and any entry whose value is just `true`).
If no remote service is declared, mark this step **N/A — no remote services configured** and proceed to Step 5.

| # | Check | Severity |
|---|---|---|
| EXT1 | External service `kind` is `odata-v2` or `odata-v4` — correct for the actual service | WARNING |
| EXT2 | EDMX/CDS stub file exists at the `model:` path | CRITICAL |
| EXT3 | On-premise service: `connectivity` resource bound in mta.yaml; `[production].connectivity` NOT `false` | CRITICAL |
| EXT4 | Handler uses `cds.connect.to('SERVICE_NAME')` — not raw `fetch`/`axios` | WARNING |
| EXT5 | V2 services: `csrf: true` and `csrfInBatch: true` set in `cds.requires` | WARNING |

---

### Step 5 — Output

```
## Deployment Readiness Report
Identity: MTA_ID={} · APP_ID={} · BACKEND_DEST={} · CLOUD_SERVICE={} · Layout={A generated | B hand-written}

### ❌ CRITICAL  (must fix before mbt build)
[rule#] description — File: ... Fix: exact snippet

### ⚠️  WARNING  (fix before production go-live)
[rule#] description — File: ... Fix: exact snippet

### ✅ PASSED  (N checks)

### Deploy commands (when all CRITICALs clear)
mbt build --mtar {MTA_ID}.mtar --platform cf
cf deploy mta_archives/{MTA_ID}.mtar --retries 1
# after xs-security.json changes: build + deploy again (updates the XSUAA instance with the mta.yaml config;
# a plain cf update-service -c xs-security.json fails when mta.yaml sets xsappname <id>-${org}-${space})
```

Intent2Code never runs cf deploy — the developer does.

---

## Quick Reference — Silent-Killer Antipatterns

| Antipattern | Symptom after deploy | Fix |
|---|---|---|
| `app/package.json name` ≠ folder name | Namespace broken — app never loads | Match to `{APP_ID}` |
| `[production].auth: "dummy"` | All OData calls return 401 | Change to `"xsuaa"` |
| `npm install` in mta.yaml commands | Non-deterministic build | Replace with `npm ci` |
| Missing `service-name` on any managed-service resource | destinations content module binding breaks on re-deploy | Add explicit `service-name` (deploy-config.mjs adds it) |
| `xs-app.json` not in the zipper `additionalFiles` (`ui5.yaml` or `ui5-deploy.yaml`) | HTML5 Runtime has no route config — 404 everywhere | Add `xs-app.json` to `additionalFiles` |
| `sap.cloud.service` mismatch | HTML5 Runtime cannot associate app with service instance | Align both to `CLOUD_SERVICE` |
| Zipper `archiveName` + `.zip` ≠ mta.yaml app deployer `artifacts` entry | `mbt build` cannot find the zip | Align both (layout A: the app folder name) |
| BUILT `dataSources uri` first segment ≠ `xs-app.json` route source | All OData requests 404 in deployed app | Layout A: built uri `odata/v4/...`, route `^/?odata/(.*)$`; destination-prefixed: built uri `{BACKEND_DEST}/...`, route `^/{BACKEND_DEST}/(.*)$` |
| CAP UI app without the `relative-odata-uri` build task (UY6) | Works with `cds watch`, every OData call 404 in SAP Build Work Zone (the absolute uri loses the app path) | `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`, then `cd <app> && npm install` |
| Relative dataSources uri in the CAP SOURCE manifest (MAN7) | `cds watch` requests `/<namespace>/odata/...` → 404, blank page | Restore `/odata/v4/{service}/`; the build makes it relative |
| Custom `cds.build.tasks` nodejs model without `app` | List Report / FPM page empty or `sap.fe.macros` TypeError — only after deploy | Add `"app"` to the model (PKG12) |
| `xsappname` case mismatch | Silent XSUAA binding failure in some BTP regions | Lowercase — match `MTA_ID` |
| `connectivity: false` in `[production]` for on-premise service | CAP cannot reach Cloud Connector | Remove the `false` override |
| No `forwardAuthToken` in srv provides AND the srv-api destination | RBAC returns 403 for every request | Add to both places (deploy-config.mjs does) |
| `URL:` entry inside the destinations content module `parameters.content` | Deploy fails: `Missing destination property [ServiceInstanceName]` — adding `Type`/`ProxyType` does NOT fix it, wrong location | Regenerate (layout A keeps srv-api in the app deployer `parameters.config.destinations`), or move to destination resource `config.init_data` and add `requires: - name: srv-api` to the resource (layout B) |
| URL-based destination (app deployer config or `init_data`) missing `Type: HTTP` / `ProxyType: Internet` | HTML5 Runtime cannot classify the destination → 502 routing failure | Add `Type: HTTP` and `ProxyType: Internet` to the entry |
| `@cap-js/sqlite` in `devDependencies` when SQLite is the production DB | `Cannot find module '@cap-js/sqlite'` → crash on CF startup (MODULE_NOT_FOUND) | Move to `dependencies` |
| CSV seed UUIDs missing version/variant bits | `Element "ID" does not contain a valid UUID` → 400 on every OData read; table seeds as empty | UUID v4 requires position 13 = `4` and position 17 = `8/9/a/b` — e.g. `00000000-0000-4000-8000-000000000001` |
