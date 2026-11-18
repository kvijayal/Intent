# SSAM Conflict Resolver

*Part of the `mdk-ssam` skill. Never touches SAPAssetManager/ except the CIM file.
Source: Intent2App — SSAM conflict resolution.*

Applies targeted fixes to the Z project and CIM file based on `conflict-analyzer.md` output.
Run this **after** the conflict analyzer, **before** `upgrade.md`.

---

## What this skill resolves

| Category | Action | Risk | Requires confirmation |
|---|---|---|---|
| **TARGET-MOVED** | Patch CIM Target path to new location | Low | Only if multiple candidates |
| **ABSORBED** | Delete custom file + remove CIM entry | Medium | Always — per file or batch |
| **INCOMPATIBLE** (hint ≥ 50%) | Rename identifier in custom file | Medium | Always — per rename |
| **INCOMPATIBLE** (no hint) | Skipped — listed as manual action | — | — |
| **NEEDS-REVIEW** | Skipped — listed as manual action | — | — |
| **SAFE / UNCONSTRAINED** | No action needed | — | — |

**Only the CIM file is written inside `SAPAssetManager/`.**
All other writes go to the Z project (`<CUSTOM_DIR>/`) only.

---

## Non-negotiable rules

1. **Never delete a file without explicit developer confirmation** — ABSORBED removals always ask first
2. **Never touch SAPAssetManager/ except the CIM file**
3. **Never apply a rename with confidence below 50%** — skip it, mark as manual
4. **Show before/after for every Edit** — no silent code changes
5. **One validation run at the end** — do not validate after each individual fix
6. **Skipped items are not lost** — they appear in the final manual-action list
7. **Requires analyzer results** — run `conflict-analyzer.md` first if results not in session

---

## Phase 1 — Load analyzer results

If `conflict-analyzer.md` was just run in this session, use its JSON output directly from context.

Otherwise, tell the developer:
```
BLOCKING: No conflict analysis results found in session.
Please run the conflict-analyzer reference first, then re-invoke the conflict-resolver.
```

Extract from the analyzer JSON:
- `results.TARGET_MOVED[]` — entries with `{ source, oldTarget, newTarget, candidates[] }`
- `results.ABSORBED[]` — entries with `{ source, target, reason, detail }`
- `results.INCOMPATIBLE[]` — entries with `{ source, target, detail.brokenRefs[] }`
- `sap_dir`, `custom_dir`, `cim_file`, `project_dir` from detection phase

Print: `✓ Loaded: <N_ABSORBED> ABSORBED · <N_INCOMPATIBLE> INCOMPATIBLE · <N_MOVED> TARGET-MOVED`

---

## Phase 2 — Resolution plan + developer approval

Build the resolution plan. Show it as a single summary and ask ONE approval question.

**Resolution plan format:**
```
## SSAM Conflict Resolution Plan

### Will auto-apply (no confirmation needed):
  TARGET-MOVED (single candidate): <N> CIM Target path updates

### Requires your confirmation:
  ABSORBED removals:    <N> custom files to delete + CIM entries to remove
  INCOMPATIBLE renames: <N> identifier renames to apply (confidence ≥ 50%)

### Cannot auto-resolve (manual action needed):
  INCOMPATIBLE (no hint):  <N> items
  NEEDS-REVIEW:            <N> items

How would you like to proceed?
  A) Apply all — auto-apply TARGET-MOVED, then confirm ABSORBED + INCOMPATIBLE in batch
  B) Selective — confirm each item individually
  C) TARGET-MOVED only — patch CIM paths, skip everything else
  D) Cancel
```

Use AskUserQuestion with these four options. Wait for answer before proceeding.

---

## Phase 3 — TARGET-MOVED fixes (CIM Target path patches)

**Execute regardless of A/B/C selection.**

### Single-candidate entries (auto-apply, no question)

Save and run:
**Windows:** `C:\Temp\ssam_cr_patch_cim.js` | **Mac/Linux:** `/tmp/ssam_cr_patch_cim.js`

```javascript
const fs   = require("fs");
const path = require("path");

const cimFile = process.argv[2];
// patches = JSON array of { source, oldTarget, newTarget }
const patches = JSON.parse(process.argv[3]);

const cim = JSON.parse(fs.readFileSync(cimFile, "utf8"));
const patchMap = new Map(patches.map(p => [p.oldTarget, p.newTarget]));

let patched = 0;
for (const ip of (cim.IntegrationPoints || [])) {
  const normalized = ip.Target.replace(/^\//, "");
  const key1 = ip.Target;
  const key2 = "/" + normalized;
  const newTarget = patchMap.get(key1) || patchMap.get(key2);
  if (newTarget) { ip.Target = newTarget; patched++; }
}

fs.writeFileSync(cimFile, JSON.stringify(cim, null, 4));
console.log("patched_cim=" + patched);
```

**Run:**
```
node <script_path> "<cimFile>" '<[{"source":"...","oldTarget":"...","newTarget":"..."}]>'
```

Print for each patched entry:
```
✓ CIM patched: <oldTarget>
             → <newTarget>
```

### Multi-candidate entries (ask developer to choose)

For each TARGET-MOVED entry where `candidates.length > 1`, ask ONE AskUserQuestion:
```
The standard file for <source> was moved. Which new location is correct?
  <candidate1>
  <candidate2>
  ...
  Skip — I'll update this manually
```

After answer, include in the patch batch and run the script above.

### Deleted entries (no candidates)

For TARGET-MOVED entries where `candidates.length === 0`, ask:
```
<source> overrides <oldTarget> which no longer exists in the new standard.
  A) Keep as standalone — remove CIM entry but keep the custom file
  B) Delete both — remove file and CIM entry (only if no longer needed)
  C) Skip — I'll handle this manually
```

Execute the chosen action using the appropriate script from Phase 4 (B) or Phase 3 CIM-only patch (A).

---

## Phase 4 — ABSORBED removals

### Batch confirmation (option A from Phase 2)

Show the full list of ABSORBED files with evidence:
```
The following custom files are now delivered by the new SAP standard.
Removing them will use the SAP version instead of your custom override.

  1. <source>  [<reason>]
     Evidence: <detail.examples[0]>
  2. ...

Confirm:
  A) Remove all listed files and their CIM entries
  B) Choose individually
  C) Skip all — I'll handle these manually
```

### Individual confirmation (option B from Phase 2, or if developer chose B above)

For each ABSORBED entry, ask:
```
Remove <source>?
  Evidence: <reason> (e.g. "87% of custom additions are now in SAP standard")
  Examples of absorbed lines:
    <detail.examples[0]>
    <detail.examples[1]>

  Yes — delete file and remove CIM entry
  No  — keep my custom override
```

### Removal script

For all confirmed ABSORBED files, save and run as a single batch:
**Windows:** `C:\Temp\ssam_cr_remove.js` | **Mac/Linux:** `/tmp/ssam_cr_remove.js`

```javascript
const fs   = require("fs");
const path = require("path");

const cimFile    = process.argv[2];
const projectDir = process.argv[3];
// toRemove = JSON array of Source path strings (as they appear in CIM)
const toRemove   = new Set(JSON.parse(process.argv[4]));

// Normalize helper — match with or without leading slash
function matches(ipSource, sourcePath) {
  const a = ipSource.replace(/^\//, "");
  const b = sourcePath.replace(/^\//, "");
  return a === b;
}

// Delete each custom file from the Z project
const removed = [], notFound = [], failed = [];
for (const sourcePath of toRemove) {
  const rel      = sourcePath.replace(/^\//, "");
  const fullPath = path.join(projectDir, rel);
  if (!fs.existsSync(fullPath)) { notFound.push(sourcePath); continue; }
  try {
    fs.unlinkSync(fullPath);
    removed.push(sourcePath);
    // Clean up empty parent directories (up to 2 levels)
    for (let d = path.dirname(fullPath), i = 0; i < 2; i++, d = path.dirname(d)) {
      try { if (fs.readdirSync(d).length === 0) fs.rmdirSync(d); } catch(_) { break; }
    }
  } catch (e) { failed.push({ path: sourcePath, error: e.message }); }
}

// Patch CIM — remove entries for deleted files
const cim    = JSON.parse(fs.readFileSync(cimFile, "utf8"));
const before = (cim.IntegrationPoints || []).length;
cim.IntegrationPoints = (cim.IntegrationPoints || [])
  .filter(ip => ![...toRemove].some(s => matches(ip.Source, s)));
const removedCim = before - cim.IntegrationPoints.length;
fs.writeFileSync(cimFile, JSON.stringify(cim, null, 4));

console.log("removed_files="       + removed.length);
console.log("removed_cim_entries=" + removedCim);
console.log("not_found="           + JSON.stringify(notFound));
console.log("failed="              + JSON.stringify(failed));
```

**Run:**
```
node <script_path> "<cimFile>" "<projectDir>" '<["source/path1.js","source/path2.js"]>'
```

Print for each removed file:
```
✓ Removed: <sourcePath>
  CIM entry removed
```

If `failed` is not empty → surface each as a warning, continue with remaining.

---

## Phase 5 — INCOMPATIBLE renames (Edit tool)

Process each INCOMPATIBLE entry that has at least one `brokenRef` with `renamedTo` (confidence ≥ 50%).

### Confirmation (always per-rename, regardless of A/B choice)

For each broken reference with a rename hint, show:
```
In <source>:
  Broken reference:  <brokenRef.name>
  Likely renamed to: <brokenRef.renamedTo.name>  (<confidence>% confidence)

  Apply rename? (replaces all occurrences in this file)
    Yes — apply rename
    No  — skip, I'll fix manually
```

### Applying the rename

1. **Read** the custom file using the Read tool
2. **Count** occurrences of `brokenRef.name` in the file
3. **Apply** using the Edit tool with `replace_all: true`:
   - `old_string`: the broken identifier (as it appears — property name, function call, etc.)
   - `new_string`: the rename candidate name
4. **Print** confirmation: `✓ Renamed <old> → <new> in <file> (<N> occurrences)`

**Rename scope rules:**
- Replace the identifier as a **whole word** — do not replace substrings
  (e.g. renaming `Priority` must not touch `LowPriority` or `PriorityLevel`)
- If the identifier appears in both a JSON property key AND a JS string, replace both
- If the identifier is part of a longer symbol (e.g. `WorkOrderType` inside `getWorkOrderType`),
  treat each case separately — show the occurrence and ask

### Skipped renames

For broken references where `renamedTo` is null (no hint) or developer chose No:
- Do NOT attempt a rename
- Add to the manual-action list in Phase 6

---

## Phase 6 — Validate and summary report

### Run validation

```
mcp__mdk__mdk-manage { "operation": "validate", "folderRootPath": "<customDir>" }
```

If validation fails: list errors. These may be from skipped items — cross-reference with
the manual-action list and note which errors correspond to which unresolved conflict.

### Final summary report

```
## SSAM Conflict Resolution Summary

**Project:** <customName>
**CIM file:** <cimFile>

### Applied fixes

| Category | Item | Action taken |
|---|---|---|
| TARGET-MOVED | <source> | CIM Target updated: <oldTarget> → <newTarget> |
| ABSORBED | <source> | File deleted + CIM entry removed |
| INCOMPATIBLE | <source>:<brokenRef> | Renamed <old> → <new> (<confidence>%) |

### Manual action required

| Category | Item | What to do |
|---|---|---|
| INCOMPATIBLE | <source> | <brokenRef.name> — no rename hint, check SAP release notes |
| NEEDS-REVIEW | <source> | Compare old/new standard manually: <reason> |
| ABSORBED (skipped) | <source> | Developer chose to keep override |

### Validation result
  <0 errors — ready for upgrade.md>
  OR
  <N errors — see above; unresolved items may be the cause>

### Next step
  1. Fix any remaining manual-action items above
  2. Run upgrade.md to execute the full version upgrade
```

---

## Related skills

- `conflict-analyzer.md` (this folder) — must be run first to produce the conflict report this consumes
- `upgrade.md` (this folder) — run after resolver to execute the 3-way merge and produce the upgrade ZIP
- `guide.md` (this folder) — CIM format and Z project conventions
- `mdk-app-builder` skill, `references/quality-checklist.md` — applied automatically after this step
