#!/usr/bin/env bash
# Intent2Code HARD STOP — blocks Write/Edit while a review lock is present.
# /review creates .intent2code/review.lock ; /modify deletes it.
set -euo pipefail
if [ -f ".intent2code/review.lock" ]; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Intent2Code is in REVIEW mode (HARD STOP). The Code Review Advisor recommends changes but must not modify files. Approve findings with /modify to unlock writes."}}
JSON
fi
exit 0
