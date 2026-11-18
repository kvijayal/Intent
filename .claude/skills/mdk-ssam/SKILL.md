---
name: mdk-ssam
description: >
  Master skill for all SAP Asset Manager (SSAM) MDK work — customizing a Z project,
  running a full version upgrade, pre-upgrade conflict analysis, applying conflict fixes,
  and applying a metadata patch (not a full upgrade). Covers protected folder rules
  (SAPAssetManager is READ ONLY), CIM file format, Z project conventions and override
  pattern, the automated SSAM upgrade workflow, conflict classification (ABSORBED / SAFE /
  INCOMPATIBLE / TARGET-MOVED / UNCONSTRAINED / NEEDS-REVIEW), automatic conflict resolution,
  and three-way-merge patch application. Trigger on: "SSAM", "SAPAssetManager", "Z project",
  "CIM file", "CIM entry", "asset manager", "override MDK rule", "add to SSAM", "SSAM customize",
  "SSAM upgrade", "SSAM workflow", "Z override", "custom MDK project", "SSAM 2305", "SSAM 2210",
  "conflict analysis", "pre-upgrade check", "upgrade conflicts", "resolve conflicts",
  "fix SSAM conflicts", "apply SSAM patch", "SSAM hot-fix", "three-way merge SSAM",
  "SSAM metadata update", "merge SSAM customisations". For plain (non-SSAM) MDK app building,
  use the `mdk-app-builder` skill instead — this skill's `references/quality-checklist.md` and
  `references/rules-reference.md` equivalents live there and apply to SSAM work too.
---

# MDK SSAM Skill Index

All SSAM-specific content lives in `references/`. Load the file that matches your task —
most engagements start with **guide.md**, then branch depending on whether you're doing a
full version upgrade or applying a one-off patch.

| Reference File | When to use |
| --- | --- |
| [`references/guide.md`](references/guide.md) | Start here for any SSAM work. Protected-folder rules, CIM format, Z project conventions, override pattern, Z project creation, CIM integrity check |
| [`references/conflict-analyzer.md`](references/conflict-analyzer.md) | **Before** a full upgrade — read-only pre-upgrade conflict classification (ABSORBED / SAFE / INCOMPATIBLE / TARGET-MOVED / UNCONSTRAINED / NEEDS-REVIEW, with full definitions and worked examples), zero file changes |
| [`references/conflict-resolver.md`](references/conflict-resolver.md) | **After** the conflict analyzer, **before** the upgrade — applies TARGET-MOVED/ABSORBED/INCOMPATIBLE fixes automatically |
| [`references/upgrade.md`](references/upgrade.md) | The full SSAM version upgrade — workspace detection, CIM pre-audit, file upgrade with conflict handling, output ZIP. Fully executable, phase-by-phase |
| [`references/patch-update.md`](references/patch-update.md) | Applying a metadata **patch** (not a full version upgrade) to a customized SSAM project — auto-discovery + three-way merge |
| [`references/discovery.md`](references/discovery.md), [`three-way-merge.md`](references/three-way-merge.md), [`conflict-detection.md`](references/conflict-detection.md), [`validation-and-reports.md`](references/validation-and-reports.md) | Implementation detail for `patch-update.md` — auto-discovery algorithm, merge code, per-file-type detection rules, validation checks + report templates |

## Typical flows

- **New Z project / day-to-day customization** → `guide.md`
- **Full version upgrade** → `guide.md` (if unfamiliar) → `conflict-analyzer.md` → `conflict-resolver.md` → `upgrade.md`
- **Patch only (hot-fix, not a version bump)** → `patch-update.md`

Always load `mdk-app-builder`'s `references/quality-checklist.md` alongside any file you write
or modify here, and its `references/rules-reference.md` when writing `.js` rule files.
