---
description: >
  Apply approved changes to an existing Intent2Code app — releases the review HARD STOP and dispatches
  the right code builder to apply ONLY the approved review findings (or a requested enhancement),
  re-grounding in the design first.
argument-hint: "<what to change | 'apply approved review findings'>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, Skill, Agent, mcp__intent2code__scaffold_app, mcp__intent2code__add_cds_entity, mcp__intent2code__generate_annotations, mcp__intent2code__gen_mock_from_edmx, mcp__intent2code__configure_service, mcp__intent2code__patch_manifest, mcp__intent2code__validate_namespace, mcp__intent2code__run_checks
model: inherit
---

You are running **MODIFY** mode in the MAIN thread. The request: `$ARGUMENTS`

1. **Confirm scope.** If applying review findings, read `<app>/deliverables/*` (Review report)
   and ❓ ask the developer which items to apply (all, or a subset). Apply nothing unapproved.
2. **Release the HARD STOP.** Delete `.intent2code/review.lock` so edits are permitted again.
3. **Re-ground.** The code builder must re-read the Technical Design Document (and the code) so changes
   fit the existing architecture; run `validate_namespace` / `clean_core_check` context as needed.
   **Stack upgrade request** ("move to CDS 10", "use UI5 1.148", "apply stack.json"): this is not a code change — edit
   `stack.json` (only if the developer asked to change it), then `node <sap-conventions>/scripts/stack.mjs apply <app>`,
   then the printed `npm install` steps, then step 5. No builder is spawned.
4. **Delegate.** Spawn the relevant code builder to apply **only** the approved items:
   CAP model/service/handler/auth → **`cap-code-builder`**; UI/annotation/freestyle → **`fiori-code-builder`**. **If the change adds or edits an FPM page/section, the `fiori-code-builder` brief MUST require `fiori-bootstrap` → `fpm.md` + `fiori-elements` → `fpm-annotations.md`.**
5. **Re-verify.** Re-run `run_checks` and the **static checks** — `node .claude/skills/application-sanity-check/scripts/ui-health-checks.mjs <app>/`
   (paste its output verbatim; exit code 1 = not done) plus the agent static checks for the touched files — and the **runtime checks** `node .claude/skills/application-sanity-check/scripts/smoke-check.mjs <app> --render` (run from the workspace root; verbatim; exit 1 = not done; runtime check 1 also proves the CDS build) — update the Requirement Register / Coverage report, and offer to
   re-run `/review` or `/test` to confirm the findings are resolved.
