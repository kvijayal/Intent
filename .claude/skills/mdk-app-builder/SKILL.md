---
name: mdk-app-builder
description: >
  Use for all SAP MDK (Mobile Development Kit) development — page templates, action
  templates, rule patterns, offline OData, binding syntax, i18n, project operations, the
  MDK quality checklist, and the full JS rules reference (clientAPI, UpdateLinks). Trigger on:
  "create MDK page", "generate MDK action", "MDK CRUD", "MDK offline", "MDK rule", "MDK binding",
  "MDK deploy", "MDK validate", "MDK best practices", "ObjectTable", "FormCell", "clientAPI",
  "offline OData", "UploadOfflineOData". For SAP Asset Manager (SSAM) customize/upgrade/patch
  workflows, use the separate `mdk-ssam` skill instead — it covers the same quality checklist
  and rules reference too (see `references/quality-checklist.md`, `references/rules-reference.md`).
---

# MDK App Builder

MDK is metadata-driven: the app is defined in JSON files (pages, actions, rules).
No native mobile code. The MDK client interprets metadata at runtime on iOS and Android.

---

## References

| Reference File | When to use |
| --- | --- |
| [`references/pages.md`](references/pages.md) | List/Detail/Create page JSON templates, rules, FormCell-type selection table |
| [`references/actions.md`](references/actions.md) | CRUD action-set JSON templates, action chains, anti-patterns |
| [`references/offline.md`](references/offline.md) | Offline OData sync lifecycle, `DefiningRequests` patterns, anti-patterns |
| [`references/binding.md`](references/binding.md) | Binding syntax table, i18n key naming convention, anti-patterns |
| [`references/quality-checklist.md`](references/quality-checklist.md) | Non-negotiable rules for project structure, i18n, rules, offline, performance, security, code review — apply to every MDK file you write or modify, standalone app or SSAM |
| [`references/rules-reference.md`](references/rules-reference.md) | Full JS rule-writing reference — clientAPI proxy types and methods, 10 rule categories, `UpdateLinks`, rule-writing rules |

---

## Protected Files — Never Generate or Modify
- `.project.json` — managed by MDK toolchain
- `.service.metadata` — created via VS Code: `MDK: Open Mobile App Editor`
- `Services/*.xml` — never create XML in Services folder

---

## File Path Conventions

```
/AppName/Pages/EntityName/EntityName_List.page
/AppName/Actions/EntityName/EntityName_CreateEntity.action
/AppName/Rules/EntityName/EntityName_StatusColor.js
/AppName/Services/ServiceName.service
i18n/i18n.properties
```

`_Name` in every artifact must exactly match filename without extension.

---

## Project Operations (CLI)

```bash
# Validate schema — always first
npx @sap/mdk-tools validate --project <projectDir>

# Build bundle
npx @sap/mdk-tools build --target zip --project <projectDir>

# Deploy to Mobile Services (requires cf login --sso + .service.metadata)
npx @sap/mdk-tools deploy --target mobile --showqr --project <projectDir>

# Migrate schema version
npx @sap/mdk-tools migrate --project <projectDir>
```

QR code saved to `.build/qrcode.png` — open in VS Code Explorer to scan.

