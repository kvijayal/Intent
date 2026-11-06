---
name: sap-conventions
description: >
  Cross-cutting SAP conventions for Intent2Code — namespace consistency (the #1 failure), project/
  folder layout, naming, tech-stack defaults, and the <app>/ deliverable layout. Load before
  scaffolding, naming a project, or wiring a manifest. Keywords: namespace, resource-roots, ui5.yaml
  metadata.name, sap.app.id, folder layout, naming, conventions, output layout, tech stack.
---

# SAP Conventions (Intent2Code)

> **Running this skill's scripts:** always `node .claude/skills/sap-conventions/scripts/<script>.mjs …` from the workspace root (every
> Bash call starts there). Do **not** build the path from the absolute base directory shown when the skill loads —
> `node "C:/…/.claude/skills/…"` is not pre-approved and stops for an approval; the relative form is.

## The namespace rule (the #1 failure)
The identical namespace string must appear in all four places, and `ui5.yaml metadata.name` must be
all lowercase:

| Place | Field |
|---|---|
| `Component.(js\|ts)` | `extend("<ns>.Component")` / `@namespace <ns>` |
| `manifest.json` | `sap.app.id` |
| `index.html` | `data-sap-ui-resource-roots='{"<ns>": "./"}'` |
| `ui5.yaml` | `metadata.name` (lowercase) |

Run `mcp__intent2code__validate_namespace` after scaffolding or editing any of these.

## Tech-stack defaults
`@sap/cds ^9` · `@ui5/cli ^4.0.33` · `cds-plugin-ui5 ^0.17.0` · OData V4 · SAPUI5 on the `stack.json` `ui5.line` · theme
`sap_horizon` · `sap.m.*` controls · TypeScript for freestyle UI5 · CAP Node.js · dev run =
in-memory sqlite (CAP) / mock server (external/RAP).

## Stack versions — one file: `stack.json`

All CAP, UI5 and tooling versions live in **`<plugin-root>/stack.json`** — nowhere else. Builds,
checks and the docs read it; `stack.mjs` (in this skill's `scripts/`) applies it.

| You want to… | Edit in `stack.json` | Then run |
|---|---|---|
| Move the CAP stack (e.g. CDS 9 → 10) | `cap.cdsMajor` (drivers + Node come from `cap.compat`) | `stack.mjs apply <app>` → `stack.mjs clean <app> --node-modules` (guarded delete of `node_modules/` + `gen/`) → `npm install` |
| Change the UI5 release line (e.g. 1.136 → 1.148 LTS) | `ui5.line` (newest verified patch is resolved automatically) | `stack.mjs apply <app>` |
| Pin an exact UI5 patch | `ui5.pin` (verified on the CDN; a non-existent patch is rejected) | `stack.mjs apply <app>` |
| Change a tooling range (`@ui5/cli`, `typescript`, …) | `packages.app` / `packages.root` | `stack.mjs apply <app>` → `npm install` |
| Bump the plugin version | `plugin.version` | the release script of the maintainer kit (not part of the plugin) |

```bash
# always from the workspace root (the folder that contains .claude/);
# if the shell may be elsewhere: cd "<workspace root>" && node .claude/skills/sap-conventions/scripts/stack.mjs …
node .claude/skills/sap-conventions/scripts/stack.mjs resolve            # what the next build will use (UI5 patch resolved + verified)
node .claude/skills/sap-conventions/scripts/stack.mjs check <app>        # drift report (also static check 6); exit 1 on FAIL
node .claude/skills/sap-conventions/scripts/stack.mjs apply <app>        # re-pin an existing app (value edits only; review.lock respected)
node .claude/skills/sap-conventions/scripts/stack.mjs clean <app>        # guarded delete of gen/ (--node-modules: also node_modules/ + app/*/node_modules/)
node .claude/skills/sap-conventions/scripts/stack.mjs sync-docs          # maintainer: regenerate version tables/snippets in the docs
node .claude/skills/sap-conventions/scripts/stack.mjs lint               # maintainer: fail on stray version literals
```

A new CDS major needs a `cap.compat["<major>"]` entry first (check with
`npm view @cap-js/sqlite@<n> peerDependencies`). Offline, UI5 resolves from the cache or
`stack.lock.json`; it is never guessed.

## Output layout
Each app lands under `<app-name>/` at the project root with a deliverables subfolder so hand-over
docs never ship inside the build: `<app-name>/` (runnable code; `gen/`, `node_modules/` are
git-ignored) and `<app-name>/deliverables/` (markdown deliverables).

## References
- Full conventions → [`references/conventions.md`](references/conventions.md)
- Bootstrapping notes → [`references/bootstrapping.md`](references/bootstrapping.md)
