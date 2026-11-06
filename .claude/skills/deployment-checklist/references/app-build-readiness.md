*Part of the deployment-checklist skill. Load when auditing Fiori app build scripts and ABAP deploy config.*

# App Build Readiness

Two sections: **Fiori app build scripts** (CAP-embedded and standalone UI5) and **ABAP Frontend deploy** (`ui5-deploy.yaml`).

---

## Section A — Fiori app build scripts

**Guard: `UI_PRESENT` only. Applies to both CAP-embedded and `STANDALONE_UI5` topologies.**

A missing or broken build script means `mbt build` silently produces an empty `.zip`, which
deploys as a blank-page app with no error during `cf deploy`.

### CAP-embedded apps (`app/` layout, `STANDALONE_UI5` is false)

For each app under `app/*/`:

**`app/*/package.json` — `"build"` script**

For each `app/<module>/` folder, read `app/<module>/package.json` and check that `scripts.build`
exists (or run `npm pkg get scripts.build` inside that folder — it prints `{}` when the script is absent).

- Missing `"build"` script = **CRITICAL**. Fix:
  ```json
  "scripts": {
    "build": "ui5 build --all"
  }
  ```

**`app/*/ui5.yaml` — `metadata.name` matches `sap.app.id`**

For each `app/<module>/` folder, read `app/<module>/ui5.yaml` (`metadata.name`) and
`app/<module>/webapp/manifest.json` (`sap.app.id`) and compare the two values — they must be identical.

Mismatch = **CRITICAL** — the app is deployed under the wrong technical name; the HTML5 repo
route in `xs-app.json` won't resolve it.

`metadata.name` must be all lowercase and identical to `sap.app.id` in `manifest.json`.

---

### Standalone UI5 apps (root layout, `STANDALONE_UI5` is true)

**Root `package.json` — `"build"` script**

```bash
npm pkg get scripts.build    # run in the project root; prints {} when the script is absent
```

Missing = **CRITICAL**. Fix: `"build": "ui5 build --all"`.

**Root `package.json` — `"deploy"` script**

```bash
npm pkg get scripts.deploy   # run in the project root; prints {} when the script is absent
```

Missing = **WARNING** — the developer has no scripted way to trigger `fiori deploy` after the build.
Fix: `"deploy": "fiori add deploy-config && fiori deploy"` with `@sap/ux-ui5-tooling` as a devDependency
(it provides the `fiori` bin; npm scripts already have `node_modules/.bin` on PATH) — or the equivalent for the target system.

**Root `ui5.yaml` — `metadata.name` matches `webapp/manifest.json` `sap.app.id`**

Read `ui5.yaml` (`metadata.name`) and `webapp/manifest.json` (`sap.app.id`) and compare the two
values — they must be identical.

Mismatch = **CRITICAL** — `ui5 build` names the output bundle incorrectly; the deployed BSP app shows a blank page.

---

## Section B — ABAP Frontend deploy (`ui5-deploy.yaml`)

**Guard: `ABAP_DEPLOY` only. For each `ui5-deploy.yaml` file found in the project.**

ABAP Frontend Server deploy uses the `deploy-to-abap` custom task in `ui5-deploy.yaml`.
A misconfigured file either fails silently or deploys to the wrong ABAP system.

### `customTasks` block with `deploy-to-abap`

```bash
grep -l "deploy-to-abap" $(find . -name "ui5-deploy.yaml" 2>/dev/null)
```

Missing `deploy-to-abap` task = **CRITICAL**. The `ui5 build --config ui5-deploy.yaml` command
will complete without error but nothing is deployed to ABAP.

Fix (add to `ui5-deploy.yaml`):
```yaml
customTasks:
  - name: deploy-to-abap
    afterTask: generateVersionInfo
    configuration:
      target:
        url:       https://<ABAP-HOST>
        client:    "100"
      app:
        name:      Z_MY_APP
        package:   ZMYPACKAGE
        transport: MYTRANSPORT
```

### Required fields — no placeholders

For each `ui5-deploy.yaml`, check that these fields are set to real values (not `<placeholder>`, `TODO`, or empty):

| Field | Where | Missing/placeholder = |
|---|---|---|
| `target.url` | `configuration.target.url` | CRITICAL |
| `app.name` | `configuration.app.name` | CRITICAL |
| `app.package` | `configuration.app.package` | CRITICAL |
| `app.transport` | `configuration.app.transport` | CRITICAL |

```bash
grep -E "url:|name:|package:|transport:" $(find . -name "ui5-deploy.yaml" 2>/dev/null) \
  | grep -E "<|TODO|^[[:space:]]*$"
```

Any match = CRITICAL — replace placeholders with the real ABAP system values.

### `dist/` in `.gitignore`

```bash
grep "dist" .gitignore 2>/dev/null || echo "dist/ not in .gitignore"
```

Missing = **WARNING** — built assets committed to git bloat the repository and can cause
`mbt build` conflicts. Add `dist/` to `.gitignore`.
