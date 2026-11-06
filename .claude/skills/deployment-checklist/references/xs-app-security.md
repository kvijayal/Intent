*Part of the deployment-checklist skill.*

# xs-app.json — Security and Route Configuration

The app `xs-app.json` is the security perimeter for the deployed app. Misconfiguration
here is the most common source of post-deploy security vulnerabilities and routing 404s.
There is no standalone approuter: the BTP HTML5 Application Runtime reads the file from the app zip.
For CAP projects `deploy-config.mjs` generates it (`app/<folder>/xs-app.json`, packaged by the zipper
`additionalFiles`); a hand-written copy may sit in `app/<folder>/webapp/`. Both pass —
`deployment-validation` → `references/mta-layouts.md`. A missing or incomplete generated file is fixed by
`node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>`, then `cd <app> && npm install`.

---

## Complete annotated `xs-app.json`

```json
{
  "welcomeFile": "/index.html",
  "authenticationMethod": "route",

  "routes": [

    // ── OData route for the CAP service (what deploy-config.mjs generates) ───
    // Matches the BUILT relative uri odata/v4/<svc>/ written by the relative-odata-uri task
    {
      "source": "^/?odata/(.*)$",
      "target": "/odata/$1",
      "destination": "srv-api",
      "authenticationType": "xsuaa",
      "csrfProtection": true
    },

    // ── OData route for RAP / external S/4 service ───────────────────────────
    {
      "source": "^/sap/opu/odata4/sap/myservice/(.*)$",
      "target": "/sap/opu/odata4/sap/myservice/$1",
      "destination": "S4HANA_PROD",
      "authenticationType": "xsuaa",
      "csrfProtection": true
    },

    // ── Catch-all: serve UI from HTML5 repo ─────────────────────────────────
    {
      "source": "^(.*)$",
      "target": "$1",
      "service": "html5-apps-repo-rt",
      "authenticationType": "xsuaa"
    }
  ]
}
```

---

## Security rules — each is a potential finding

### `allowedOrigins` — NEVER use `"*"`

The generated app `xs-app.json` has no `allowedOrigins` — its absence is not a finding. When a file
does set it:

```json
// CRITICAL security violation
{ "allowedOrigins": ["*"] }

// Correct — restrict to the exact deployed domain
{ "allowedOrigins": ["https://myapp-approuter.cfapps.eu10.hana.ondemand.com"] }
```

`"*"` allows any website to make cross-origin authenticated requests through the approuter
using the user's active session. If the app is accessed from multiple origins (custom domain +
CF default domain), list all of them explicitly.

---

### `csrfProtection` — required on all write-capable routes

```json
// Missing — CSRF attacks can modify data via cross-site requests
{ "source": "^/?odata/(.*)$", "destination": "..." }

// Correct
{ "source": "^/?odata/(.*)$", "destination": "...",
  "csrfProtection": true }
```

`csrfProtection: true` makes the approuter require a CSRF token header on non-safe HTTP methods
(POST, PUT, PATCH, DELETE). Fiori Elements and the OData V4 model request and send this token
automatically. Set `csrfProtection: false` only on truly read-only routes.

---

### `authenticationType` — every route must declare it

```json
// Missing — defaults vary by approuter version; always set explicitly
{ "source": "^/?odata/(.*)$", "destination": "..." }

// Options:
// "xsuaa"  — user must be logged in (most routes)
// "none"   — public (only for static resources, health endpoints)
```

A route without `authenticationType: "xsuaa"` may bypass login in some approuter versions.

---

### Route ordering — most specific first

The approuter matches routes top-to-bottom and stops at the first match:

1. Specific API routes (OData paths) first.
2. Static resource routes before the catch-all.
3. The HTML5 repo catch-all (`^(.*)$`) must always be **last**.

```json
// WRONG — catch-all before API route swallows all OData calls
{ "source": "^(.*)$", "service": "html5-apps-repo-rt" },
{ "source": "^/?odata/(.*)$", "destination": "..." }

// CORRECT
{ "source": "^/?odata/(.*)$", "destination": "..." },
{ "source": "^(.*)$", "service": "html5-apps-repo-rt" }
```

---

### Destination name consistency

The `destination` value in each route must exactly match the BTP subaccount destination name —
it is case-sensitive and must match in `xs-app.json`, `ui5.yaml` proxy config, and the subaccount.
For the CAP service the destination is defined in `mta.yaml`: `srv-api` in the app deployer
`parameters.config.destinations` (generated layout A) or `<id>-srv-api` in the destination resource
`init_data` (hand-written layout B).
A mismatch causes 502 Bad Gateway after deploy with no clear error in the Fiori UI.

---

## Route cross-check against manifest dataSources

Every `dataSources` entry in `manifest.json` must have a matching route. The route matches the BUILT
uri: for a CAP app the source manifest keeps `/odata/v4/myservice/` (`cds watch`), the `relative-odata-uri`
build task writes `odata/v4/myservice/` into the built app, and `^/?odata/(.*)$` covers both forms:

```json
// manifest.json
"dataSources": {
  "mainService": {
    "uri": "/odata/v4/myservice/",
    "type": "OData",
    "settings": { "odataVersion": "4.0" }
  }
}
```

```json
// xs-app.json — source regex must cover the manifest uri
{ "source": "^/?odata/(.*)$", ... }
```

---

## Troubleshooting post-deploy

| Symptom | Most likely cause |
|---|---|
| 401 on all OData calls | XSUAA not bound to CAP srv module in mta.yaml |
| 502 Bad Gateway on OData | Destination not found — name mismatch or destination service not bound |
| 404 on all app routes | App deployer failed, or `HTML5Runtime_enabled: true` missing |
| 404 on every OData call in SAP Build Work Zone, app works with `cds watch` | Built manifest keeps the absolute `/odata/...` uri — the `relative-odata-uri` build task is missing (regenerate with deploy-config.mjs) |
| CSRF token mismatch error | `csrfProtection: false` on a write route |
| Login loop after deploy | xsuaa service key missing in the destinations content module, or `xs-security.json` scope mismatch |
| CORS error in browser console | `allowedOrigins` missing the origin the browser is calling from |
