---
name: launchpad-workzone
description: >
  SAP Fiori Launchpad and SAP Build Workzone integration for Intent2Code — tile configuration,
  semantic objects, navigation intents, sap.cloud.service wiring, xs-app.json scopes, and
  Launchpad Service deployment steps. Load when configuring an app to appear as a tile in
  the Launchpad or SAP Build Workzone, wiring cross-app navigation, or troubleshooting
  "app not found" / "tile missing" issues after deployment.
  Keywords: Launchpad, Workzone, tile, semantic object, navigation intent, inbound, crossNavigation,
  sap.cloud.service, xs-app.json, html5-apps-repo, SAP Build Workzone, Fiori Launchpad,
  FLP, navigation target, intent-based navigation.
---

# Fiori Launchpad & SAP Build Workzone

> Every deployed Intent2Code app must be registered as a Fiori tile to be reachable from a Launchpad.
> The registration lives in `manifest.json` (`crossNavigation`). The Launchpad reads it from the
> HTML5 Application Repository at runtime — no manual cockpit entry needed when `mta.yaml` is correct.
>
> For CAP projects `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>` (then
> `cd <app> && npm install`) writes all of it: `cds add workzone-standard` adds `sap.cloud` and the inbound to
> every app manifest, `xs-app.json`, and the `mta.yaml` content modules. Rerun it instead of hand-writing
> a missing piece. Both mta.yaml layouts (generated A, hand-written B) are valid —
> `deployment-validation` → `references/mta-layouts.md`.

---

## 1. Navigation intent — the fundamental concept

A Fiori tile is a **semantic navigation target**: `#SemanticObject-Action`.

| Part | Example | Rule |
|---|---|---|
| Semantic Object | `SalesOrder` | PascalCase noun; shared across apps that deal with the same business object |
| Action | `manage` / `display` / `create` / `approve` | camelCase verb |
| Combined intent | `#SalesOrder-manage` | This is what goes in the Launchpad tile and what other apps use for cross-app navigation |

The generated inbound (`<app folder>-display`, semantic object = app folder, e.g. `leaverequests-display`)
is valid as is. Rename it to a business-object semantic object only when other apps navigate to it.

---

## 2. `manifest.json` — `crossNavigation` block

This is the **only** place tile registration lives for html5-apps-repo deployed apps. `crossNavigation` goes into the `sap.app` section; `sap.cloud` is a separate top-level block.

```json
"sap.cloud": {
  "public": true,
  "service": "mycompany.salesorder"
},
"sap.app": {
  "id": "com.mycompany.salesorder",
  "type": "application",
  "title": "{{appTitle}}",
  "crossNavigation": {
    "inbounds": {
      "SalesOrder-manage": {
        "semanticObject": "SalesOrder",
        "action": "manage",
        "title": "{{tileTitle}}",
        "subTitle": "{{tileSubTitle}}",
        "icon": "sap-icon://sales-order",
        "signature": {
          "parameters": {},
          "additionalParameters": "allowed"
        }
      }
    }
  }
}
```

**Rules:**
- `sap.cloud.service` (the top-level `sap.cloud` block, `service` key) must be present and must match the `sap.cloud.service` value in the destinations content module in `mta.yaml` (`<id>-destinations` generated, `<id>-destination-content` hand-written) — mismatch means the HTML5 Runtime cannot link the app to its service instance.
- `inbounds` key (`"SalesOrder-manage"`) must be unique within the app's inbounds and conventionally matches `SemanticObject-action`.
- `icon`, when set, must be a valid `sap-icon://` URI — see [SAP Icon Explorer](https://sapui5.hana.ondemand.com/sdk/test-resources/sap/m/demokit/iconExplorer/webapp/index.html). The generated inbound has no `title` / `icon`; the tile then shows the app title.
- `signature.additionalParameters: "allowed"` is required to prevent the Launchpad from blocking unrecognised URL parameters passed by other apps.

---

## 3. `xs-app.json` — Launchpad scopes

When the app is served by the BTP HTML5 Application Runtime (html5-apps-repo pattern), the `xs-app.json` (generated at `app/<folder>/xs-app.json`) routes OData to the srv-api destination and everything else to the HTML5 repo, each with the correct `authenticationType`.

```json
{
  "welcomeFile": "/index.html",
  "authenticationMethod": "route",
  "scopes": {
    "read": "$XSAPPNAME.Viewer",
    "write": "$XSAPPNAME.Editor"
  },
  "routes": [
    {
      "source": "^/?odata/(.*)$",
      "target": "/odata/$1",
      "destination": "srv-api",
      "authenticationType": "xsuaa",
      "csrfProtection": true
    },
    {
      "source": "^(.*)$",
      "target": "$1",
      "service": "html5-apps-repo-rt",
      "authenticationType": "xsuaa"
    }
  ]
}
```

**Rules:**
- `scopes` block is optional for basic Launchpad integration but required when the Workzone Site uses role-based tile visibility — the scope names must match `xs-security.json`.
- The catch-all route (`^(.*)$`) with `service: html5-apps-repo-rt` is what the HTML5 Application Runtime uses to serve the app's static files — **never remove it**.
- `destination` in the OData route must exactly match the `Name` of the srv-api destination in `mta.yaml` — `srv-api` in the app deployer `parameters.config.destinations` (generated) or `<id>-srv-api` in the destination `init_data` (hand-written) (see `mta-reviewer` DS_XS1).
- The route matches the BUILT relative uri `odata/v4/<svc>/`: Work Zone serves the app below an app path, so a deployed absolute `/odata/...` uri misses it (404). The `relative-odata-uri` build task writes the relative form into the build; the source manifest keeps `/odata/v4/<svc>/` for `cds watch`.

---

## 4. SAP Build Workzone — deployment and site configuration

After `cf deploy` completes, the app appears in HTML5 Application Repository but is NOT yet visible in a Launchpad site. You must complete these steps in BTP Cockpit:

### Step 1 — Verify the app is in HTML5 Application Repository

BTP Cockpit → Subaccount → HTML5 Applications → confirm your app appears with the correct version.

### Step 2 — Add the app to a Workzone / Launchpad site

**Option A — SAP Build Workzone Standard Edition:**
1. Go to **SAP Build Workzone** → Site Manager.
2. Select your site (or create one).
3. Go to **Content Manager** → **Content Explorer** → **HTML5 Apps**.
4. Find your app (by `sap.app.id`) and click **Add to My Content**.
5. In **My Content**, assign the app to a **Group** (tile group) and a **Role** (role-based visibility).
6. Go back to **Site** → **Publish** the site.

**Option B — SAP Fiori Launchpad on BTP (managed):**
1. BTP Cockpit → Subaccount → Instances and Subscriptions → **Launchpad Service**.
2. Open Launchpad → **Content Manager** → **+ New** → **App**.
3. Select the app from HTML5 repo.
4. Set the navigation intent (must match `crossNavigation.inbounds` in `manifest.json`).
5. Assign to a **Group** and **Role**.

### Step 3 — Assign Role Collections

The Launchpad role controls tile visibility. The XSUAA role controls data access. Both must be assigned:

| Role Collection | Controls |
|---|---|
| `MyApp_Viewer` (XSUAA) | Whether the user can call the CAP OData service |
| Launchpad site role | Whether the tile is visible in the Launchpad |

Go to BTP Cockpit → Subaccount → Security → Users → assign both.

---

## 5. Cross-app navigation (calling another app by intent)

From within a Fiori Elements or Freestyle app, navigate to another app using the `CrossApplicationNavigation` service — never hardcode URLs.

```javascript
// Freestyle UI5 controller
const oCrossNavService = sap.ushell?.Container?.getServiceAsync("CrossApplicationNavigation");
if (oCrossNavService) {
  const oService = await oCrossNavService;
  oService.toExternal({
    target: { semanticObject: "SalesOrder", action: "display" },
    params: { ID: sOrderId }
  });
}
```

**Rules:**
- Always guard with `sap.ushell?.Container` — the shell container is only available when running inside a Launchpad.
- The target app must have a matching `crossNavigation.inbounds` entry with `semanticObject + action` and must accept the parameter via `signature.parameters` or `additionalParameters: "allowed"`.
- For Fiori Elements, use `UI.DataFieldForIntentBasedNavigation` annotation instead of controller code:

```cds
annotate MyService.Orders with @(
  UI.LineItem: [
    {
      $Type             : 'UI.DataFieldForIntentBasedNavigation',
      SemanticObject    : 'SalesOrder',
      Action            : 'display',
      Label             : 'Open in Sales App',
      RequiresContext   : true
    }
  ]
);
```

---

## 6. Troubleshooting — common tile / navigation failures

| Symptom | Root cause | Fix |
|---|---|---|
| Tile missing from Launchpad after deploy | App not added to site content or role not assigned | Complete Steps 2–3 in §4 |
| "App not found" on tile click | `sap.app.id` or navigation intent mismatch between manifest and Launchpad config | Verify `crossNavigation.inbounds` key matches the intent configured in Content Manager |
| 404 on app load after tile click | `xs-app.json` catch-all route missing or destination name mismatch | Check DS_XS1 rule in `mta-reviewer`; verify catch-all route in `xs-app.json` (generated at `app/<folder>/xs-app.json`) |
| App visible but OData calls fail (403) | XSUAA role collection not assigned | Assign the XSUAA Role Collection to the user in BTP Cockpit → Security → Users |
| `sap.cloud.service` error in HTML5 Runtime | `manifest.json` `sap.cloud.service` does not match the `sap.cloud.service` of the `mta.yaml` destinations content module | Align both to the same value (see `mta-reviewer` DC11) |
| App opens from the tile, every OData call returns 404 | The built manifest keeps the absolute `/odata/...` uri — the `relative-odata-uri` build task is missing (`deployment-validation` UY6) | `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`, then `cd <app> && npm install`, rebuild |
| Cross-app navigation does nothing | Running outside a Launchpad shell (`sap.ushell` not available) | Test inside the Fiori launchpad / SAP Build Work Zone shell; guard with `sap.ushell?.Container` check |

---

## 7. Checklist

- [ ] `crossNavigation.inbounds` added to `manifest.json` with correct `semanticObject` + `action`
- [ ] `sap.cloud.service` (top-level `sap.cloud` block) present and matches the `mta.yaml` destinations content module `sap.cloud.service`
- [ ] `xs-app.json` has catch-all route with `service: html5-apps-repo-rt`
- [ ] CAP apps: the UI build has the `relative-odata-uri` task (built uri relative) and the source manifest keeps `/odata/v4/<svc>/`
- [ ] After deploy: app added to Workzone site content and assigned to a Group + Role
- [ ] XSUAA Role Collection assigned to users (separate from Launchpad site role)
- [ ] Cross-app navigation uses `CrossApplicationNavigation` service or `UI.DataFieldForIntentBasedNavigation` — never hardcoded URLs
