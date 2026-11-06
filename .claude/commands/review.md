---
description: >
  Read-only quality + security gate for an existing SAP CAP + UI app. Engages a HARD STOP (no edits),
  scans the architecture, and produces a severity-ranked findings report to triage. Fixes are applied
  separately via /modify.
argument-hint: "<app-folder | path to <app>/>"
allowed-tools: Read, Glob, Grep, Bash, AskUserQuestion, Skill, Agent, mcp__intent2code__run_checks, mcp__intent2code__validate_namespace, mcp__intent2code__clean_core_check
model: inherit
---

You are running **REVIEW** mode in the MAIN thread on: `$ARGUMENTS` (default: the current project).

1. **Engage the HARD STOP.** Create `.intent2code/` if missing and write the lock file
   `.intent2code/review.lock` (any content). While it exists, use no `Write`/`Edit` and only
   read-only commands; `stack.mjs` refuses to change the app, and where the developer enabled the
   optional review-guard hook (USER_GUIDE → Permissions) every `Write`/`Edit` is blocked.
2. **Scan.** Spawn the **`recommendation`** sub-agent (read-only) to map the stack, model, auth,
   floorplan, and clean-core posture, and return architecture insights.
3. **Review.** Spawn the **`code-review-advisor`** sub-agent with those insights on the app folder. It runs the
   full best-practices + security audit and returns a severity-ranked table (`file:line` +
   recommended fix), CRITICAL first.
4. **Surface, don't apply.** Present the findings and stop. Tell the developer: *"These are
   recommendations only — run `/modify` to approve and apply."* Do not edit anything (the lock
   blocks it regardless).
