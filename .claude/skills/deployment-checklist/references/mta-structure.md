*Part of the deployment-checklist skill.*

# MTA Structure — Required Modules and Resources

A complete, annotated `mta.yaml` for a CAP + Fiori app deployed on Cloud Foundry / BTP.
Use this as the canonical reference; compare the app `mta.yaml` against it during review.

This is layout A, the file `node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>` generates
(`cds add mta,workzone-standard` plus the plugin additions; `mbt build -p cf` verified). Hand-written
projects (layout B, srv-api destination in the destination resource `init_data`) are equally valid:
`deployment-validation` → `references/mta-layouts.md` maps every rule to where it lives in either layout.
No standalone approuter module in either layout (hard rule 2).

Never hand-write this file. A missing or incomplete `mta.yaml` in a CAP project is fixed by:

```bash
node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app>
cd <app> && npm install
```

---

## Complete `mta.yaml` (CAP + Fiori Elements, XSUAA auth) — layout A

Example values: `ID: leave-app`, one UI app in `app/leaverequests`. `cds add` writes the schema version
unquoted (`3.3.0`); quoted and unquoted are equal.

```yaml
_schema-version: "3.3.0"
ID: leave-app
version: 1.0.0
description: "leave-app — SAP CAP service with SAP Fiori UI"   # deploy-config.mjs replaces the cds add placeholder
parameters:
  enable-parallel-deployments: true   # modules deploy in parallel where deps allow
  deploy_mode: html5-repo
build-parameters:
  before-all:
    - builder: custom
      commands:
        - npm ci                                    # installs the root AND every workspace app under app/
        - npm exec --no -- cds build --production   # local @sap/cds-dk only, never downloads
modules:
  # ── 1. CAP service (Node.js) ────────────────────────────────────────────────
  - name: leave-app-srv
    type: nodejs
    path: gen/srv               # produced by the before-all cds build
    parameters:
      instances: 1
      buildpack: nodejs_buildpack
      # optional: memory, health-check-type: http + health-check-http-endpoint: /health
    build-parameters:
      builder: npm-ci
    provides:
      - name: srv-api
        properties:
          srv-url: ${default-url}
          forwardAuthToken: true   # hard rule 3 (added by deploy-config.mjs)
    requires:
      - name: leave-app-auth       # xsuaa: validate JWT tokens
      - name: leave-app-db         # HANA HDI container
      - name: leave-app-destination

  # ── 2. SAP HANA DB deployer ────────────────────────────────────────────────
  - name: leave-app-db-deployer
    type: hdb
    path: gen/db
    parameters:
      buildpack: nodejs_buildpack
    requires:
      - name: leave-app-db

  # ── 3. App deployer: uploads the app zips, holds the srv-api destination ───
  - name: leave-app-app-deployer
    type: com.sap.application.content
    path: gen
    build-parameters:
      build-result: app/
      requires:
        - name: leaveappleaverequests
          artifacts:
            - leaverequests.zip    # = ui5-task-zipper archiveName in app/leaverequests/ui5.yaml + .zip
          target-path: app/
    requires:
      - name: leave-app-auth
      - name: srv-api              # needed for ~{srv-api/srv-url} below
      - name: leave-app-html5-repo-host
        parameters:
          content-target: true
          config:
            HTML5Runtime_enabled: true
    parameters:
      config:
        destinations:
          - Name: srv-api          # = xs-app.json OData route destination
            URL: ~{srv-api/srv-url}
            Authentication: NoAuthentication
            Type: HTTP
            ProxyType: Internet
            HTML5.ForwardAuthToken: true
            HTML5.DynamicDestination: true

  # ── 4. HTML5 module (the Fiori app itself, one per app under app/) ─────────
  - name: leaveappleaverequests    # <ID without dashes><app folder>
    type: html5
    path: app/leaverequests
    build-parameters:
      build-result: dist
      builder: custom
      commands:                    # workspace app (root "workspaces": ["app/*"]): no own npm ci, the
        - npm run build            # before-all npm ci installs it · ui5 build preload: relative-odata-uri + ui5-task-zipper
      supported-platforms:
        []

  # ── 5. Destinations content: html5 repo + xsuaa service-key destinations ───
  - name: leave-app-destinations
    type: com.sap.application.content
    requires:
      - name: leave-app-auth
        parameters:
          service-key:
            name: leave-app-auth-key
      - name: leave-app-html5-repo-host
        parameters:
          service-key:
            name: leave-app-html5-repo-host-key
      - name: srv-api
      - name: leave-app-destination
        parameters:
          content-target: true
    build-parameters:
      no-source: true
    parameters:
      content:
        instance:
          existing_destinations_policy: update   # never fail or ignore
          destinations:
            - Name: leave-app-html5-repository
              ServiceInstanceName: leave-app-html5-repo-host   # = service-name of the resource
              ServiceKeyName: leave-app-html5-repo-host-key
              sap.cloud.service: leaveapp.service             # = manifest sap.cloud.service
            - Name: leave-app-auth
              Authentication: OAuth2UserTokenExchange
              ServiceInstanceName: leave-app-auth
              ServiceKeyName: leave-app-auth-key
              sap.cloud.service: leaveapp.service

resources:
  # ── XSUAA (authentication + authorization) ─────────────────────────────────
  - name: leave-app-auth
    type: org.cloudfoundry.managed-service
    parameters:
      service: xsuaa
      service-name: leave-app-auth          # explicit (added by deploy-config.mjs)
      service-plan: application
      path: ./xs-security.json              # scopes/role-templates must match CDS @restrict roles
      config:                               # overrides only, not an inline xs-security.json
        xsappname: leave-app-${org}-${space}
        tenant-mode: dedicated
        oauth2-configuration:
          credential-types:
            - "binding-secret"
            - "x509"
  # ── SAP HANA Cloud HDI container (no service-name: nothing references it) ──
  - name: leave-app-db
    type: com.sap.xs.hdi-container
    parameters:
      service: hana
      service-plan: hdi-shared
  # ── Destination service (no init_data in layout A) ─────────────────────────
  - name: leave-app-destination
    type: org.cloudfoundry.managed-service
    parameters:
      service: destination
      service-name: leave-app-destination
      service-plan: lite
    requires:
      - name: srv-api

  # ── HTML5 Application Repository — host (stores the built UI) ──────────────
  - name: leave-app-html5-repo-host
    type: org.cloudfoundry.managed-service
    parameters:
      service: html5-apps-repo
      service-name: leave-app-html5-repo-host
      service-plan: app-host

  # ── Connectivity service (on-premise via Cloud Connector) ──────────────────
  # Add ONLY if the app calls on-premise systems via Cloud Connector
  # - name: leave-app-connectivity
  #   type: org.cloudfoundry.managed-service
  #   parameters:
  #     service: connectivity
  #     service-name: leave-app-connectivity
  #     service-plan: lite
```

The UI side of the same app: `app/leaverequests/xs-app.json` routes `^/?odata/(.*)$` to the `srv-api`
destination; `app/leaverequests/ui5.yaml` carries `relative-odata-uri` and `ui5-task-zipper`
(`deployment-validation` → `references/mta-layouts.md` § the data source URI).

---

## Common omissions and their runtime symptoms

| Missing | Symptom after deploy | Fix |
|---|---|---|
| `xsuaa` not bound to `*-srv` | Every OData call returns 401 (token not validated) | Add `- name: myapp-auth` to `*-srv` requires |
| `forwardAuthToken: true` on srv-api `provides`, or `HTML5.ForwardAuthToken: true` on the srv-api destination | Every OData call returns 403 even with a valid user token (hard rule 3) | Regenerate (deploy-config.mjs) |
| `HTML5Runtime_enabled: true` (layout A: app deployer html5 repo host entry; layout B: destination resource) | The HTML5 Application Runtime cannot resolve the srv-api destination → OData 404 / 502 | Regenerate |
| `destination` resource absent | Destination name cannot be resolved → 502 Bad Gateway | Regenerate |
| `html5-apps-repo` host or the app deployer missing | UI files never pushed → 404 on all app routes | Regenerate |
| `relative-odata-uri` build task missing on a CAP UI app | App loads in SAP Build Work Zone, every OData call 404 (the absolute uri loses the app path) | Regenerate, then `npm install` |
| `build-result: dist` missing on HTML5 module | `mbt build` packages empty zip → blank app | Verify `npm run build` outputs to `dist/` |

---

## Consume-only variant (no CAP backend)

When the app binds to an external RAP / OData service and has no CAP service, drop modules 1
and 2 entirely. There is no CAP root, so deploy-config.mjs does not apply (exit 2): start from
`deployment-validation` → `references/deployment-templates.md` without the srv module and the srv-api
destination. `xs-app.json` routes the service path to the subaccount destination of the external service:

```yaml
modules:
  - name: myapp-app-deployer   # app deployer, without srv-api and without config.destinations
  - name: myappui              # html5 module
  - name: myapp-destinations   # destinations content module (html5 repo + xsuaa)

resources:
  - name: myapp-auth           # xsuaa still needed for user login
  - name: myapp-destination    # destination service; the external destination lives in the subaccount
  - name: myapp-html5-repo-host
  # no hdi container, no connectivity unless on-premise
```

---

## Build and deploy commands

Intent2Code never runs cf deploy — the developer does.

```bash
# Build the MTA archive
mbt build

# Deploy to CF (target space must be set with cf target -o <org> -s <space>)
cf deploy mta_archives/myapp_1.0.0.mtar --retries 0

# Update an existing XSUAA instance after xs-security.json change (do NOT recreate — loses role assignments)
cf update-service myapp-auth -c xs-security.json
```
