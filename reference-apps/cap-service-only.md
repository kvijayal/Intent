# Reference App: `cap-service-only`

**Type:** CAP OData V4 backend — no UI layer  
**Purpose:** Minimal CAP service exposing an OData V4 endpoint. Use when the TDD calls for an API-only service or when a UI is built separately.  
**Run locally:** `npm install && npm start` → `http://localhost:4004`

---

## Project Structure

```text
cap-service-only/
├── package.json
├── mta.yaml
├── eslint.config.mjs
├── .gitignore
├── db/
│   ├── schema.cds
│   ├── data/
│   │   └── my.bookshop-Books.csv
│   └── src/
│       └── .hdiconfig
│   └── undeploy.json
├── srv/
│   └── cat-service.cds
└── .vscode/
    ├── extensions.json
    ├── launch.json
    └── tasks.json
```

---

## File Contents

### `package.json`

```json
{
  "name": "cap-service-only",
  "version": "1.0.0",
  "description": "A simple CAP project.",
  "dependencies": {
    "@cap-js/hana": "^2",
    "@sap/cds": "^9",
    "express": "^4"
  },
  "devDependencies": {
    "@cap-js/sqlite": "^2",
    "@sap/cds-dk": "^9"
  },
  "scripts": {
    "start": "cds-serve",
    "watch": "cds watch"
  },
  "private": true,
  "cds": {}
}
```

---

### `mta.yaml`

```yaml
_schema-version: "3.3"
ID: cap-service-only
version: 1.0.0
description: "A simple CAP project."
parameters:
  enable-parallel-deployments: true
build-parameters:
  before-all:
    - builder: custom
      commands:
        - npm ci
        - npm exec --no -- cds build --production
modules:
  - name: cap-service-only-srv
    type: nodejs
    path: gen/srv
    parameters:
      instances: 1
      buildpack: nodejs_buildpack
    build-parameters:
      builder: npm-ci
    provides:
      - name: srv-api
        properties:
          srv-url: ${default-url}
    requires:
      - name: cap-service-only-db

  - name: cap-service-only-db-deployer
    type: hdb
    path: gen/db
    parameters:
      buildpack: nodejs_buildpack
    requires:
      - name: cap-service-only-db

resources:
  - name: cap-service-only-db
    type: com.sap.xs.hdi-container
    parameters:
      service: hana
      service-plan: hdi-shared
```

---

### `eslint.config.mjs`

```js
import cds from '@sap/cds/eslint.config.mjs'
export default [ ...cds.recommended ]
```

---

### `.gitignore`

```gitignore
# CAP cap-service-only
_out
*.db
*.sqlite
connection.properties
default-*.json
.cdsrc-private.json
gen/
node_modules/
target/

# Web IDE, App Studio
.che/
.gen/

# MTA
*_mta_build_tmp
*.mtar
mta_archives/

# Other
.DS_Store
*.orig
*.log

*.iml
*.flattened-pom.xml

# IDEs
# .vscode
# .idea

# @cap-js/cds-typer
@cds-models
```

---

### `db/schema.cds`

```cds
namespace my.bookshop;

entity Books {
  key ID    : Integer;
      title : String;
      stock : Integer;
}
```

---

### `db/data/my.bookshop-Books.csv`

```csv
ID,title,stock
1,Wuthering Heights,100
2,Jane Eyre,500
```

---

### `db/src/.hdiconfig`

```json
{
  "file_suffixes": {
    "csv":                      { "plugin_name": "com.sap.hana.di.tabledata.source" },
    "hdbafllangprocedure":      { "plugin_name": "com.sap.hana.di.afllangprocedure" },
    "hdbanalyticprivilege":     { "plugin_name": "com.sap.hana.di.analyticprivilege" },
    "hdbcalculationview":       { "plugin_name": "com.sap.hana.di.calculationview" },
    "hdbcollection":            { "plugin_name": "com.sap.hana.di.collection" },
    "hdbconstraint":            { "plugin_name": "com.sap.hana.di.constraint" },
    "hdbdropcreatetable":       { "plugin_name": "com.sap.hana.di.dropcreatetable" },
    "hdbflowgraph":             { "plugin_name": "com.sap.hana.di.flowgraph" },
    "hdbfunction":              { "plugin_name": "com.sap.hana.di.function" },
    "hdbgraphworkspace":        { "plugin_name": "com.sap.hana.di.graphworkspace" },
    "hdbhadoopmrjob":           { "plugin_name": "com.sap.hana.di.virtualfunctionpackage.hadoop" },
    "hdbindex":                 { "plugin_name": "com.sap.hana.di.index" },
    "hdblibrary":               { "plugin_name": "com.sap.hana.di.library" },
    "hdbmigrationtable":        { "plugin_name": "com.sap.hana.di.table.migration" },
    "hdbprocedure":             { "plugin_name": "com.sap.hana.di.procedure" },
    "hdbprojectionview":        { "plugin_name": "com.sap.hana.di.projectionview" },
    "hdbprojectionviewconfig":  { "plugin_name": "com.sap.hana.di.projectionview.config" },
    "hdbreptask":               { "plugin_name": "com.sap.hana.di.reptask" },
    "hdbresultcache":           { "plugin_name": "com.sap.hana.di.resultcache" },
    "hdbrole":                  { "plugin_name": "com.sap.hana.di.role" },
    "hdbroleconfig":            { "plugin_name": "com.sap.hana.di.role.config" },
    "hdbsearchruleset":         { "plugin_name": "com.sap.hana.di.searchruleset" },
    "hdbsequence":              { "plugin_name": "com.sap.hana.di.sequence" },
    "hdbstatistics":            { "plugin_name": "com.sap.hana.di.statistics" },
    "hdbstructuredprivilege":   { "plugin_name": "com.sap.hana.di.structuredprivilege" },
    "hdbsynonym":               { "plugin_name": "com.sap.hana.di.synonym" },
    "hdbsynonymconfig":         { "plugin_name": "com.sap.hana.di.synonym.config" },
    "hdbsystemversioning":      { "plugin_name": "com.sap.hana.di.systemversioning" },
    "hdbtable":                 { "plugin_name": "com.sap.hana.di.table" },
    "hdbtabledata":             { "plugin_name": "com.sap.hana.di.tabledata" },
    "hdbtabletype":             { "plugin_name": "com.sap.hana.di.tabletype" },
    "hdbtrigger":               { "plugin_name": "com.sap.hana.di.trigger" },
    "hdbview":                  { "plugin_name": "com.sap.hana.di.view" },
    "hdbvirtualfunction":       { "plugin_name": "com.sap.hana.di.virtualfunction" },
    "hdbvirtualfunctionconfig": { "plugin_name": "com.sap.hana.di.virtualfunction.config" },
    "hdbvirtualpackagehadoop":  { "plugin_name": "com.sap.hana.di.virtualpackage.hadoop" },
    "hdbvirtualpackagesparksql":{ "plugin_name": "com.sap.hana.di.virtualpackage.sparksql" },
    "hdbvirtualprocedure":      { "plugin_name": "com.sap.hana.di.virtualprocedure" },
    "hdbvirtualprocedureconfig":{ "plugin_name": "com.sap.hana.di.virtualprocedure.config" },
    "hdbvirtualtable":          { "plugin_name": "com.sap.hana.di.virtualtable" },
    "hdbvirtualtableconfig":    { "plugin_name": "com.sap.hana.di.virtualtable.config" },
    "properties":               { "plugin_name": "com.sap.hana.di.tabledata.properties" },
    "tags":                     { "plugin_name": "com.sap.hana.di.tabledata.properties" },
    "txt":                      { "plugin_name": "com.sap.hana.di.copyonly" },
    "hdbeshconfig":             { "plugin_name": "com.sap.hana.di.eshconfig" }
  }
}
```

---

### `db/undeploy.json`

```json
[
  "src/gen/**/*.hdbview",
  "src/gen/**/*.hdbindex",
  "src/gen/**/*.hdbconstraint",
  "src/gen/**/*_drafts.hdbtable",
  "src/gen/**/*.hdbcalculationview"
]
```

---

### `srv/cat-service.cds`

```cds
using my.bookshop as my from '../db/schema';

service CatalogService {
    @readonly entity Books as projection on my.Books;
}
```

Service path at runtime: `/odata/v4/catalog/`

---

### `.vscode/extensions.json`

```json
{
  "recommendations": [
    "SAPSE.vscode-cds",
    "dbaeumer.vscode-eslint",
    "mechatroner.rainbow-csv",
    "qwtel.sqlite-viewer",
    "humao.rest-client"
  ],
  "unwantedRecommendations": []
}
```

---

### `.vscode/launch.json`

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "cds serve",
      "request": "launch",
      "type": "node",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["exec", "--no", "--", "cds", "serve", "--with-mocks", "--in-memory?"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

---

### `.vscode/tasks.json`

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "shell",
      "label": "cds watch",
      "command": "npm",
      "args": ["run", "watch"],
      "options": { "cwd": "${workspaceFolder}" },
      "group": { "kind": "build", "isDefault": true },
      "problemMatcher": []
    },
    {
      "type": "shell",
      "label": "cds serve",
      "command": "npm",
      "args": ["exec", "--no", "--", "cds", "serve", "--with-mocks", "--in-memory?"],
      "options": { "cwd": "${workspaceFolder}" },
      "problemMatcher": []
    }
  ]
}
```

`options.cwd` is **not** optional. Without it a VS Code task inherits the workspace-root folder;
in a multi-project workspace that folder has no `@sap/cds`, so `cds-dk` falls back to the global
install's `node_modules` and you get the P-04 dual-load error. If this project is opened inside a
parent workspace, change the value to `${workspaceFolder}/<project-folder>`. Both tasks go
through the project-local CLI (`npm run` / `npm exec --no`) rather than a bare `cds` — see `CLAUDE.md`
hard rule 5.

---

## Runtime Behaviour

| Mode | Command | Database | URL |
| --- | --- | --- | --- |
| Development | `npm start` | SQLite in-memory | `http://localhost:4004` |
| Production | `cf deploy` via `mbt build` | HANA Cloud | BTP URL |

**OData endpoint:** `GET http://localhost:4004/odata/v4/catalog/Books`  
**Metadata:** `GET http://localhost:4004/odata/v4/catalog/$metadata`
