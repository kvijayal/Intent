---
description: >
  End-to-end SAP BTP build from a Functional Design or requirement — Clean Core analysis, interactive
  architecture (asks you at every decision gate), Technical Design Document, code generation, review,
  and Unit Testing Document. Deliverables land under <app>/deliverables/ (markdown).
argument-hint: "<path-to-FD-file | one-line requirement>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, Skill, Agent, TodoWrite, mcp__intent2code__scaffold_app, mcp__intent2code__add_cds_entity, mcp__intent2code__generate_annotations, mcp__intent2code__gen_mock_from_edmx, mcp__intent2code__configure_service, mcp__intent2code__patch_manifest, mcp__intent2code__validate_namespace, mcp__intent2code__run_checks, mcp__intent2code__clean_core_check
model: inherit
---

# Intent2Code

You are running the **Intent2Code** end-to-end flow in the MAIN thread (so you — and only you — can use `AskUserQuestion`). The requirement / FD is:

> $ARGUMENTS

**COMMAND CONVENTIONS — scoped permissions (read first; they apply to you and every sub-agent).**
The plugin's `.claude/settings.json` pre-approves an exact list of commands — there is no blanket
`Bash(*)`. Use these forms **verbatim** so nothing prompts; any other spelling asks the developer
(and is refused in headless runs).

- **Workspace root** = the folder that contains `.claude/` (where the session started). Apps are
  generated as `<workspace root>/<app-name>/`. Put `WORKSPACE_ROOT=<absolute path>` in every brief.
- **Plugin scripts** — run from the workspace root with the relative path and no node flags:
  `node .claude/skills/sap-conventions/scripts/stack.mjs <resolve|apply|check|clean|lint> …`,
  `node .claude/skills/sap-conventions/scripts/<preflight|scaffold-ui|deploy-config>.mjs …` and
  `node .claude/skills/application-sanity-check/scripts/<ui-health-checks|smoke-check|ui-render-check|free-port>.mjs …`.
  Every Bash call starts in the workspace root (the plugin's settings set
  `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR`), so run commands for an app as `cd <app-name> && …` in the
  same call and call plugin scripts without any `cd`. Never put the path in a shell variable
  (`node "$X"` does not match the pre-approved command).
- **Paths** — relative to the workspace root (`cd <app-name> && …`, `<app-name>/app/<module>`) or the Windows
  form `C:/…`. Never Git-Bash `/c/…` paths: Claude Code treats them as outside the workspace and asks.
- **intent2code MCP tools unavailable** (enterprise policy, server down) → scripted fallbacks, never an invented command:

  | MCP tool | Fallback |
  |---|---|
  | `validate_namespace` | `node .claude/skills/application-sanity-check/scripts/ui-health-checks.mjs <app>` — static check 11 |
  | `patch_manifest` (mode snapshot) | `node .claude/skills/sap-conventions/scripts/stack.mjs snapshot <app>/app/<module>` |
  | `run_checks` (cds build) | not run during `/intent` — model errors: `cd <app> && npm exec --no -- cds compile srv --to edmx -o .intent2code/edmx`; `cds build --production` runs at `mbt build` and `/deploy` |
  | `ui5_run_ui5_linter` | `cd <app>/app/<module> && npm exec --no -- ui5lint` (standalone app: `cd <app> && …`) |
  | `configure_service` / `patch_manifest` edits | single-key `Edit`s on `manifest.json` — never a whole-file rewrite |
  | `cap_search_model` | Grep / Read the `.cds` files, or `cd <app> && npm exec --no -- cds compile srv --to json` and read the printed CSN — never pipe it into inline node code |
  | `ui5_get_version_info` | `node .claude/skills/sap-conventions/scripts/stack.mjs resolve --get ui5.version` |
- **Finding / reading files** — Glob, Grep and Read tools, never shell `find … | head` / `ls -R` / `grep | awk`
  pipelines (multi-part shell commands need an approval; the tools never do inside the workspace).
- **Timeouts** — every Bash call that runs `cds` (`npm exec --no -- cds …`, even a quick `cds compile`), `npm`,
  `yo`, `mbt` or a plugin script sets the Bash `timeout` to **600000** ms. With several processes running, even a
  `cds compile` can pass a short timeout; Claude Code then moves the command to the background and its
  output file lives outside the workspace (reading it asks for approval — a short 8.3 temp path cannot be
  pre-approved). Never start these commands with `run_in_background`.
- **cds CLI** — inside the CAP project: `cd <app-name> && npm exec --no -- cds <args>` (the local
  `@sap/cds-dk`; `--no` = never download). Only `cds init` uses the global CLI.
- **Other local CLIs** — `npm exec --no -- ui5lint | tsc | eslint | fiori | ui5 …`.
- **Never** use npx (any form), inline node code (eval / print flags), curl, recursive deletes
  (use `stack.mjs clean`), or `cf …` (the developer deploys). Read files with Read/Grep, not shell one-liners.
- **npm install** — exactly one install at the CAP root per step (workspaces cover `app/*`). Some
  organisations' managed policies always ask before `npm install` / `npm i`; that prompt is expected.
  **Never re-spell a denied command** (another npm verb, a wrapper script, a different tool) to get
  around a prompt or a denial — report it and stop.

**PRE-FLIGHT — Validate all tools and install anything missing (run before everything else; installs go through the normal permission prompts).**

Run CHECK 1 (an MCP tool call) and the pre-flight script (CHECKS 2 + 3) in parallel, in one message. Do not
start STEP 0 until both are resolved.

---

## CHECK 1 — MCP server

Call `mcp__intent2code__ui5_run_manifest_validation` with `{ "manifestPath": "__preflight_probe__/manifest.json" }` as a lightweight probe — any response from the server (including a "file not found" result) means the MCP server is running; only a transport error / timeout counts as a failure.

- **Succeeds** → print `✓ MCP server is running.` Done.
- **Fails / times out** → the tools are not connected in this conversation. Do **not** install or start the
  server yourself: the VS Code folder-open task *Intent2Code MCP server (HTTP :3999)* starts it (the first start
  installs its dependencies from the lockfile, about 30 s; outside VS Code `npm run start-http` in `mcp-server`).
  Claude Code tries to connect only when a conversation starts, and only the developer can reconnect. Print the
  message below once, then use the scripted fallback for every `mcp__intent2code__*` step (COMMAND
  CONVENTIONS) — the build result is the same — and never wait for the server:

  ```text
  ⚠ MCP tools are not connected in this conversation — continuing with the scripted fallbacks (same result).
  The server starts automatically when VS Code opens this folder (the first start installs it, about 30 s).
  To use the tools: type /mcp reconnect all (or /mcp → Reconnect).
  Still failing? Terminal → Run Task → "Intent2Code MCP server (HTTP :3999)" and read its terminal / the Problems panel.
  ```

---

## CHECKS 2 + 3 — tools and stack versions (one command)

```bash
node .claude/skills/sap-conventions/scripts/preflight.mjs
```

(Bash timeout 600000.) One command checks Yeoman + `@sap/generator-fiori` (including the headless
compatibility test), the global `@sap/cds-dk`, resolves `stack.json` (UI5 patch verified on the CDN) and the
plugin docs. It reads tool versions from the global package files instead of starting `yo` / `cds` / `npm`,
runs the slow parts in parallel and caches a passing result for 24 hours — a later build the same day takes
about a second. **Do not run `yo --version`, `npm list -g`, `cds --version`, the compatibility test or
`stack.mjs resolve` separately.**

- **`RESULT: ready`** (exit 0) → keep the printed `STACK` block; put it **verbatim at the top of every builder
  brief** together with `WORKSPACE_ROOT=<absolute path>` and the COMMAND CONVENTIONS block above.
- **`RESULT: action needed`** (exit 1) → run every command under `FIX` exactly as printed (a global install asks
  the developer — expected), then `node .claude/skills/sap-conventions/scripts/preflight.mjs --refresh`. Still not
  ready → **HARD STOP** with the output (`EACCES`: run the terminal as Administrator or
  `npm config set prefix ~/.npm`; a tool not found after installing: add the `npm config get prefix` folder to PATH).
- **Exit 3** (UI5 line not resolvable — offline, no cache or lock) → HARD STOP for UI builds only: go online once or
  set `ui5.pin` in `stack.json`. CAP-only builds continue.
- **Exit 2** (invalid `stack.json`) → HARD STOP with the printed message.
- The global CLI is used **only** for `cds init`; every project pins `@sap/cds` / `@sap/cds-dk` to the
  `stack.json` ranges via `stack.mjs apply`. **Never upgrade the global CLI to `@latest`** to "match" anything.
  Versions live only in `stack.json` — never edit `CLAUDE.md`, `reference-apps/` or skills to change one.

---

Once CHECK 1 and the script are resolved, print the readiness summary — the MCP line, then the `✓`
lines of the script — followed by the progress board, e.g.:

```text
✓ MCP server ready
✓ Yeoman 4.3.1 + @sap/generator-fiori 1.30.0 ready (headless generator loads)
✓ global @sap/cds-dk 10.0.6 (scaffolding only — projects pin ^9 from stack.json)
✓ Stack: CDS ^9 (sqlite ^2, hana ^2, node >=20) · UI5 1.136 → 1.136.23 (verified) · plugin 1.10
▶ Starting /intent flow...
```

Then proceed to STEP 0.

---

Follow these steps. **Two code-generation blockers that cannot be bypassed: (1) Do not generate any application code before Gate 0 (Requirement Analysis confirmation — STEP 0.5). (2) Do not generate any code before Gate G (Architecture sign-off — STEP 7).** Surface assumptions as questions — never guess on Clean Core, backend, floorplan, auth, data types, drafts, or transitions. Use `AskUserQuestion` at each ❓ gate, presenting the recommended option first and honouring overrides. **Scope of this release: CAP (CAPM) and UI (Fiori Elements + Freestyle UI5). If the requirement needs MDK or pro-code-only extensibility, say so and treat it as out of scope.**

**Progress board — always show what is done and where the run is.** The developer must see every
completed step, not only the current one.

1. **Print the progress board** at the start of every step, before every STEP 8 sub-step that spawns an agent,
   in the message right before every gate question, when the run stops, and at STEP 10. It lists every step finished so far (✅, with its recorded outcome or gate
   answer in at most 8 words), skipped steps (⏭ with the reason), the current step (▶), and the steps still to
   come on one `Next:` line:

   ```text
   /intent progress — <app or requirement title>
   ✅ PRE-FLIGHT · Pre-flight checks — all pass · MCP: scripted fallbacks
   ✅ STEP 0 · Requirement Register — 17 requirements · 0 conflicts
   ✅ STEP 0.5 · Requirement analysis · Gate 0 — confirmed
   ✅ STEP 1 · Clean Core · Gate A — side-by-side BTP / CAP
   ✅ STEP 2 · Backend / data source · Gate B — new CAP service
   ▶ STEP 3 · Floorplan · ❓ Gate C — waiting for your choice
   Next: STEP 4 CAP scope (Gate D) → STEP 5 Auth (Gate E) → STEP 6 Data model (Gate F) → STEP 7 Sign-off (Gate G) → build
   ```

   Build the lines only from what really happened in this run (the recorded gate answers, the real counts) —
   never pre-fill an outcome. When the run stops, the last line reads
   `⛔ STOPPED at STEP 8.1 · Validation — runtime check 1 failed twice (table below)`.
2. **Every other message** during `/intent` starts with the one-line form of the current step:

   ```text
   ▶ /intent · STEP 8.1 · Validation · runtime checks 1–10 — in progress
   ```

| Step | Name | Gate / checks |
|---|---|---|
| PRE-FLIGHT | Pre-flight checks | — |
| STEP 0 | Requirement Register | — |
| STEP 0.5 | Requirement analysis | ❓ Gate 0 · Requirement confirmation |
| STEP 1 | Clean Core | Gate A |
| STEP 2 | Backend / data source | ❓ Gate B |
| STEP 3 | Floorplan | ❓ Gate C |
| STEP 4 | CAP scope | ❓ Gate D |
| STEP 5 | Auth & roles | ❓ Gate E |
| STEP 6 | Data model | ❓ Gate F |
| STEP 7 | Architecture sign-off | ❓ Gate G |
| STEP 7.5 | Generator / scaffold | — |
| STEP 8 | Build | — |
| STEP 8.1 | Validation | static checks 1–35, then runtime checks 1–10 |
| STEP 8.2 | Coverage verification | — |
| STEP 9 | Review | ❓ Gate H · Triage |
| STEP 10 | Done | — |

- The status after the dash is one of: `in progress` · `waiting for your choice` · `done` · `skipped (<why>)` ·
  `STOPPED — <reason>`.
- **Show documents in the chat, not only as files.** The developer reads the chat; a raw `.md` file is hard to
  read. Whenever a deliverable is written or changed — Requirement Register (STEP 0 / 0.5), Application
  Architecture (STEP 7), Coverage Report (STEP 8.2) — print its content in the chat as rendered markdown
  (headings and tables, never inside a code block), then give the file link. The same applies to results: the
  static checks 1–35 and runtime checks 1–10 tables (STEP 8.1, and again after every re-run) and the review
  findings (STEP 9) are printed in full, every row — see STEP 8.1 and STEP 9.
- Every `AskUserQuestion` at a gate: `header` = the gate (`Gate C`), and the question text starts with
  `STEP 3 · Gate C —`.
- When a builder agent is spawned or returns, print the line with its name
  (`▶ /intent · STEP 8 · Build — cap-code-builder running`).
- **STEP 8 runs for a long time — show every sub-step.** Print the one-line form **before each sub-step starts**,
  with its number, what runs and the typical duration, e.g.
  `▶ /intent · STEP 8 · Build 3/7 · UI scaffold (SAP Fiori generator) — in progress, about 3–6 min`. Sub-steps
  (CAP + UI; a service-only or standalone build shows only those that apply, numbered n/m of its own):

  | # | Sub-step | Typical duration |
  |---|---|---|
  | 1 | CAP backend — `cap-code-builder` (ends with npm install 1 of 2) | 10–25 min |
  | 2 | Check the CAP files on disk | under 1 min |
  | 3 | UI scaffold — `scaffold-ui.mjs` (SAP Fiori generator) | 3–6 min |
  | 4 | Deployment configuration — `deploy-config.mjs` | 1–3 min |
  | 5 | npm install 2 of 2 (UI module + deployment files) | 2–10 min |
  | 6 | UI layer — `fiori-code-builder` | 5–40 min |
  | 7 | CHANGELOG.md | under 1 min |

- **An install may wait for the developer.** The line before every `npm install` says so:
  `▶ /intent · STEP 8 · Build 5/7 · npm install 2 of 2 — approve it if Claude Code asks (organisation policy); the build waits for your answer`.
- **A background agent leaves the chat quiet — say so.** When you spawn a builder or the review, print the progress
  board, then: `<agent> is working on its own for about <typical duration>; the chat stays quiet until it reports.
  Type status at any time to see where the run is.` When the developer writes while an agent runs, answer with the
  progress board plus `▶ <agent> running since <time> (<n> min)`, then keep waiting.
- **Never point to an earlier board** ("the status is above", "see above"): the developer may have scrolled or
  reloaded. Print the board again — it is short.
- Keep the TodoWrite list (STEP 0) in step with the line: the current step `in_progress`, earlier ones `completed`.

**Two standing mandates that override convenience at every step:**

- **Never lose a requirement.** Every `REQ-NNN` is tracked end-to-end: register → a gate → the TDD → **verified in the generated code** (STEP 8.2). A requirement is only `Built` once the code is *confirmed to deliver it*; "designed into the TDD" is **not** "built". If any build choice would drop, weaken, or only partially deliver a requirement, say so and raise it — never let it lapse silently.
- **Flag every contradiction at its source — never reconcile silently.** Contradictions take two forms: **(a) the FD disagrees with itself** (e.g. an auth section grants only "display + update" while a screen section describes a "create" form), and **(b) a gate answer contradicts a requirement** (e.g. choosing "no draft" for a Fiori Elements app whose requirements include a working create/edit input form — FE create/edit needs drafts or sticky sessions). When you detect either, **stop at the relevant gate, show both sides with their `REQ-NNN` / FD-§ references, and make the developer resolve it** before recording the answer. Never pick a side yourself, and never silently build both interpretations.

**STEP 0 — Ingest the FD and extract a COMPLETE Requirement Register.** This step owns the *WHAT* (the gates that follow own the *HOW*). Do not summarize the FD — itemize it.

0. **Write a TodoWrite plan now** — before reading anything. Create one task per step and mark each completed in real time. This is the resume point if the session is interrupted mid-run.
   Tasks: `PRE-FLIGHT` · `STEP 0 — Requirement Register` · `STEP 0.5 — Requirement Analysis` · `STEP 1 — Gate A Clean Core` · `STEP 2 — Gate B Backend` · `STEP 3 — Gate C Floorplan` · `STEP 4 — Gate D CAP Scope` · `STEP 5 — Gate E Auth` · `STEP 6 — Gate F Data Model` · `STEP 7 — Architecture sign-off` · `STEP 7.5 — Generator / scaffold` · `STEP 8 — Build agents` · `STEP 8.1 — Validation (static + runtime checks)` · `STEP 8.2 — Coverage verification` · `STEP 9 — Review` · `STEP 10 — Done`

1. **Read the whole FD.** If `$1` is a file path, Read the **entire** document — every page, section, table and appendix. For long/multi-page PDFs, read all pages; never skim or sample. If `$ARGUMENTS` is a one-line requirement, treat that text as the FD.
2. **Parse it exhaustively into atomic requirements.** Go section by section and turn **every requirement-bearing line into one discrete, testable requirement** (split compound sentences — one statement = one requirement). Capture, at minimum: every purpose/goal and every *"shall/will"* capability; every screen, mode, option, button, and input/selection field; every processing rule and **each validation** with its exact error message/code when given; every output/report, **each column**, and its source/field mapping; every authorization rule and role (and any instance scoping); every NFR, limit, volume, frequency, and constraint; **every row** of a field-list/error-catalogue/test-condition table → its own requirement. If unsure whether a line is a requirement, **include it.**
2a. **Self-check — verify section coverage before writing.** Re-read the FD section by section with these three checks: (a) every numbered section, heading, table, and appendix produced at least one `REQ-NNN` — list any with zero extractions and explain why (genuinely contextual, or a miss to add now); (b) every row of a field-list, error-catalogue, or test-condition table became its own discrete requirement — no table was collapsed into a single summary row; (c) requirements stated by implication ("the app should handle X", "users can view Y") were captured and marked `[implied]` in the source text column so they can be confirmed at the gate. Correct any gaps before proceeding.
3. **Record each requirement** as a row: **`REQ-NNN` | source text (verbatim/near-verbatim) | FD §/table ref | type (Functional · Validation · Data · Auth · UX · NFR · Integration) | disposition (start `TBD`)**. Derive a provisional `<app-name>` from the FD title (confirmable at STEP 7) and write the register to **`<app-name>/deliverables/Requirement-Register.md`** (use the `deliverable-templates` skill). This register is the single source of truth for coverage.
4. **Contradiction & conflict scan (build the Conflict Register).** Re-read the requirements as a set and find statements that **cannot all be true at once** (auth vs screen, a field in one table but not another, a data type contradicting its use, an NFR clashing with the approach). For each, add a row to a **Conflict Register** at the top of `Requirement-Register.md`: `CONFLICT-NN | clashing REQ-NNN / FD-§ refs | what clashes | gate where it must be resolved`, and mark **both** clashing requirements `Needs-decision`. These are raised verbatim at their gate — never reconciled here.
5. **Load context, report back, and confirm.** Load the `sap-architecture` skill (it defines every gate, the decision tree, and defaults) and the `sap-conventions` skill. Restate the intent in 2–3 sentences, then show: (a) total requirement count by type, (b) headline capabilities that must not be dropped, (c) any `[implied]` requirements that need interpretation confirmation, (d) the Conflict Register. Then **❓ ask the developer: "Does this register look complete? Are any requirements missing or misunderstood?"** — do **not** proceed to STEP 1 until they explicitly confirm. If they flag a gap, add the missing rows, re-run the conflict scan (step 4), and show the updated count before proceeding.

**STEP 0.5 — Requirement & Technical Analysis (BA + SAP Architecture review).**

Acting as Business Analyst + SAP Solution Architect + CAP + UI5/Fiori Architect, synthesize the parsed Requirement Register into a structured technical analysis. This step produces one deliverable and one confirmation gate. **No CDS, JavaScript, TypeScript, XML, YAML, or any application code may be generated until Gate 0 is confirmed.**

Analyse across these six dimensions. Mark every finding as Explicit / Inferred `[inferred]` / Assumed `[assumed]` / Open Question:

| Dimension | What to determine |
| --- | --- |
| Business & Functional | Application objective; user journeys end-to-end; actors; what each role can/cannot do; key workflows and transitions |
| CAP / Backend | Services required; entity projections; bound/unbound actions and functions; handler logic; server-side validations; integrations |
| Data Layer | Entities and relationships; key fields; field types; enums/codelists; audit fields (modifiedAt/createdAt); `@odata.etag` candidates; master vs transactional |
| UI | Screens and their purpose; navigation flow; per screen — columns/fields shown, filters, required inputs, client-side validations, actions/buttons |
| Integration & Security | External OData / REST APIs; BTP destinations; BPA workflow; event mesh; notification; auth approach; user roles; per-entity grant matrix |
| Architecture & Traceability | Map each major REQ-NNN → the UI component + CAP service + CDS entity + security rule that delivers it |

Do not invent requirements or silently make important assumptions. If critical information is missing, record it as an Open Question.

**Extend** `<app-name>/deliverables/Requirement-Register.md` (already created in STEP 0) by appending a `## Requirement & Technical Analysis` section with these subsections:

1. **Application Objective** — one paragraph: what the application does and the business value it delivers.
2. **User Roles & Journeys** — table: Role | Journey (end-to-end screen/action sequence).
3. **Functional Requirements** — numbered list; each entry tagged Explicit / Inferred / Assumed; mapped to at least one REQ-NNN.
4. **UI Requirements** — per screen: purpose, key controls (table columns / form fields / filters), user actions, navigation targets, client-side validations.
5. **CAP / Backend Requirements** — services, entities (with key fields), actions/functions, server-side validation rules, business logic, integrations.
6. **Data Model Requirements** — entities, fields (type + constraints), associations, enums, audit fields, etag candidates, master/transactional split.
7. **API / Integration Requirements** — external OData endpoints, BTP destinations, BPA workflow, event mesh, third-party APIs — or "None".
8. **Security Requirements** — auth approach, roles, per-entity `@restrict` matrix (READ / CREATE / UPDATE / DELETE × roles).
9. **Business Rules & Validations** — explicit rules from the FD plus inferred constraints (uniqueness, referential integrity, status transitions, enum guards).
10. **Proposed SAP Architecture** — one paragraph + text-based component diagram (Browser → UI5 App → CAP srv → HANA Cloud → BTP services).
11. **Assumptions** — bulleted list of every `[assumed]` item with rationale.
12. **Open Questions** — numbered list of blocking unknowns the developer must answer before architecture gates can complete. State "None" if there are none.
13. **Implementation Plan** — ordered phases: (1) Data model + enums → (2) Service CDS + auth → (3) Handlers + validation → (4) UI scaffold + routing → (5) Annotations / views → (6) Tests → (7) Deployment config.

**Print the register in the chat before Gate 0** — the developer confirms what they can read, so do not make
them open the file. Use rendered markdown (headings and tables, never a code block), in this order:

1. **Requirement Register** — one table with **every** `REQ-NNN`: `REQ | Requirement | Type | Status`.
   Shorten the requirement to at most 15 words (the verbatim FD text stays in the file) and mark `[implied]` /
   `[assumed]` rows. With more than 40 requirements, group the rows under one sub-heading per type — still
   every row.
2. **Conflict Register** — its table, or "No conflicts".
3. The analysis: **Application Objective** · **User Roles & Journeys** (table) · **UI Requirements** per
   screen (columns, filters, actions) · **Data Model** (one table per entity: field · type · constraint) ·
   **Security** (grant matrix table) · **Business Rules & Validations** · **Assumptions** · **Open Questions**
   (state "None" if empty).

Then output the clickable link `[Requirement-Register.md](<app-name>/deliverables/Requirement-Register.md)`.
When the register changes later (Gate 0 corrections, a gate that drops or adds a requirement), re-print the
changed rows and sections in the chat.

**❓ Gate 0 — Requirement confirmation.** Ask the developer: *"Does this Requirement & Technical Analysis correctly and completely capture what you need to build?"*

- **"Confirmed — proceed to architecture gates"** → continue to STEP 1.
- **"Answer open questions"** → work through each Open Question one by one (ask the developer, record the answer, close the question in `Requirement-Register.md`), re-print the updated Open Questions and Assumptions sections, then loop back to this gate.
- **"I have corrections or additional information"** → incorporate the developer's input, update `Requirement-Register.md` and `Requirement-Register.md` (re-parse affected REQ-NNN rows), re-print only the changed sections, then loop back to this gate.

Proceed to STEP 1 only after Gate 0 is confirmed.

---

> **Gate pre-fill mandate (applies to STEP 1–6).** The `Requirement-Register.md` written in STEP 0.5 already proposes the recommended backend approach, floorplan, data model, roles, and security matrix. Use it as the pre-filled starting point for every gate — gates confirm or refine those proposals; they do not re-derive from scratch. Pre-fill every `AskUserQuestion` from the analysis before presenting it to the developer.
>
> **Gate cross-check (run at EVERY gate, STEP 1–6).** Before recording a gate answer, test it against the Requirement + Conflict Registers. If it would contradict, drop, or only partially satisfy any `REQ-NNN` — or resolves one side of a `CONFLICT-NN` — surface that **in the same gate** with refs and confirm the trade-off. Specific rules: *Fiori Elements + any create/edit/input-form requirement ⇒ drafts (or sticky sessions) REQUIRED — "draft off" conflicts.* *Auth says display-only but a requirement describes a create/input screen ⇒ flag at Gate E.* *Status/Type used as a filter ⇒ needs a value-help with data, not free text ⇒ confirm at Gate F.*

> **STEP 1–7 run as the Application Design Advisor.** Gates A–H are the design-advisory stage: you
> turn the requirement into an agreed architecture before any code builder is spawned. Present the
> gate questions under that name.

**STEP 1 — Gate A · Clean Core delivery.** Load `sap-clean-core` and run `clean_core_check` if the MCP is up. Intent2Code builds the **Side-by-side BTP/CAP** path only. Confirm the requirement fits this model (new app on BTP consuming released OData, no on-stack modification). If the requirement cannot be satisfied without on-stack RAP/ABAP Cloud or classic modification, state this clearly and stop — it is out of scope for this release.

**STEP 2 — ❓ Gate B · Backend / data source.** Build new CAP service · Consume existing OData (RAP/other) · No backend (UI-only mock) · Add service later (project scaffolded now, service wired up in a follow-on session).

**If *consume* — pick the sub-path:**

- **RAP / existing service reached through a BTP destination (the usual consume path in BAS) → user-wizard.** **Load the `rap-integration` skill** and follow it. The RAP backend already owns the data model, so Intent2Code builds **UI only** — and the shell must be scaffolded by the **BAS Fiori Application Generator wizard**, not by Intent2Code, because in BAS the headless generator throws `this.env.error is not a function` **and** `$metadata` behind a destination cannot be fetched from a terminal (no IDE session / principal).

  **The wizard forces a template choice, so decide the floorplan BEFORE printing the wizard steps.** The developer must know which template to pick — do not hardcode "List Report". Run the **Gate C / G3 floorplan recommendation now**: load `sap-architecture` and apply the signal → floorplan logic from `references/decision-gates.md` **G3** exactly as Gate C does — **compute the recommended floorplan from the STEP 0 Requirement Register signals** (charts / KPIs / aggregation ⇒ **ALP**; worklist + detail / transactional CRUD ⇒ **LROP**, the default when ambiguous; single record by known key ⇒ **standalone Object Page**; standard list/detail + one bespoke section/column/validation ⇒ **FPM**; bespoke UX / non-OData / heavy client logic ⇒ **Freestyle**) — then ❓ **offer all five via `AskUserQuestion`, recommended first**, using G3's presentation: always include **Freestyle UI5 as one of the 4 explicit buttons** (never in "Other"), all five named with a one-line "use when" in the body. Run the G3 conflict cross-checks too (a create/edit requirement is fine here — RAP CRUD is enforced by the backend — but flag an ALP pick with no measures to aggregate). The signals exist at Gate B because STEP 0 already built the Requirement Register; the metadata is **not** needed for this recommendation.

  Map the chosen floorplan to the BAS wizard template and the resolved `appType`:

  | Chosen floorplan | BAS wizard template | `appType` |
  |---|---|---|
  | List Report + Object Page | **List Report Object Page** | `external-fe` |
  | Analytical List Page | **Analytical List Page** | `external-fe` (ALP) |
  | Object Page (standalone) | **Form Entry Object Page** | `external-fe` (OP) |
  | Flexible Programming Model | **Flexible Programming Model / custom page** | `cap-fpm` (FPM, FE V4 macros) |
  | Freestyle UI5 | **Basic** | `freestyle-ui5` |

  Then **print the wizard steps for the developer**, naming the mapped template:

  > **Command Palette** → *Fiori: Open Application Generator* → template **[mapped BAS template above]** → data source **Connect to a SAP System** → **Destination** (e.g. `s4h_uerp_pp_generic_destination`) → **Service** (pick the released service from the destination's list — this fetches `metadata.xml`; path form is **V4** `/sap/opu/odata4/sap/<binding>/srvd/sap/<service>/0001/` or **V2** `/sap/opu/odata/sap/<SERVICE>_SRV/`) → **Main entity** → project name / namespace → **Add FLP config: No** · **Add deployment config: No** → **Finish**.

  The wizard fetches `metadata.xml`. Then ❓ collect (1) the **generated project path** and (2) the **annotation strategy** (backend metadata-extension *recommended* · local annotation.xml · mix). **Record `scaffold_method: user-wizard`, `scaffold_path`, the chosen floorplan + resolved `appType`, and the annotation strategy** — these route STEP 7.5 (no generator run) and STEP 8 (`fiori-code-builder` Path A). **The floorplan chosen here IS the Gate C answer → Gate C (STEP 3) is skipped for RAP** (see STEP 3).

- **Direct OData URL or a supplied EDMX file (no destination / not via the BAS wizard).** ❓ capture the **full service binding** — a RAP service reached through a BTP destination needs a destination **and** a service path, not just one of them:
  1. **`$metadata` / EDMX file path** (offline-first) — used to generate the mock.
  2. **OData service path** on the backend — e.g. `/sap/opu/odata4/sap/<SERVICE>/srvd/…/0001/` (OData V4 RAP) or `/sap/opu/odata/sap/<SERVICE>_SRV/` (V2). This is the path the manifest `dataSource` binds to.
  3. **BTP destination name** — e.g. `S4HANA_PROD`, `Northwind` (BTP cockpit or local mock). Leave blank only for a direct URL or a local CAP project.

  Then ❓ the annotation strategy (backend metadata-extension *recommended* · local annotation.xml · mix). Record all three of the above (destination + service path pre-fill the generator at STEP 7.5 and drive the generated `xs-app.json` route + manifest `dataSource`).

If *add later*: scaffold the project with a placeholder CAP service and mock data; note in the Requirement Register that backend wiring is deferred.

**STEP 3 — ❓ Gate C · Floorplan.** **If Gate B = Consume RAP (`scaffold_method: user-wizard`): SKIP this gate.** The floorplan was already recommended and chosen at Gate B (using this same G3 logic) so the developer knew which BAS wizard template to select; it is already recorded as the Gate C answer with its resolved `appType`. Proceed to STEP 4. **Otherwise:
First compute the recommended floorplan** from the requirement signals, using the **signal → floorplan table in the `sap-architecture` skill (`references/decision-gates.md`, G3)** — charts / KPIs / aggregation / drill-down ⇒ **Analytical List Page**; worklist + detail / transactional CRUD ⇒ **List Report + Object Page** *(default when signals are transactional or ambiguous)*; single record entered by a known key, no worklist ⇒ **Object Page (standalone)**; standard list/detail **but** one custom section/column/validation/chart ⇒ **Flexible Programming Model (FPM)**; bespoke UX / non-OData / heavy client logic / explicit developer preference ⇒ **Freestyle UI5** (JavaScript UI — `cap-freestyle` with CAP, or `freestyle-ui5` TypeScript standalone without CAP).
**Then offer all five** floorplans via `AskUserQuestion`, the recommended one first (labelled *Recommended*). The picker allows only **4 option buttons + an automatic "Other"**: always reserve one of the 4 buttons for **Freestyle UI5** — it must never be pushed into "Other" because users rarely think to select "Other" for a major floorplan type. Fixed button set:
(1) the **recommended Fiori Elements floorplan** (label it *Recommended*) · (2) **List Report + Object Page** (if not already #1) · (3) **Analytical List Page** (if not already #1–2) · (4) **Freestyle UI5** (with CAP → `cap-freestyle`; standalone → `freestyle-ui5` — resolved from Gate B).
**Freestyle chosen → ask the UI language** in a second `AskUserQuestion`: **TypeScript** (*Recommended* — the default,
type-checked) or **JavaScript** (no build step, `sap.ui.define` modules). Record it as Gate C `uiLanguage` (`ts` | `js`);
STEP 8 passes it to `scaffold-ui.mjs --lang`. Fiori Elements apps are always JavaScript — never ask there.
Put whichever FE option (FPM or standalone Object Page) is least relevant to the signals in "Other". **Name all five (with a one-line "use when" each) in the question body.** Keep the standing bias: prefer the **Fiori Elements family over Freestyle** unless the UX genuinely cannot be expressed in annotations, and within FE recommend the *specific* floorplan whose signals dominate.
The chosen floorplan × Gate B backend resolves to the `appType` consumed at STEP 7.5 (see the appType → generator floorplan table below): `cap-fe-lrop` / `external-fe`, `cap-fe-alp`, `cap-fe-op`, `cap-fpm`, `cap-freestyle` / `freestyle-ui5`.

**STEP 4 — ❓ Gate D · CAP scope.** **If Gate B = Consume RAP (`scaffold_method: user-wizard`), skip this gate entirely** — there is no CAP backend to scope; the RAP service already owns the model and logic. Otherwise, first ask: **Is a CAP backend needed?** (Yes — recommended · No — skip to Gate E). If yes, ask *(multi-select)*: New service · Extend existing · Bound actions · Draft on/off · Events.

**STEP 5 — ❓ Gate E · Auth & roles.** First ask: **Is authentication needed?** (Yes — recommended · No — open/read-only/externally-enforced; confirm explicitly). If yes, ask: XSUAA Viewer/Editor/Admin *(recommended)* · Authenticated-user only · Custom roles · IAS. Then confirm the per-entity grant matrix (load `cap-security`).

**STEP 6 — ❓ Gate F · Data model (CAP) / UI decisions (RAP).** **If Gate B = Consume RAP (`scaffold_method: user-wizard`): do NOT design a data model** — the backend owns it.
Per the `rap-integration` skill, **`Read` the wizard's `<scaffold_path>/webapp/localService/mainService/metadata.xml`** and inventory it (per entity set: keys from `<Key>/<PropertyRef>`, candidate columns/filters from each `<Property>`, value-help/drill targets from `<NavigationProperty>`; default main entity = the set with the most properties).
**Detect and record the OData version** from the metadata header: `m:DataServiceVersion="2.0"` on `<edmx:DataServices>` ⇒ record `odata_version: "2.0"`; `Version="4.0"` on the `<edmx:Edmx>` root ⇒ record `odata_version: "4.0"`.
Record `odata_version` in session state and in `Application-Architecture.md` (build-plan section), and tell the developer *"Detected OData V[N] — development follows V[N] patterns (manifest model settings, CRUD calls, filter/sort syntax and response shape differ by version)."* **Cross-check the Gate B floorplan against the metadata and flag (do not silently switch)**: an ALP pick with no aggregate/measure signals (V2: no `sap:aggregation-role="measure"` / `sap:semantics="aggregate"`;
V4: no `Aggregation.ApplySupported`) ⇒ warn the charts may be empty; a create/edit-oriented floorplan where every EntitySet is read-only (V2: `sap:creatable="false"`; V4: `Capabilities.InsertRestrictions.Insertable=false`) ⇒ warn the create/edit UI will be inert.
On a mismatch, surface it with refs and let the developer re-pick the floorplan (which means re-running the wizard with the corrected template). Present the model **read-only**, then run the ❓ **UI-decisions gate**: main entity, `UI.LineItem` columns, `UI.SelectionFields` filters, value-helps, and which fields drive criticality. Record these for the TDD, then continue.
**Otherwise (CAP):** propose entities/keys/fields/associations/enums/virtual+criticality/currency-pairing/audit/etag/OData-V4 and confirm each assumption (load `cap-schema`, `cap-service`, `cap-modeling`; iterate until agreed). Record every confirmed assumption for the TDD.

**STEP 7 — Architecture sign-off.** Confirm the `app-name`. **Close the Requirement Register:** set every `REQ-NNN` disposition to **Designed**, **Deferred (with a reason)**, or **Needs-decision** — *no requirement may remain `TBD`*. Every `CONFLICT-NN` must be resolved by a gate decision before proceeding.

Using the **`application-architecture` template in the `deliverable-templates` skill**, write `<app-name>/deliverables/Application-Architecture.md` — filling every section from Gates A–F: overview, requirement summary (headline capabilities + deferred list + conflicts resolved), all gate decisions, data model (entities / fields / associations / enums / computed fields), auth grant matrix, and build plan.

**Print the architecture in the chat before Gate G** — rendered markdown (headings and tables, never a code
block), so the developer signs off on what they read:

1. **Overview** table (app name, namespace, app type, run command).
2. **Gate decisions** — one table: `Gate | Decision | Why` for Gates A–F.
3. **Requirement summary** — counts (Designed / Deferred / Needs-decision), headline capabilities, the
   deferred table with reasons, conflicts resolved.
4. **Data model** — one table per entity (field · type · key · notes), associations, enums, actions.
5. **Security** — the grant matrix table (or "No authentication — confirmed at Gate E").
6. **Build plan** table.

Then output the clickable link `[Application-Architecture.md](<app-name>/deliverables/Application-Architecture.md)`.
After a "Request changes" or a loop back, re-print the changed sections.

**❓ Gate G — sign-off:** The developer reviews the architecture above and either:

- **Approves** → proceed to build.
- **Requests changes** → update the relevant section(s) of the document and re-ask.
- **Loops back** to a specific gate → re-run that gate, update gate answers + the document, then re-present.

**No TDD file is written at this stage** — the Technical Design Document is generated on demand when the developer runs `/document`.

**STEP 7.5 — Fiori scaffold prep (generator-first).** **Run this step only if the build needs a UI layer** (Gate C selected a floorplan and the build is not CAP-service-only). If the build is API-only, skip STEP 7.5 entirely and proceed to STEP 8 with `cap-code-builder` only (no generator, no `fiori-code-builder`).

**RAP / user-wizard short-circuit.** **If Gate B recorded `scaffold_method: user-wizard`, do NOT run any generator in this step.** The BAS wizard already scaffolded the project (the headless generator is broken in BAS — see `rap-integration`). Instead: set `scaffold_path` = the developer's wizard project, **verify `<scaffold_path>/webapp/manifest.json` and `<scaffold_path>/webapp/localService/mainService/metadata.xml` exist** (if either is missing, ❓ ask the developer to re-check the wizard output / path), and record `scaffold_method: user-wizard` + `scaffold_path` in `Application-Architecture.md` (build-plan section, exactly as the generator path records its own method below). Then skip straight to STEP 8. The rest of this step (generator config) applies only to the CAP / non-wizard paths.

When a UI is needed and the shell was **not** produced by the wizard, the Fiori UI is scaffolded with the **SAP Fiori Tools Application Generator** (`@sap/generator-fiori` — the same engine as the BAS wizard) **by default**; `scaffold_app` is used only if the generator cannot run (STEP 8 fallback). In this step:

1. **Generator availability (already validated by `preflight.mjs` at PRE-FLIGHT).** If PRE-FLIGHT confirmed Yeoman + `@sap/generator-fiori` are ready, proceed directly to step 2. If PRE-FLIGHT recorded `scaffold_method: built-in (developer-approved fallback)`, skip to STEP 8 — `scaffold_app` will be used, and `fiori-code-builder` will apply the mandatory corrections automatically (UI5 versions via `stack.mjs apply`, `routing.config` → `{}`, bootstrap path verified as full CDN URL not root-relative). **Never probe the generator with `yo @sap/fiori --help` / `yo @sap/fiori:headless --help`** — both fail on the current generator and only cost time.
2. **Collect the full wizard-variable set from the developer** with `AskUserQuestion`, **pre-filled from the architecture** (Gates B/C/F, namespace, app-name — the developer can accept the pre-filled defaults):
   - **Floorplan / template** — pre-filled from Gate C + appType (see mapping table below).
   - **Data source** — one of: CAP local project · OData service URL · Local EDMX file · **SAP System via destination (RAP / ABAP Cloud)** · None. Pre-fill from Gate B. For the **RAP / SAP-system** choice, both a **destination name** and a **service path** are required (the generator's "Connect to a SAP System" flow).
   - **OData service path** (e.g. `/sap/opu/odata4/sap/<SERVICE>/…`) and **destination name** — pre-filled from Gate B; mandatory for the RAP/SAP-system source.
   - **Main entity** and **navigation entity** — pre-filled from Gate F.
   - **Project / module name** — pre-filled from `app-name` (the developer can override).
   - **Application title, description, namespace** — pre-filled.
   - **Minimum UI5 version** = `STACK ui5.version` (stack.json `ui5.line` resolved to its newest verified patch) — shown for information, not asked; to change it edit `ui5.line` in `stack.json`, **Add FLP config** (default no), **Add deployment config** (default **no** — MTA is handled separately).
3. **Generator config — do not write it by hand.** STEP 8 runs `scaffold-ui.mjs`, which builds the config from these
   answers (floorplans `FE_LROP` · `FE_ALP` · `FE_FEOP` · `FE_FPM` · `FF_SIMPLE`; the CAP service path and CDS file from
   the compiler; an EDMX file escaped correctly; UI5 and config version from `stack.json`). **Only** for a data source
   the script does not cover — an `external-fe` app on an OData URL or a destination **outside** the BAS wizard —
   write the config yourself to `<app-name>/.intent2code/generator-<module>.json` with this schema (version =
   `STACK generator.headlessConfigVersion`; the generator stops with "The application config version must match a
   supported version" without it):
   ```jsonc
   {
     "version": "<STACK generator.headlessConfigVersion>",
     "floorplan": "<FE_LROP | FE_ALP | FE_FEOP | FF_SIMPLE | ...>",
     "project": {
       "name": "<module/project name>", "title": "<title>", "description": "<desc>",
       "namespace": "<dotted namespace>", "ui5Version": "<STACK ui5.version>",
       "sapux": <true for FE_* floorplans | false for FF_SIMPLE>,
       "enableTypeScript": <true for FF_SIMPLE with Gate C uiLanguage ts (the default) | false for uiLanguage js and for FE_*>,
       "targetFolder": "<abs path — see STEP 8 targets>"
     },
     "service": {
       "servicePath": "<urlPath from `npm exec --no -- cds compile srv --to serviceinfo`, e.g. /odata/v4/purchase-order/>",
       "capService": { "projectPath": "<abs CAP root>", "serviceName": "<ServiceName>", "serviceCdsPath": "<srv/*.cds file that declares the service>" },
       "destination": { "name": "<destination or omit>" }
       // RAP / SAP system: { "destination": { "name": "S4HANA_PROD" }, "servicePath": "/sap/opu/odata4/sap/<SERVICE>/..." }
       // OData URL:        { "host": "https://...", "servicePath": "/..." }
       // EDMX (offline):   { "edmx": "<contents>", "metadataFilename": "metadata.xml" }
     },
     "entityConfig": { "mainEntity": { "entityName": "<Entity>" }, "navigationEntity": { "entityName": "<Nav or omit>" } },
     "deployConfig": null, "flpConfig": null
   }
   ```
4. **Record** `scaffold_method: fiori-generator`, the module name, the intended `scaffold_path`, and the destination name in `Application-Architecture.md` (build-plan section). These are passed to `fiori-code-builder` at STEP 8.

**appType → generator floorplan / data source:**

| intent2code appType | Generator floorplan | Data source |
|---|---|---|
| `cap-fe-lrop` | List Report Object Page | CAP (local project) |
| `cap-fe-alp` | Analytical List Page | CAP |
| `cap-fe-op` | (Form Entry) Object Page | CAP |
| `cap-fpm` | Flexible Programming Model / custom page | CAP |
| `cap-freestyle` | Basic (freestyle) | CAP |
| `external-fe` | List Report Object Page | OData URL · EDMX · **RAP via destination (destination + service path)** |
| `freestyle-ui5` | Basic (freestyle) | None or OData URL |

**STEP 8 — Build.** Spawn the developer sub-agents (via Agent), passing the gate decisions (Gates A–F answers, the closed Requirement Register at `<app-name>/deliverables/Requirement-Register.md`, the chosen appType/namespace/app-name, and for consume apps the EDMX path + OData service path + destination name) directly in the agent brief. When STEP 7.5 recorded `scaffold_method` (`fiori-generator`, `user-wizard`, or the `built-in` fallback) and `scaffold_path`, put both at the **top of the `fiori-code-builder` brief** so it takes the right path. **For `scaffold_method: user-wizard` (RAP): spawn `fiori-code-builder` only — there is no `cap-code-builder` and no generator run. Put in its brief: `scaffold_method: user-wizard`, `scaffold_path`, the resolved `appType` (from the Gate B floorplan), and `odata_version` (detected at STEP 6). Tell it to load the `rap-integration` skill and then also load `rap-integration/references/odata-v2-patterns.md` (if `odata_version = "2.0"`) or `rap-integration/references/odata-v4-patterns.md` (if `odata_version = "4.0"`) — these version-specific references govern the manifest model settings, Component base class, CRUD calls, filter/sort syntax and response shape, and must be applied to every file it touches.**

- **`cap-code-builder`** for the CAP layer (model, services, handlers, auth) — run first when there's a new backend. **Always put this block verbatim at the TOP of the `cap-code-builder` brief (before gate answers):**
  > **SCAFFOLDING — mandatory, read before anything else:**
  > Run `cds init <app-name> --add nodejs,sqlite,hana` via Bash as the FIRST action, then `node .claude/skills/sap-conventions/scripts/stack.mjs apply <app-name> --scope cap` (pins @sap/cds / @sap/cds-dk / drivers / engines.node to stack.json — the global CLI's majors never leak into the project). Do NOT call `scaffold_app` for the CAP layer — `scaffold_app` is a last-resort fallback only if `cds` is not on PATH (command not found).
- **`fiori-code-builder`** for the UI layer (annotations/floorplan or freestyle; mock + proxy for external) — after the CAP service exists, or in parallel for independent apps.
  - **If the floorplan is FPM (`appType == cap-fpm`, or FPM on any backend):** put this at the TOP of the `fiori-code-builder` brief — *"MUST-LOAD (unconditional): `fiori-bootstrap` → `references/fpm.md` (CAP → Walkthrough B) + `fiori-elements` → `references/fpm-annotations.md`. Verify every FPM file against it."*

**Fiori scaffold (when a UI is needed — default `scaffold_method: fiori-generator`) — ONE script, then ONE install.**
`scaffold-ui.mjs` builds the generator config from the STEP 7.5 answers, runs the generator (`--no-insight
--skipInstall`, stdin closed), checks the manifest, snapshots it (`.intent2code/manifest.generated.json` — static
check 14), aligns versions with `stack.json`, adds `"workspaces": ["app/*"]` and removes `fiori-tools-appreload`
(static check 8). It never runs `npm install`; it prints the install command, which you run as its own call.
Bash timeout 600000 for both. Never run the generator, the snapshot or `stack.mjs apply` separately.

**npm install — as few times as possible.** The plugin settings pre-approve `npm install` / `npm ci`; an organisation
policy may still ask each time (it always wins — never route around it). With the root `"workspaces": ["app/*"]` one
install covers the CAP project and every UI app, so a build needs at most **two**: CAP+UI = one after
`cap-code-builder`, one after scaffold + deployment config · service-only = one (a second only if `deploy-config.mjs`
prints one) · standalone = one after the scaffold. Never add an install the scripts do not print, and never run one
"to be safe". Builders run their install as the LAST step that changes a `package.json`.

- **CAP-backed floorplans** (`cap-fe-*`, `cap-fpm`, `cap-freestyle`): run `cap-code-builder` **first** (the CAP project
  must exist; it ends with the project install — install 1). Run no second install here unless the builder returned
  "npm install required in <app>" (its install was refused) — the generator introspects the live CDS runtime. Then:
  ```bash
  node .claude/skills/sap-conventions/scripts/scaffold-ui.mjs <app-name> --type <appType> --module <module> --namespace <ns> --title "<title>" --entity <MainEntity> [--nav <NavEntity>] [--service <ServiceName>] [--lang ts|js]
  node .claude/skills/sap-conventions/scripts/deploy-config.mjs <app-name>
  cd <app-name> && npm install                     # install 2 — covers the new UI module AND the deployment files
  ```
  `--lang` (freestyle only): the UI language from Gate C — `ts` (default) or `js`. **Then** spawn `fiori-code-builder`.
  The scaffold script refuses a module that already exists: the generator runs **once per module**.
- **Service-only** (no UI): after `cap-code-builder`, run `deploy-config.mjs <app-name>`; run the install only if it
  prints one (`No npm install needed` = none).
- **Standalone floorplans** (`freestyle-ui5`, `external-fe`; no CAP backend):
  ```bash
  node .claude/skills/sap-conventions/scripts/scaffold-ui.mjs . --type <freestyle-ui5|external-fe> --module <app-name> --namespace <ns> --title "<title>" [--edmx <metadata.xml> --service-path </odata/…/> --entity <MainEntity> --nav <NavEntity>] [--lang ts|js]
  ```
  (`external-fe` needs `--edmx` and `--service-path` — the backend OData path from Gate B; without it the generator
  binds to `/sap/opu/odata/`; `freestyle-ui5` already gets the offline mock server declared), then the printed
  `cd <app-name> && npm install` (the only install), **then** spawn `fiori-code-builder`.
- **Script exit 1** (the generator did not produce a manifest) → read the log path it prints, then use the fallback below.
- **RAP / user-wizard (`scaffold_method: user-wizard`, `external-fe`):** **do NOT run the generator** — the project already exists at `scaffold_path` (scaffolded by the BAS wizard). Spawn `fiori-code-builder` directly (it takes Path A and loads `rap-integration`). No `cap-code-builder`.
- Verify `webapp/manifest.json` exists at the target; if a destination was provided, verify `xs-app.json` contains the destination route.
- **Fallback (Yeoman unreachable or generation fails):** if the generator was unavailable or generation fails / the manifest is missing → **first delete any partial generator output** (`node .claude/skills/sap-conventions/scripts/stack.mjs clean <app-name> --generated <module>` — deletes only `<app-name>/app/<module>`, refuses anything else — and remove the module from the root `package.json` `sapux` array) so nothing is ever written into a half-generated tree, then resolve the reference `.md` for the chosen `appType` from the table below, pass it to the relevant agent as `reference_md`, and fall back to the built-in `scaffold_app` path. Record `scaffold_method: built-in (fallback)` and tell the developer the fallback is in use. The agent must **Read** `reference_md` to get the complete file structure, script names, and boilerplate content for that project type.

| appType | Fallback reference `.md` |
| --- | --- |
| *(service-only, no UI)* | `reference-apps/cap-service-only.md` |
| `cap-fe-lrop` · `cap-fe-alp` · `cap-fe-op` · `cap-fpm` | `reference-apps/cap-fullstack-listreport.md` |
| `cap-freestyle` | `reference-apps/cap-fullstack-freestyle.md` |
| `freestyle-ui5` | `reference-apps/freestyle-ui5-ts.md` |
| `external-fe` | `reference-apps/fiori-elements-external-service.md` |

**After each build agent returns — verify deliverables exist on disk.** Do not trust the agent's text summary alone — a silent tool failure or wrong path means the files were never written.

- **After `cap-code-builder`:** verify `<app-name>/srv/service.cds`, `<app-name>/db/schema.cds`, and `<app-name>/package.json` exist. If any are missing, re-spawn `cap-code-builder` with the exact missing-file list before running the generator or spawning `fiori-code-builder`.
- **After `fiori-code-builder`:** verify `<app-name>/app/<module>/webapp/manifest.json` exists (freestyle: also `Component.ts` for TypeScript, `Component.js` for JavaScript). If missing, re-spawn `fiori-code-builder` with the exact missing-file list before proceeding to STEP 8.1.
- **After `deploy-config.mjs`:** its table must show no ❌ and `<app-name>/mta.yaml` must exist. A failed step: print its message and continue — the `deployment-validation` skill at `/deploy` will flag it.

The runnable app is generated **inside `<app-name>/`** (separate from `deliverables/`). Each builder validates the namespace and runs checks. If a builder returns **blocking questions**, ❓ ask the developer, then re-spawn it with the answers. Deliverable (b) is the runnable code.

**Deployment configuration (CAP projects) — `deploy-config.mjs`, run in STEP 8 as listed above** (CAP+UI: right
after the scaffold, before the one install; service-only: right after `cap-code-builder`). Nothing hand-written.
`deploy-config.mjs` runs the project-local `cds add mta,workzone-standard` (service-only: `cds add mta`), which writes
the complete SAP layout: CAP service, db deployer, one html5 module per UI app, app deployer, destination content,
xsuaa / hdi / destination / html5-repo-host resources, `xs-app.json`, the UI build with `ui5-task-zipper`,
`sap.cloud.service` and the launchpad inbound. It then adds what the plugin rules require (`forwardAuthToken` on
srv-api, `service-name` on every managed service, the stack.json schema and build line) and the per-app build task
`relative-odata-uri`: the source manifest keeps `/odata/v4/<svc>/` (static check 12, `cds watch`), the built app gets
`odata/v4/<svc>/` (HTML5 Application Runtime / SAP Build Work Zone). **Never write or patch `mta.yaml`,
`xs-app.json` or the UI build by hand, and never spawn a builder for them** — rerun the script instead (idempotent).

**A `package.json` changed after the last install** (a builder added a dependency, a later `cds add …`) → one more
`cd <app-name> && npm install` before STEP 8.1: the UI5 tooling resolves every package declared in a UI module
`package.json`, and one that is declared but not installed stops the dev server (`Unable to locate module
ui5-task-zipper via resolve logic`). Static check 7 fails on it before any server start.

**Post-build: write `<app-name>/CHANGELOG.md`** (every app type, one Write; skip if it exists) — the review and
`/deploy` warn when it is missing (`review-quality-checks` → `code-quality-rules.md`):
`# Changelog` · `## [Unreleased]` · `## [<package.json version>] — <today, YYYY-MM-DD>` · `### Added` with one
line per service (and its entities), per UI app (floorplan) and the deployment configuration.

**Skip the deployment step only if the developer supplied `mta.yaml`** (or the project was cloned with one). Standalone UI apps (`freestyle-ui5`, `external-fe`) have no CAP root: skip this step (the script exits 2 on them) and say so in the progress board. `cds build` is **not** part of the build: the `mta.yaml` before-all hook runs it at `mbt build` time.

**STEP 8.1 — Validation (static checks, then runtime checks).** Load the `application-sanity-check` skill and run it against `<app-name>/` **once**: static checks 1–35 first (cheap, no server), then runtime checks 1–10 (one server start). The two lists are each numbered from 1 — always name the list: "static check 12", "runtime check 6".

**Static checks 1–35 (always, once) — start them together.** In ONE message, as parallel tool calls: the static
checks script (1–22), `ui5lint` for every UI module plus `npm exec --no -- tsc --noEmit` for every TypeScript module
(25) and the Grep patterns of static checks 26–30 — they only
read files, so none waits for another. Then the checks that need a Read to decide (23, 24, 31–35).
- **Static checks 1–22 (mandatory, deterministic):** run `node .claude/skills/application-sanity-check/scripts/ui-health-checks.mjs <app-name>/`. It asks CAP itself (`cds env`, `cds compile`) about every known cause of a blank, empty or unlabeled UI and of a broken deploy: toolchain integrity (1–5), versions match stack.json (6), app tooling and watch script (7–9), effective dev auth `dummy` (10), namespace (11), served service path with its leading `/` (12), destination prefix (13), lost generator metadata (14), `{i18n>…}` and filter labels (15–16), `initialLoad` (17), UI5 CDN version (18), Form content (19), UI annotations in the production build (20–22). **Paste its output verbatim** — never renumber, re-define, re-word or skip a check, and never mark something PASS or "fixed" that the script did not report as PASS. Exit code 1 = hard stop: apply the printed fixes, re-run, repeat until exit code 0.
- **Static checks 23–35 (agent):** manifest validation (23), manifest v2 routing keys (24), `ui5_run_ui5_linter` (25, once — the only check that proves no deprecated APIs / CSP issues; TypeScript modules also `tsc --noEmit`, which `mbt build` runs too), no `synchronizationMode` (26), `@requires`/`@restrict` (27), console.log (28), secrets (29), CSV UUIDs (30), draft (31), value help (32), `supportedLocales` (33), `CollectionPath` (34) and — FPM apps only — FPM wiring (35). These guard security/compliance rules that a running app does not prove, so they are never skipped.
- Any failure → apply that check's auto-fix (the skill's fix guides; manifest edits go through `patch_manifest` / `configure_service` / single-key `Edit`s, never a whole-file rewrite) or re-spawn the owning builder with the exact failure output. Re-run **only the failed check(s)** (the script re-runs 1–22 together).

**Runtime checks 1–10 (expensive, exactly once, after every static check passes).** ONE command:

```bash
cd "<WORKSPACE_ROOT>" && node .claude/skills/application-sanity-check/scripts/smoke-check.mjs <app-name> --render
```

For standalone UI apps (`freestyle-ui5`, `external-fe`) pass the app root — the script switches to UI mode (local `fiori run` with `ui5-mock.yaml`, offline mock). For CAP apps it starts the CAP server on a free port with the project's own cds-dk (never npx, never kills another process). It prints one table: 1 clean startup, 2 `$metadata` 200 for every service, 3 main entity set 200, 4 every UI module served at `/<ui5.yaml metadata.name>/index.html`, and — in headless Chrome/Edge — 5 UI5 core loaded, 6 a page rendered, 7 no fatal console errors, 8 no failed requests, 9 first row opens its detail page, 10 empty PATCH accepted (Save works). It always stops the server. A full model compile happens on startup, so runtime check 1 **also proves the CDS build**. **Paste the table verbatim.** Any FAIL = the runtime checks failed. Rows 5–10 `SKIP` because no browser is installed must be reported as "UI not verified in a browser" — never as PASS. HTTP 200 on `index.html` is **not** proof that the UI renders.
- **All pass →** **do NOT run `run_checks` (cds build) separately.**
- **A failure →** apply the skill's runtime auto-fix for that row; to locate the fault run the **diagnostic set**: the CDS build diagnostic (`run_checks` with `skipLint: true`), static check 23 (`ui5_run_manifest_validation`) and the static checks script; the server log path is printed under the table. Fix the cause (re-spawn the owning builder if code changes are needed), then re-run the runtime checks **once**. Maximum 2 runtime runs; on a second failure stop and show the developer the diagnostic output.

**Hard stop: the static checks (incl. `ui-health-checks.mjs` exit 0) and the runtime checks (`smoke-check.mjs --render` exit 0) must both be green before STEP 8.2 (coverage verification).** **Print both results in the chat — every row, rendered markdown tables (not in a code block, never summarised as
"all pass")**: first the static checks table — rows 1–22 verbatim from `ui-health-checks.mjs`, then one row per static
check 23–35 with its result and one-line evidence — then the runtime checks table 1–10 verbatim from
`smoke-check.mjs --render` (every page it opened), each with its `Summary:` line. Print them again in full after any
re-run (a fix, the Gate H fixes) — the developer must see the final state of every check, not "re-run green".

**As soon as STEP 8.1 is green, start the review in the background, then do STEP 8.2 while it runs** — spawn
`code-review-advisor` with `run_in_background: true` (see STEP 9 for its brief) in the same message in which you
begin STEP 8.2. Gate H waits for both: the review report and a STEP 8.2 without open Gaps.


**STEP 8.2 — Coverage verification (no requirement left behind).** Before review, **prove the build against the register**. For **every `REQ-NNN` marked `Designed`**, open the actual generated files and confirm the code *truly delivers* it.

- **A UI requirement may be promoted to Built only when runtime checks 5–10 passed for the screen that
  delivers it** — reading the code is not proof (a generated app was reported 20/20 Built while its detail page
  crashed, Save returned 400 and the status colours never rendered).
- The STEP 8.1 runtime run already opens the start page **and every other Fiori Elements list page of the
  manifest** (one set of rows 5–10 per page, e.g. `(#/Departments)`) plus the first row's detail page of each —
  use those rows as the evidence. A screen it does not open (a freestyle route, a custom page) → re-run once
  with `--route "#/<hash>"` for it.
- Opening a page by deep link proves it renders, **not** that the user can reach it: confirm in the code that a
  link, navigation property or tile leads there, otherwise the requirement is a **Gap**.
- If rows 5–10 are `SKIP` because no browser is installed, list the affected UI requirements as "Built — not
  verified in a browser" and ask the developer once (❓) whether to accept them; never block silently.

Write a **Coverage Report** (`<app-name>/deliverables/Coverage-Report.md`): `REQ-NNN | expected behaviour | file:line evidence | Verified / Gap` — and print the same table in the chat (rendered, Gaps first). Promote confirmed rows to **Built**; leave unmet rows **Gap**. **Explicitly check these recurring shortfalls:** a Fiori Elements **create/edit form that doesn't work because drafts/sticky are off**; **filter fields with no value-help data**; **i18n locales present but not wired into the manifest** `supportedLocales`/`fallbackLocale`; **computed/criticality fields not rendering**; **`@restrict` verbs that don't match the grant matrix**; **actions modelled but not surfaced** in the UI. For any **Gap**, re-spawn the relevant developer (`cap-code-builder`/`fiori-code-builder`) with the exact gap list (or ❓ raise a decision), then re-verify. **Do not open Gate H (STEP 9) with open Gaps** unless the developer explicitly defers them on the record. Note every file a re-spawned builder changes here — STEP 9 re-checks review findings on those files.

**STEP 9 — Review.** *(Spawned in the background as soon as STEP 8.1 is green — it runs while you do STEP 8.2; Gate H waits for both.)* Spawn the **`code-review-advisor`** sub-agent on `<app-name>/` with `run_in_background: true`. Its brief: the static and runtime checks tables of STEP 8.1, the topology (CAP / UI type / mta.yaml present), the gate decisions (Gate E grant matrix) and the Requirement Register path — with the STEP 8.1 tables in the brief it runs in **fast mode** (its definition lists what it skips: everything a script already proved, coverage, deployment, tests). When its report arrives and STEP 8.2 has no open Gaps, consolidate its findings; if STEP 8.2 re-spawned a builder, re-check every finding on a file that builder changed against the current file before presenting it. **❓ Gate H — triage** (multi-select): which findings to fix now (e.g. Fix all CRITICAL · defer WARNINGs · explain a trade-off). For accepted findings, re-spawn the relevant developer to apply fixes, then re-run only the static checks covering the touched files plus one runtime run (`smoke-check.mjs --render`, **including the browser checks**).

**STEP 9 — show the whole review in the chat before Gate H.** When the review returns, print (rendered tables):
the category status table (every category with its status — reviewed / covered by static or runtime check N /
STEP 8.2 / `/deploy` / `/test`) and **every finding**, CRITICAL first: `# | Severity | Category | File:line | Finding |
Proposed fix`. Then ask Gate H with the finding numbers. After the Gate H fixes, print the findings table again with a
`Status` column (fixed / deferred / not a finding) and the re-run static and runtime checks tables in full.

**STEP 10 — Wrap up.** Print the runnable app path at `<app-name>/` and the exact run commands (`cd <app-name>` then: `cap-service` → `npm install && npm start`; `cap-fe-*` / `cap-fpm` / `cap-freestyle` → `npm install && npm run watch-<module>` (the generated module name) and print the app URL **exactly** as `http://localhost:4004/<ui5.yaml metadata.name>/index.html` — the `cds-plugin-ui5` mount path; never `/<module>/webapp/index.html`, which is CAP's raw static folder (TypeScript not transpiled → blank page); standalone/external → `npm install && npm run start:mock`). When a **BTP destination** was configured for a consumed/RAP service, note that `npm run start:proxy` (or the deployed approuter) routes through the `xs-app.json` destination entry, while `start:mock` runs fully offline from the EDMX mock. ❓ Optionally offer to run the app.

If a CAP backend was built, confirm `<app-name>/test.http` exists — the `cap-code-builder` writes this file with pre-wired CRUD + action requests for every entity/service, ready to run in the VS Code REST Client or the JetBrains HTTP Client. If the file is missing, re-spawn `cap-code-builder` with the instruction to write `<app-name>/test.http` **only** (the entity list and auth variables are already derivable from the built `srv/` files).

Remind the developer that all three deliverables below are on-demand:

- Run `/document` to generate the Technical Design Document and Unit Testing Document.
- Run `/test` to add test configuration and run the test suites.

**No TDD file, no Unit Testing Document, and no test scaffolding are written automatically.**

Keep a `TodoWrite` list of the gates/steps so the developer can see progress. Prefer `mcp__intent2code__*` tools; if the MCP server is unavailable, tell the developer and fall back to the skills (they are the source of truth).
