*Part of the deployment-validation skill. Shared by `mta-reviewer`, `deployment-checklist`, `cap-integration`, `launchpad-workzone`, the `deployer` agent and `/deploy`.*

# MTA Layouts — Generated (A) and Hand-Written (B)

Two `mta.yaml` layouts are valid for a CAP + Fiori app on the html5-apps-repo pattern (no standalone
approuter). Every deployment rule in this plugin accepts **both**. Identify the layout first, then check
each rule in the place that layout keeps the item (equivalence table below). An item that is correct in
the place its layout uses PASSES: a layout A file is never a finding because it does not look like
layout B, and the reverse.

| Layout | Produced by | Recognise it by |
|---|---|---|
| **A — generated (default)** | `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`: runs the project-local `cds add mta,workzone-standard`, then adds `forwardAuthToken: true` on srv-api, an explicit `service-name` on every managed service, a real description, the stack.json schema version and build line, and the `relative-odata-uri` build task per UI app | module `<id>-app-deployer` whose `parameters.config.destinations` holds `Name: srv-api`; module `<id>-destinations`; the destination resource has no `config.init_data` |
| **B — hand-written** | older projects, or `references/deployment-templates.md` | the destination resource `config.init_data` holds the srv-api destination (`<id>-srv-api`); modules `<id>-app-content` and `<id>-destination-content` |

**Fix for a missing or incomplete deployment file (CAP projects).** Regenerate; never hand-write
`mta.yaml`, `xs-app.json` or the UI build configuration:

```bash
node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>
cd <app> && npm install
```

The script is idempotent on a layout A project. On a layout B project, review the resulting `mta.yaml`
diff before committing: `cds add` works on the existing file, so old and generated modules can end up
side by side (for example `<id>-app-content` next to `<id>-app-deployer`). A project without a CAP root
(`srv/` or `db/`) cannot use the script (exit 2): use the layout B templates without the srv module.

---

## Names

Layout A names are derived from the `mta.yaml` `ID` and the app folder under `app/`. The example column
is the verified reference output (`ID: leave-app`, one UI app in `app/leaverequests`, `mbt build -p cf` succeeds).

| Item | Layout A (generated) | Example | Layout B (hand-written) |
|---|---|---|---|
| CAP service module | `<id>-srv` | `leave-app-srv` | `<id>-srv` |
| HANA deployer module | `<id>-db-deployer` | `leave-app-db-deployer` | `<id>-db-deployer` |
| html5 module, one per UI app | `<id without dashes><folder>` | `leaveappleaverequests` | any name the app deployer lists |
| App deployer module | `<id>-app-deployer` | `leave-app-app-deployer` | `<id>-app-content` or `<id>-app-deployer` |
| Destinations content module | `<id>-destinations` | `leave-app-destinations` | `<id>-destination-content` |
| srv-api destination `Name` | `srv-api` | `srv-api` | `<id>-srv-api` |
| xsuaa, destination, html5 repo host resources | `<id>-auth` · `<id>-destination` · `<id>-html5-repo-host`, `service-name` = resource name | `leave-app-auth` | same roles, `service-name` set by hand |
| HDI container resource | `<id>-db`, no `service-name` | `leave-app-db` | `<id>-db`, `service-name` optional |
| App zip | `<folder>.zip` (zipper `archiveName` = app folder) | `leaverequests.zip` | `archiveName` + `.zip` |
| `sap.cloud.service` | `<id without dashes>.service` | `leaveapp.service` | any value, often `<id>` |
| Content module destinations | `<id>-html5-repository` · `<id>-auth` | `leave-app-html5-repository` | often `<id>-html5-repo-host` · `<id>-uaa` |
| `sap.app.id` = `ui5.yaml` `metadata.name` | the namespace the app was generated with | `com.i2c.leaverequests` | same rule (hard rule 1) |
| App folder = app `package.json` `name` | the folder under `app/` | `leaverequests` | same rule |
| `xs-app.json` | `app/<folder>/xs-app.json`, packaged by the zipper `additionalFiles` | `app/leaverequests/xs-app.json` | `app/<folder>/xs-app.json` or `app/<folder>/webapp/xs-app.json` |
| Zipper task `ui5-task-zipper` | `app/<folder>/ui5.yaml` `builder.customTasks`, `afterTask: generateVersionInfo` | | `app/<folder>/ui5-deploy.yaml`, `afterTask: generateCachebusterInfo` |
| UI build script the html5 module runs | `npm run build` (`ui5 build preload --clean-dest`) | | `npm run build:cf` (`--config ui5-deploy.yaml`) |
| `_schema-version` | `3.3.0` unquoted (a YAML string, equal to the stack.json version) | | `"3.3"` or `"3.3.0"`; only an unquoted `3.3` (a YAML float) is a finding |

`sap.app.id`, the app folder and the html5 module name are three different values in layout A. All three
are correct; what must match is listed in the table below.

---

## Equivalence table — where each rule looks

| Requirement (layout-neutral) | Rule IDs | Layout A — where | Layout B — where |
|---|---|---|---|
| `forwardAuthToken: true` in the srv module `provides` → `srv-api` → `properties` (hard rule 3) | MTA8 · S6 · J1 | srv module (added by deploy-config.mjs) | srv module |
| The srv-api URL destination has `URL: ~{srv-api/srv-url}` (never hardcoded), `HTML5.ForwardAuthToken: true`, `HTML5.DynamicDestination: true`, `Type: HTTP`, `ProxyType: Internet` | MTA11 · MTA12 · MTA23 · DS7 · DS8 · DS10 · J2 | app deployer `parameters.config.destinations`, entry `Name: srv-api` | destination resource `config.init_data.instance.destinations`, entry `Name: <id>-srv-api` |
| The module or resource that holds the srv-api destination lists `srv-api` in `requires` (needed for `~{srv-api/srv-url}`) | MTA13 · DS12 · DC7 | app deployer `requires` (the destinations module and the destination resource list it too) | destination resource `requires` |
| `HTML5Runtime_enabled: true` | MTA10 · DS4 | app deployer `requires` entry for `<id>-html5-repo-host` → `parameters.config` | destination resource `parameters.config` |
| `existing_destinations_policy: update` wherever the key appears; never `fail` or `ignore` | MTA14 · DC8 · DS6 · SEC4 · SEC5 | `<id>-destinations` `parameters.content.instance` (the app deployer `config.destinations` carries no policy key, which is not a finding) | destination content module `parameters.content.instance` and resource `config.init_data.instance` |
| No `URL:` in any `parameters.content.instance.destinations` entry of the destinations content module (service-key destinations only) | MTA22 · DC12 | `<id>-destinations` | `<id>-destination-content` |
| Destinations content module: `type: com.sap.application.content`, `build-parameters.no-source: true`, `path` absent or `.` (never `..`), requires the destination resource with `content-target: true` and xsuaa plus the html5 repo host with `service-key` | MTA18 · DC1–DC6 | `<id>-destinations` (no `path`) | `<id>-destination-content` (`path: .`) |
| `ServiceInstanceName` = the `service-name` of the resource it names; every entry carries the `sap.cloud.service` of the manifest | DC9 · DC10 · DC11 · XFC2 · XFC6 · MAN2 | `<id>-destinations` entries | `<id>-destination-content` entries |
| App deployer requires the html5 repo host with `content-target: true`; `build-parameters.requires` lists every html5 module with its zip `artifacts` and a `target-path` | AD1–AD5 · U6 · XFC9 | `<id>-app-deployer`, `path: gen`, `build-result: app/`, `target-path: app/` | `<id>-app-content`, `path: .`, `build-result: resources`, `target-path: resources/` |
| html5 module per UI app: `type: html5`, `path: app/<folder>`, `builder: custom`, the UI build script, `build-result: dist`, `supported-platforms: []`; never `npm install`. **Install step:** when the root `package.json` `workspaces` covers the app folder (Intent2Code apps: `"app/*"`), the module runs **only** the build script — the before-all `npm ci` installs every workspace app, and a second `npm ci` inside a workspace app reinstalls the whole tree with only the packages of that app (after `mbt build` the root has no `@sap/cds` / `@sap/cds-dk`, `npm run watch` fails — verified). Without workspaces: `npm ci` then the build script | MTA16 · MTA17 · U1–U5 · XFC8 | `<id without dashes><folder>`, `npm run build` (workspace app: deploy-config.mjs removes the generated `npm ci`) | any name, `npm run build:cf` |
| Zipper `archiveName` + `.zip` = the `artifacts` entry the app deployer lists for that html5 module; `additionalFiles` carries `xs-app.json`; the app `package.json` has the build script and `ui5-task-zipper` | UDY2–UDY4 · XFC1 · APKG3 · APKG4 | `ui5.yaml` | `ui5-deploy.yaml` |
| Every `org.cloudfoundry.managed-service` resource has an explicit `service-name` | MTA15 · X4 · HR2 · DS3 | added by deploy-config.mjs (= resource name) | set by hand |
| A `com.sap.xs.hdi-container` resource needs a `service-name` only when something references it (`${service-name}`, `ServiceInstanceName`) | DB4 · DB5 | none, nothing references it | as written |
| xsuaa resource `path: ./xs-security.json`; scopes and role templates never inline | MTA19 · X5 · SEC3 | a `config` block that sets only `xsappname`, `tenant-mode` and `oauth2-configuration` (what `cds add mta` writes) is not inline | `path` only |
| Effective `xsappname` | XS1 · XFC7 · X6 | `config.xsappname: <id>-${org}-${space}` overrides the file (`xsappname: <id>`); accepted, unique per space | `xs-security.json` `xsappname` = `<id>` |
| `before-all`: `npm ci` then `npm exec --no -- cds build --production` | MTA4 · MTA5 · B1–B6 | written by `stack.mjs apply --scope deploy` (run by deploy-config.mjs) | set by hand |
| srv module `type: nodejs`, `path: gen/srv`, `builder: npm-ci`, `srv-url: ${default-url}` | MTA6 · MTA7 · MTA9 · S1–S5 | same | same |
| No `approuter.nodejs` module (hard rule 2) | G1 | none | none |
| `ui5` CDN destination | MTA21 · DS11 · J4 | absent, which is not a finding | optional; when present it has no `HTML5.ForwardAuthToken` |
| `HTML5.Timeout` on the srv-api destination | DS9 | absent, which is not a finding unless the service has long-running operations | same |
| OData route in `xs-app.json`: source matches the first segment of the BUILT dataSources uri, `destination` = the srv-api destination `Name`, `authenticationType: xsuaa`, `csrfProtection: true`; the catch-all `^(.*)$` → `html5-apps-repo-rt` is last | XA1–XA8 · XFC4 · XFC5 · DS_XS1 | `^/?odata/(.*)$` → target `/odata/$1`, destination `srv-api` | the same route with destination `<id>-srv-api`, or `^/<id>-srv-api/(.*)$` → target `$1` when the BUILT uri starts with `<id>-srv-api/` |
| Source manifest of a CAP app: absolute `/odata/v4/<svc>/`; BUILT manifest (dist, Component-preload): relative | MAN3 · MAN7 · UY6 · U7 · U8 | `relative-odata-uri` task in `ui5.yaml` | the same task in the ui5 config the build script uses (`ui5-deploy.yaml`), or another build step with the same effect |
| `sap.cloud` → `service` and `crossNavigation.inbounds` in the manifest | MAN2 | written by `cds add workzone-standard` (inbound `<folder>-display`) | set by hand |

---

## The data source URI — absolute in the source, relative in the build

| Where | Value (reference output) | Why |
|---|---|---|
| Source `app/<folder>/webapp/manifest.json` | `/odata/v4/leave/` | `cds watch` (cds-plugin-ui5) serves the app under `/<namespace>/`; a relative uri resolves to `/<namespace>/odata/...` → 404, blank page (static check 12) |
| Built `dist/manifest.json` and `dist/Component-preload.js` | `odata/v4/leave/` | the HTML5 Application Runtime and SAP Build Work Zone serve the app below an app path; an absolute uri drops that path → 404 |
| `app/<folder>/xs-app.json` | `^/?odata/(.*)$` → `/odata/$1`, destination `srv-api` | the runtime matches the request path below the app path and forwards it to the CAP service URL |

The `relative-odata-uri` build task strips the leading `/` of every `/odata/...` data source uri in the
BUILT manifest only; the source manifest never changes. deploy-config.mjs writes three pieces per UI app:

1. a local UI5 extension package `app/<folder>/ui5-tasks/relative-odata-uri/` with `package.json`
   (`ui5-task-relative-odata-uri`), `ui5.yaml` (`kind: extension`, `type: task`, `metadata.name:
   relative-odata-uri`, `task.path: task.cjs`) and `task.cjs` (its source is in deploy-config.mjs, step 3);
2. the devDependency `"ui5-task-relative-odata-uri": "file:ui5-tasks/relative-odata-uri"` in the app
   `package.json` — the UI5 tooling finds the task through it, like `ui5-task-zipper`;
3. one `customTasks` entry in the app `ui5.yaml`:

```yaml
# app/<folder>/ui5.yaml
builder:
  customTasks:
    - name: relative-odata-uri
      beforeTask: generateComponentPreload
    - name: ui5-task-zipper
      afterTask: generateVersionInfo
      configuration:
        archiveName: leaverequests
        relativePaths: true
        additionalFiles:
          - xs-app.json
```

The app `ui5.yaml` stays ONE YAML document: a second document (`---` with `kind: extension`) makes every
later `cds add` fail, because it reads `ui5.yaml` with a single-document parser (verified). A second
document in an app `ui5.yaml` is a WARN; the fix is the regenerate command above.

Two blocking findings, both layouts. Blocking means CRITICAL in `deployment-validation` and in the
deployer report, FAIL in `mta-reviewer`:

| Finding | Rule IDs | Fix |
|---|---|---|
| A UI app served by the CAP project has no `relative-odata-uri` build task and no other build step that makes the BUILT uri relative | UY6 · U7 | `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`, then `cd <app> && npm install` |
| The SOURCE manifest of a CAP app has a relative dataSources uri: bare `odata/v4/<svc>/` or destination-prefixed `<destination>/odata/...` | MAN7 · U8 | restore `/odata/v4/<svc>/` exactly as `cds compile srv --to serviceinfo` reports it; the build makes it relative |

Apps whose service is not served by the CAP project (external OData, RAP) are outside these two rules:
their uri follows `cap-integration` and static check 13.

---

## Not findings in layout A

All of these are in the verified reference output and are correct:

- No `config.init_data` on the destination resource, no `ui5` destination, no `*-ui`, `*-app-content` or `*-destination-content` module names.
- html5 module `leaveappleaverequests`, app folder and app `package.json` `name` `leaverequests`, `sap.app.id` and `ui5.yaml` `metadata.name` `com.i2c.leaverequests`.
- No `ui5-deploy.yaml`; the zipper in `ui5.yaml` with `afterTask: generateVersionInfo`; `xs-app.json` in the app folder root, packaged through `additionalFiles`.
- html5 module `commands:` with only `npm run build` when the app is an npm workspace of the CAP root (the before-all `npm ci` installs it).
- The `app/<folder>/ui5-tasks/relative-odata-uri/` package and its `file:` devDependency.
- `_schema-version: 3.3.0` unquoted.
- No `service-name` on the `com.sap.xs.hdi-container` resource.
- No `path` on the `<id>-destinations` module.
- No `memory`, `disk-quota`, health check or `build-parameters.ignore` on the srv module; no `HTML5.Timeout`; no `sizeLimit` on the html5 repo host.
- xsuaa `config.xsappname: <id>-${org}-${space}` next to `path: ./xs-security.json`.
- No `scripts.build` with `mbt build` in the root `package.json` (`mbt build` runs directly).

---

## Full files

| Layout | Complete annotated file |
|---|---|
| A — generated | `deployment-checklist` → `references/mta-structure.md` |
| B — hand-written | `deployment-validation` → `references/deployment-templates.md` |
