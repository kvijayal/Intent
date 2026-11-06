*Part of the cap-skill index. Load during code review (Cat 7) or after scaffolding to catch structural issues early.*

# Project Structure Grep Inventory

Run every applicable check from the project root with the **Grep / Glob / Read tools** (they never need a
permission prompt inside the workspace). Do not turn them into shell pipelines — loops, `awk`,
command substitution and multi-part `find` commands each need an approval under the plugin's scoped
permissions. Each check passes when it finds nothing; anything found is a finding.

---

## 1. Dead handler files (CAP_PRESENT)

`srv/*.js` files that are not registered as CDS service implementations are dead — they never run.

1. Glob `srv/*.js`.
2. A file `srv/<name>.js` is **live** when any of these holds:
   - `srv/<name>.cds` exists (CAP convention: `srv/x.js` implements `srv/x.cds`) — this also covers ESM
     `export default (srv) => …` hubs, which must not be flagged;
   - Grep over `srv/*.cds` finds `@impl` (or `impl:`) referencing `<name>`;
   - the file itself contains `cds.service.impl` or `extends cds.`.
3. Files under `srv/<sub-folder>/` (handlers, validators, util) are helpers imported by a live file — not part of this check.

**Pass:** every `srv/*.js` is live. Any other file = WARNING — register it with `cds.service.impl` or delete it.

---

## 2. Duplicate service definitions (CAP_PRESENT)

Two services with the same name cause CDS to silently use one and ignore the other.

Grep `^service\s+[\w.]+` in `srv/**/*.cds` (content mode) and compare the names.

**Pass:** every service name appears once. A name found twice = CRITICAL — merge or rename the duplicate service.

---

## 3. Fragment files outside `webapp/fragments/` (UI_PRESENT)

XML fragments placed outside the canonical `fragments/` folder break lazy-load resolution and BAS Page Map.

Glob `app/**/*.fragment.xml`.

**Pass:** every path contains `/fragments/`. Any other path = WARNING — move it to `webapp/fragments/`.

---

## 4. Duplicate UI control IDs (UI_PRESENT)

Duplicate IDs in the same view or fragment cause runtime errors and unpredictable data binding.

Grep `id="[^"]+"` (only-matching, content mode, with file names) in `app/*/webapp/view` and
`app/*/webapp/fragments`; compare the IDs **per file**.

**Pass:** no ID appears twice within one file. A repeated ID = CRITICAL — IDs must be unique per view scope.

---

## 5. Deprecated API inventory (UI_PRESENT)

Scans for removed/deprecated APIs that will fail on UI5 2.x or generate console warnings.

Grep `sap\.ui\.getCore|sap\.ui\.commons|ODataModel\b|jQuery\.ajax|\.then\(` in `app/*/webapp` (skip `node_modules`).

**Pass:** no match. Findings by pattern:

| Pattern | Severity | Fix |
|---|---|---|
| `sap.ui.getCore` | WARNING | Replace with `Core` import from `sap/ui/core/Core` |
| `sap.ui.commons.*` | CRITICAL | Replace with `sap.m.*` equivalent |
| `ODataModel\b` | CRITICAL | Replace with `sap.ui.model.odata.v4.ODataModel` |
| `jQuery.ajax` | CRITICAL | Remove — use `fetch()` or OData model |
| `.then(` | WARNING | Review for mixed async patterns (see `cap-async.md`) |

---

## 6. `package.json` cleanliness (always)

Flags known problem entries that cause non-reproducible builds or version confusion.

Grep `legacy-peer-deps|cds-plugin-ui5|exit_on_multi_install|"overrides"` in `package.json` and `.cdsrc.json`, then:

```bash
npm pkg get scripts.watch                 # a string → watch:OK      · {} → WARN: no plain watch script
npm pkg get devDependencies.@sap/cds-dk   # a range  → cds-dk:local  · {} → WARN: @sap/cds-dk not local
```

- `--legacy-peer-deps` in any script = WARNING — masks peer dependency conflicts; fix the conflict instead.
- `cds-plugin-ui5` in root `devDependencies` = expected for CAP-embedded Fiori ✅ — its **absence** for a CAP+Fiori project = WARNING (blank page on `cds watch`).
- `exit_on_multi_install` anywhere = **CRITICAL** — masks the P-04 `@sap/cds` dual-load fault instead of fixing it. It suppresses `process.exit(1)` but not the error message. Remove it and fix resolution (`CLAUDE.md` hard rule 5).
- `"overrides"` targeting `@sap/cds` = WARNING — a silent no-op, because `@sap/cds-dk` ships `@sap/cds` in `bundleDependencies` and npm cannot rewrite a bundled payload. Delete it.
- No plain `"watch"` script, or `@sap/cds-dk` absent from `devDependencies` = WARNING — forces bare `cds watch` through the global CLI, which is what triggers P-04 (`CLAUDE.md` hard rule 5).

---

## 7. Bootstrap config consistency (UI_PRESENT)

Catches mixed CDN/local UI5 bootstrap configuration that produces a blank page after deploy.

Grep `sap-ui-bootstrap|framework:` in `app/*/webapp/index.html` and `app/*/ui5.yaml`.

Rules:
- **CDN pattern** (recommended): `index.html` has CDN `src` URL → `ui5.yaml` must have **no** `framework:` block.
- **Local pattern**: `index.html` has relative `src` → `ui5.yaml` must have a full `framework:` block with `name`, `version`, and `libraries`.
- Never mix: CDN `src` + `framework:` block = double-load WARNING; relative `src` + no `framework:` = 404 on bootstrap CRITICAL.
