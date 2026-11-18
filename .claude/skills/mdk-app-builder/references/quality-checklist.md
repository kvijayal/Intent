# MDK Quality Checklist

*Part of the `mdk-app-builder` skill. Apply automatically during ANY MDK development task —
creating a new app, modifying an existing project, SSAM customization, or SSAM upgrade (see the
`mdk-ssam` skill for those workflows). NOT just for when someone asks about best practices — apply
this checklist whenever writing or modifying any MDK file. Source: Intent2App — MDK quality
standards.*

These rules apply to ALL MDK development — standalone apps, SSAM customizations,
and SSAM upgrades. Check every generated or modified file against this list.

---

## Project structure rules

- One folder per entity: `Pages/WorkOrders/`, `Rules/WorkOrders/`, `Actions/WorkOrders/`
- Filename must match `_Name` property exactly: `WorkOrders_List.page` → `"_Name": "WorkOrders_List"`
- Never put all pages/rules in the root folder — always use entity subfolders
- Never hardcode strings — every user-visible string goes in `i18n/i18n.properties`

---

## i18n rules

- Every label, caption, title, placeholder, and message → `$(L,keyName)`
- Key format: `EntityName_fieldDescription` e.g. `WorkOrders_StatusLabel`
- Never use `$(L,key)` in rule files — only in metadata `.page`/`.action` files
- Add key to ALL `i18n_*.properties` files when adding to `i18n.properties`

---

## Rule file rules

- Always `export default function FunctionName(clientAPI)` — named export, named function
- Never use `console.log` in production rules — use `Logger` if available
- Always handle Promise rejections — every `.then()` needs a `.catch()`
- Never access `clientAPI.binding` without null check when binding may be absent
- Import paths: use relative paths from the rule file location to SAPAssetManager

```javascript
// Correct
export default function WorkOrders_IsVisible(clientAPI) {
  const binding = clientAPI.binding;
  if (!binding) return false;
  return binding.Status !== 'CLSD';
}
```

---

## Offline rules

- Never call OData directly in a rule if the app is offline-capable — use `clientAPI.read()`
- Always use `DefiningRequests` for data the offline store needs
- Test sync with poor connectivity — not just happy path
- Never assume data is fresh — check `clientAPI.binding` for stale state

---

## Performance rules

- Avoid `evaluateTargetPath` in loops — cache the result
- Never fetch large entity sets without `$top` / `$filter` limits
- Use `$expand` to fetch related data in one call instead of multiple reads
- Minimize rules on `OnLoaded` — defer heavy work to user action
- Paginate all lists with `$top` (e.g. `$top=20&$orderby=Name asc`); use `$select` on list pages to
  limit payload to what the `ObjectCell` displays — load the full entity only on detail pages
- Use `MinimumCharacterThreshold: 3` on `Search` so a query doesn't fire on every keystroke
- Return early from rules when data is missing (e.g. `if (!clientAPI.binding) return '#6A6D70';`)
- Never call `clientAPI.read()` in a rule that runs per-row (`ObjectCell` bindings) — that fires one
  OData read per row in the list. Read once in `OnLoaded`, or bind directly (`"StatusText": "{Status}"`)

---

## Security rules

- Never hardcode credentials, tokens, or URLs in rule files
- Always use Mobile Services destinations — never hardcode backend URLs
- Validate input in rules before sending to OData — never trust UI values blindly
- Never store sensitive data in `clientData` or `AppSettings` — `AppSettings` (NativeScript)
  persists to device storage; don't put passwords, tokens, or PII in `appSettingsModule.setString()`
- Rely on SAP Mobile Services for authentication (SSO, OAuth, passcode) — never implement custom
  auth in rules; use a `VerifyPasscode` action before sensitive operations
- OData service destinations are defined in SAP Mobile Services and referenced by destination name
  — never hardcode URLs, credentials, or tokens in metadata files

---

## Code review checklist — before every commit

**Metadata**
- [ ] Every new file has correct `_Name` matching filename (no extension)
- [ ] Every OData action has `OnSuccess` and `OnFailure`
- [ ] `OnFailure` shows `{{#ActionResults:name/#Property:error}}`
- [ ] Delete operations preceded by a `Message` confirmation dialog
- [ ] Create/Edit navigation uses `ModalPage: true, ModalPageFullscreen: true`
- [ ] All list pages have `Search` enabled and `EmptySection` set
- [ ] All detail pages start with `ObjectHeader` and have `DataSubscriptions`
- [ ] No hardcoded strings — all user-visible text uses `{i18n>Key}`
- [ ] `$top` set on all ObjectTable QueryOptions

**Rules**
- [ ] All rule files export default named function
- [ ] All rules return a value or Promise
- [ ] All `.catch()` blocks log the error and return a safe default
- [ ] No `async/await` — Promise chains only
- [ ] ListPicker rules return `[{ ReturnValue, DisplayValue }]`
- [ ] No OData reads inside per-row bindings

**Offline (if applicable)**
- [ ] Upload before every Create/Update/Delete; Download chained after Upload success
- [ ] `ShowActivityIndicator: true` on Initialize, Upload, Download
- [ ] `DefiningRequests` filtered — not syncing full unfiltered entity sets

**i18n**
- [ ] All keys referenced in metadata exist in `i18n.properties`; no orphaned keys

**SSAM-specific**
- [ ] No files written to `SAPAssetManager/`
- [ ] Every new SSAM rule has a CIM entry

**Before deploy**
- [ ] `npx @sap/mdk-tools validate --project .` (or `mdk-manage validate`) → 0 errors
- [ ] Tested on both iOS and Android targets
