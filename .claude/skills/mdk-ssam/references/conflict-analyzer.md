# SSAM Upgrade — Conflict Analyzer

*Part of the `mdk-ssam` skill. Read-only — makes zero file changes.
Source: Intent2App — SSAM upgrade pre-flight.*

Pre-upgrade analysis. Run this **before** `upgrade.md` (this skill) to understand exactly which
custom artifacts will conflict with the target SAP standard version and what action each needs.

---

## Conflict categories — quick reference

| Category | Risk | Recommendation |
|---|---|---|
| **ABSORBED** | HIGH | Remove — SAP standard now delivers this functionality |
| **INCOMPATIBLE** | HIGH | Modify — standard API/structure has changed, custom code breaks |
| **TARGET-MOVED** | MEDIUM | Re-align — standard file relocated or renamed |
| **NEEDS-REVIEW** | MEDIUM | Inspect manually — complex change, automated analysis inconclusive |
| **SAFE** | LOW | Retain — standard file unchanged or only additively extended |
| **UNCONSTRAINED** | LOW | Retain — pure custom addition, no standard override involved |

Full definitions, detection rules, and worked examples:

### ABSORBED — SAP standard now delivers this functionality

**Definition:** The new SAP standard version has incorporated functionality that your custom
override was previously adding. Using your override after upgrade would duplicate the standard
behavior and may cause conflicts or unexpected results.

**Detection rule:** Custom additions = lines in your custom file that are NOT in the old standard.
Only **meaningful lines** are counted — structural noise is excluded: braces, single keywords
(`return`, `else`), comments, and lines shorter than 5 characters.

Tiered thresholds (avoids false positives on generic code):
- 1–2 meaningful additions → **100% must appear** in the new standard (exact match)
- 3+ meaningful additions → **≥50% must appear** in the new standard

Even a single-line customization can be detected as ABSORBED if that exact meaningful line is now
part of the SAP standard.

**What to do:** Remove the custom override from the Z project and remove its CIM entry. The new
SAP standard already contains the functionality. Keeping the custom override can cause: duplicate
logic, shadow functions, unexpected behavior when SAP's version and your version disagree.

```
Old SAPAssetManager/Rules/WorkOrders/GetPriority.js  → had 40 lines, no priority filter
Custom ZEquinorSSAM/Rules/WorkOrders/GetPriority.js   → added 15 lines to filter by priority

New SAPAssetManager/Rules/WorkOrders/GetPriority.js  → now has those 15 lines built in
→ Result: ABSORBED (custom additions are in the new standard)
→ Action:  Delete ZEquinorSSAM/Rules/WorkOrders/GetPriority.js, remove CIM entry
```

### INCOMPATIBLE — Standard API has changed, custom code breaks

**Definition:** The new SAP standard version has removed or renamed properties, functions, or
binding paths that your custom code references. After upgrade your custom override will reference
identifiers that no longer exist in the standard, causing runtime errors.

**Detection rule:** Lines removed from the standard (present in old version, absent in new)
contain identifiers (property names, function names, binding paths) that also appear in the
custom source file. Identifier extraction covers: JSON property names (`"PropertyName":`), JS
function declarations (`function FunctionName(`, `const FunctionName =`), property access
(`.PropertyName`), string binding keys (`"BindingKey"`).

**Rename detection:** for each broken reference, the analyzer searches for the most likely
rename candidate in the new standard using camelCase token similarity:
1. Split both identifiers into tokens: `WorkOrderType` → `[work, order, type]`
2. Score overlap: shared tokens ÷ max(token counts)
3. Best candidate with score ≥ 0.5 is surfaced as a rename hint with confidence %

| Removed | New Standard Added | Tokens Shared | Confidence |
|---|---|---|---|
| `WorkOrderType` | `MaintenanceOrderType` | order, type | 67% |
| `WOPriority` | `WorkOrderPriority` | priority | 50% |
| `Priority` | `CustomerName` | (none) | — (not shown) |

Confidence ≥ 80%: reliable rename — update your code to use the new name.
Confidence 50–79%: strong hint — verify in SAP release notes before changing.
No candidate found: check SAP SSAM release notes for the replacement API.

**What to do:** Modify the custom override to use the new API — open the new standard file, find
what replaced the removed identifier, update the custom override, re-test with `mdk-manage
validate`. If there's no replacement, the feature may have been redesigned — check release notes.

```
Old standard had: "WorkOrderType": "PM01"
Custom code references: WorkOrderType in a filter rule

New standard removed WorkOrderType, replaced with "MaintenanceOrderType"
→ Result: INCOMPATIBLE (custom rule references removed identifier)
→ Action:  Update ZEquinorSSAM/Rules/WorkOrders/MyFilter.js to use MaintenanceOrderType
```

### TARGET-MOVED — Standard file relocated or renamed

**Definition:** The CIM entry's Target path no longer exists in the new SAP standard. The
standard file was either renamed, moved to a different folder, or deleted. The CIM entry will be
invalid after upgrade.

| Sub-type | Detection | Action |
|---|---|---|
| **Moved** | File with same name found at different path in new standard | Update CIM Target to new path |
| **Renamed** | File not found by name — check folder for similar names | Update CIM Source+Target to match new name |
| **Deleted** | File not found anywhere in new standard | Remove CIM entry; check if SAP removed this feature |

**What to do:** Update the CIM Target path to the new location before running the upgrade (use
this skill's `guide.md` CIM management pattern). If the file was deleted from the standard,
decide whether to keep your custom file as an UNCONSTRAINED standalone addition (remove CIM
entry) or remove the custom file entirely if it relied on the standard artifact.

```
Old: Target = /SAPAssetManager/Rules/Util/Logger.js
New: File not found at that path; found at /SAPAssetManager/Rules/Common/Logger.js

→ Result: TARGET-MOVED (same file, new folder)
→ Action:  Edit CIM: change Target to /SAPAssetManager/Rules/Common/Logger.js
```

### NEEDS-REVIEW — Complex change, automated analysis inconclusive

**Definition:** The standard file has changed significantly, but automated analysis cannot
determine with confidence whether the custom override is affected — common causes: standard file
substantially rewritten (>20 lines removed), ambiguous change type (both additions and removals,
no clear identifier overlap), or complex inter-dependencies with other files.

**What to do:** Manually compare the three versions (old standard, new standard, custom override)
— look for function renames, property restructures, new required parameters — then decide SAFE
(update after comparison) or INCOMPATIBLE (modify needed).

```
Old standard: 80 lines
New standard: 120 lines (35 lines removed, 75 lines added) — substantial rewrite
Custom override: adds 12 lines of custom filtering logic

→ Result: NEEDS-REVIEW (large rewrite, unclear impact on custom additions)
→ Action:  Manually compare — the custom filtering logic may still apply,
           but the integration points may have moved
```

### SAFE — Standard unchanged or only additively extended

**Definition:** The standard file is either identical between old and new versions, or the
changes are purely additive and do not affect any identifiers referenced by the custom override.
Sub-types: **Unchanged** (`oldSapContent === newSapContent`) and **Additive-safe** (standard
changed but no lines removed that are referenced by custom code).

**What to do:** Carry forward as-is. The custom override remains valid with the new standard
version — the upgrade workflow (`upgrade.md`) handles this as "Category C" (merge: custom
additions appended to new SAP base).

```
Old standard: 60 lines
New standard: 60 lines (identical)
Custom override: adds 8 lines for equipment-specific filtering

→ Result: SAFE (standard unchanged)
→ Action:  the upgrade workflow carries forward automatically
```

### UNCONSTRAINED — Pure custom addition (no standard override)

**Definition:** A file exists in the Z project folder but has no CIM entry pointing to a standard
equivalent — a pure addition (new rule, page, or action) implementing functionality not present
in the SAP standard. Not "overriding" anything.

**What to do:** Carry forward as-is — unaffected by SAP standard changes; `upgrade.md` carries
them forward as standalone files. If an UNCONSTRAINED file should have had a CIM entry (e.g. it
was meant to override a standard file), add the CIM entry now before upgrading.

```
ZEquinorSSAM/Rules/Equipment/EquipmentRiskScore.js — no CIM entry
This rule calculates a company-specific risk score — pure custom functionality

→ Result: UNCONSTRAINED
→ Action:  Carry forward automatically during upgrade
```

### Reading the Migration Action Plan

The report's Migration Action Plan table lists all HIGH and MEDIUM items in priority order:

| Action | Typical effort |
|---|---|
| Remove (ABSORBED) | Low — delete file + remove CIM entry |
| Modify (INCOMPATIBLE) | Medium — update custom code to new API |
| Update CIM Target (TARGET-MOVED) | Low — edit one JSON field in CIM |
| Manual review (NEEDS-REVIEW) | Variable — depends on change complexity |
| None (SAFE / UNCONSTRAINED) | None — handled automatically |

Upgrade effort estimate:
- 0 HIGH items: Low effort — run `upgrade.md` directly
- 1–5 HIGH items: Medium effort — address HIGH items first, then upgrade
- 5+ HIGH items: High effort — significant custom code rework before upgrade

---

## Non-negotiable rules

1. **Read-only** — this skill makes zero file changes to the workspace
2. **Node.js only** — all analysis runs as a single script saved to the OS temp dir
3. **CIM is the source of truth** — analyze every IntegrationPoints entry, no skipping
4. **Report everything** — include SAFE and UNCONSTRAINED so the developer has the full picture
5. **No Git required** — works from current file state only
6. **Never list or browse folders interactively** — the script does all reading
7. **Never call mdk-manage or mdk-create** — analysis only, no MDK tool invocations
8. **Three inputs required** — current standard, Z project (auto-detected), target standard ZIP or folder

---

## Phase 1 — Detect workspace

Save and run the detection script (same pattern as `upgrade.md`):

**Windows:** save to `C:\Temp\ssam_ca_detect.js`
**Mac/Linux:** save to `/tmp/ssam_ca_detect.js`

```javascript
const fs   = require("fs");
const path = require("path");

const projectDir = process.argv[2] || process.cwd();

// SAPAssetManager must be a direct child of projectDir
const sapDir   = path.join(projectDir, "SAPAssetManager");
const sapFound = fs.existsSync(sapDir) && fs.statSync(sapDir).isDirectory();

// CIM at root of SAPAssetManager
let cimFile = null;
if (sapFound) {
  for (const f of fs.readdirSync(sapDir)) {
    if (f.toLowerCase().endsWith(".cim")) { cimFile = path.join(sapDir, f); break; }
  }
}

// Derive Z project name from CIM Source paths
let customName = null, customDir = null;
if (cimFile) {
  try {
    const cim   = JSON.parse(fs.readFileSync(cimFile, "utf8"));
    const names = (cim.IntegrationPoints || [])
      .map(ip => (ip.Source || "").replace(/^\//, "").split("/")[0])
      .filter(n => n && n !== "SAPAssetManager");
    if (names.length) {
      customName = names.sort((a,b) =>
        names.filter(x=>x===b).length - names.filter(x=>x===a).length)[0];
      customDir  = path.join(projectDir, customName);
      if (!fs.existsSync(customDir)) customDir = null;
    }
  } catch(_) {}
}

// Current version
let currentVersion = "unknown";
if (sapFound) {
  try {
    const app = JSON.parse(fs.readFileSync(path.join(sapDir,"Application.app"),"utf8"));
    currentVersion = app.ApplicationVersion || "unknown";
  } catch(_) {}
}

// CIM entry count
let cimEntries = 0;
if (cimFile) {
  try {
    const cim = JSON.parse(fs.readFileSync(cimFile,"utf8"));
    cimEntries = (cim.IntegrationPoints||[]).length;
  } catch(_) {}
}

console.log("sap_dir="         + (sapFound    ? sapDir     : "NOT_FOUND"));
console.log("cim_file="        + (cimFile     ? cimFile    : "NOT_FOUND"));
console.log("custom_name="     + (customName  ? customName : "NOT_FOUND"));
console.log("custom_dir="      + (customDir   ? customDir  : "NOT_IN_PROJECT_DIR"));
console.log("current_version=" + currentVersion);
console.log("cim_entries="     + cimEntries);
```

**Run:**
```
node <script_path> "<projectDir>"
```

**Act on output:**

| Output | Action |
|---|---|
| `sap_dir=NOT_FOUND` | BLOCKING: SAPAssetManager/ not found. Ask for full path. |
| `cim_file=NOT_FOUND` | BLOCKING: No .cim file found in SAPAssetManager/. |
| `custom_name=NOT_FOUND` | BLOCKING: No custom project detected in CIM. Ask for Z project path. |
| `custom_dir=NOT_IN_PROJECT_DIR` | BLOCKING: `<custom_name>` folder not found alongside SAPAssetManager/. |
| All found | Print: `✓ Workspace detected: <customName> (v<currentVersion>) · <cimEntries> CIM entries · CIM: <cimFile>` |

---

## Phase 2 — Ask for target standard

If auto-detection succeeded, ask ONE question for the one required input:

```
BLOCKING: Workspace detected:
  Standard:  <sap_dir>  (v<currentVersion>)
  Custom:    <custom_dir>
  CIM:       <cimFile>  (<cimEntries> entries)

I need one thing from you:
  Path to the TARGET SAPAssetManager ZIP (the new version you want to upgrade to).

This can be:
  - A ZIP file: /path/to/SAPAssetManager_2310.zip
  - An already-extracted folder: /path/to/SAPAssetManager_new/

Don't have it?
  Download from SAP Software Downloads for your target SSAM version.
```

---

## Phase 3 — Extract ZIP and validate target

If the target path ends with `.zip`, extract it first:

**Windows:** save to `C:\Temp\ssam_ca_extract.js`
**Mac/Linux:** save to `/tmp/ssam_ca_extract.js`

```javascript
const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const zipPath  = process.argv[2];
const destDir  = process.argv[3]; // OS temp subdir, e.g. os.tmpdir()/ssam_target

fs.mkdirSync(destDir, { recursive: true });

if (process.platform === "win32") {
  execSync(
    `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
    { stdio: "inherit" }
  );
} else {
  execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: "inherit" });
}

// Find SAPAssetManager root inside extracted content
function findSapDir(dir, depth) {
  if (depth > 3) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.some(e => e.name === "Application.app")) return dir;
  for (const e of entries) {
    if (e.isDirectory()) {
      const found = findSapDir(path.join(dir, e.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}

const newSapDir = findSapDir(destDir, 0);
const newVersion = newSapDir
  ? (() => { try { return JSON.parse(fs.readFileSync(path.join(newSapDir,"Application.app"),"utf8")).ApplicationVersion || "unknown"; } catch(_){return "unknown";} })()
  : "unknown";

console.log("new_sap_dir=" + (newSapDir || "NOT_FOUND"));
console.log("new_version=" + newVersion);
```

**Run:**
```
node <script_path> "<zipPath>" "<os_tmpdir>/ssam_target_<timestamp>"
```

If `new_sap_dir=NOT_FOUND` → BLOCKING: could not find SAPAssetManager inside the ZIP.

Print: `✓ Target: v<newVersion> extracted to <newSapDir>`

---

## Phase 4 — Conflict analysis script

This is the core analysis. Save and run as a single script.

**Windows:** save to `C:\Temp\ssam_ca_analyze.js`
**Mac/Linux:** save to `/tmp/ssam_ca_analyze.js`

**Run:**
```
node <script_path> "<cimFile>" "<currentSapDir>" "<newSapDir>" "<customDir>" "<projectDir>"
```

```javascript
const fs   = require("fs");
const path = require("path");

const [,, cimFile, currentSapDir, newSapDir, customDir, projectDir] = process.argv;
const customName = path.basename(customDir);

// ── Helpers ────────────────────────────────────────────────────────────────

function readSafe(p) {
  try { return fs.readFileSync(p, "utf8"); } catch(_) { return null; }
}

function getAllFiles(dir, base) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = (base ? base + "/" : "") + e.name;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) results.push(...getAllFiles(abs, rel));
    else results.push({ rel, abs });
  }
  return results;
}

// Extract identifiers from file content (JSON keys and JS symbols)
function extractIdentifiers(text) {
  const ids = new Set();
  for (const [, m] of text.matchAll(/"([A-Z][a-zA-Z0-9_]{3,})"\s*:/g)) ids.add(m);
  for (const [, m] of text.matchAll(/(?:function|var|const|let)\s+([A-Za-z][A-Za-z0-9_]{3,})/g)) ids.add(m);
  for (const [, m] of text.matchAll(/\.([A-Z][a-zA-Z0-9_]{3,})/g)) ids.add(m);
  for (const [, m] of text.matchAll(/"([A-Za-z][A-Za-z0-9_]{4,})"/g)) ids.add(m);
  return ids;
}

// Find a file by name anywhere in a directory tree
function findByName(fileName, dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) results.push(...findByName(fileName, p));
    else if (e.name === fileName) results.push(p);
  }
  return results;
}

// FIX 1 — meaningful-line filter for ABSORBED detection
// Skips structural noise (braces, single keywords, very short lines) so that
// small but specific customizations (1–2 meaningful lines) can still be detected.
function isMeaningfulLine(line) {
  const s = line.trim();
  if (s.length < 5) return false;
  if (/^[{}\[\](),;]$/.test(s)) return false;
  if (/^\/[/*]/.test(s)) return false;         // comment lines
  if (/^(return|else|try|catch|finally)\b/.test(s)) return false;
  return /[A-Za-z]{3,}/.test(s);               // must contain a real word
}

// FIX 2 — camelCase token splitter for rename detection
// "WorkOrderType" → ["Work", "Order", "Type"]
function camelTokens(id) {
  return id
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .split(/[\s_]+/)
    .map(t => t.toLowerCase())
    .filter(t => t.length >= 2);
}

// Score similarity between two identifiers by shared camelCase tokens.
// Returns 0–1: 1 = identical tokens, 0 = no overlap.
function tokenSimilarity(a, b) {
  const aT = new Set(camelTokens(a));
  const bT = new Set(camelTokens(b));
  if (aT.size === 0 || bT.size === 0) return 0;
  const shared = [...aT].filter(t => bT.has(t)).length;
  return shared / Math.max(aT.size, bT.size);
}

// Given a removed identifier and the set of identifiers NEW in the target standard,
// return the best rename candidate (similarity ≥ 0.5) or null.
function findRenameCandidate(removedId, newOnlyIds) {
  let best = null, bestScore = 0.5; // minimum threshold
  for (const id of newOnlyIds) {
    if (id === removedId) continue;
    const score = tokenSimilarity(removedId, id);
    if (score > bestScore) { best = id; bestScore = score; }
  }
  return best ? { name: best, confidence: Math.round(bestScore * 100) } : null;
}

// Core conflict detection for one CIM entry
function detectConflict(customContent, oldSapContent, newSapContent) {
  // Standard file unchanged → SAFE
  if (oldSapContent === newSapContent) {
    return { category: "SAFE", reason: "Standard file unchanged", detail: null };
  }

  const oldLines    = oldSapContent.split("\n").map(l=>l.trim()).filter(Boolean);
  const newLines    = newSapContent.split("\n").map(l=>l.trim()).filter(Boolean);
  const customLines = customContent.split("\n").map(l=>l.trim()).filter(Boolean);

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  const removedFromStd = oldLines.filter(l => !newSet.has(l));
  const addedToStd     = newLines.filter(l => !oldSet.has(l));

  // ── FIX 1: ABSORBED — no hard minimum-count gate ──────────────────────────
  // Filter custom additions to meaningful lines only, then apply tiered thresholds:
  //   1–2 meaningful lines → require 100% match (all lines present in new standard)
  //   3+  meaningful lines → require 50% match
  const customAdditions = customLines
    .filter(l => !oldSet.has(l))
    .filter(isMeaningfulLine);

  if (customAdditions.length >= 1) {
    const absorbedCount  = customAdditions.filter(l => newSet.has(l)).length;
    const absorptionRatio = absorbedCount / customAdditions.length;
    const threshold       = customAdditions.length <= 2 ? 1.0 : 0.5;

    if (absorptionRatio >= threshold) {
      return {
        category: "ABSORBED",
        reason:   customAdditions.length <= 2
          ? `All ${absorbedCount} meaningful custom line(s) are now present in the new SAP standard`
          : `${Math.round(absorptionRatio * 100)}% of custom additions (${absorbedCount}/${customAdditions.length}) are now in the new SAP standard`,
        detail: {
          absorbedLines:  absorbedCount,
          totalAdditions: customAdditions.length,
          examples:       customAdditions.filter(l => newSet.has(l)).slice(0, 3)
        }
      };
    }
  }

  // ── FIX 2: INCOMPATIBLE — include rename hints for broken references ───────
  if (removedFromStd.length > 0) {
    const removedIds = extractIdentifiers(removedFromStd.join(" "));
    const customIds  = extractIdentifiers(customContent);
    const broken     = [...removedIds].filter(id => customIds.has(id) && id.length >= 4);

    if (broken.length > 0) {
      // Identifiers that are NEW in the target standard (not in old standard)
      const oldIds   = extractIdentifiers(oldSapContent);
      const newIds   = extractIdentifiers(newSapContent);
      const newOnlyIds = [...newIds].filter(id => !oldIds.has(id) && id.length >= 4);

      // For each broken reference, find the most likely rename in the new standard
      const brokenRefs = broken.slice(0, 5).map(id => ({
        name:      id,
        renamedTo: findRenameCandidate(id, newOnlyIds)
      }));

      return {
        category: "INCOMPATIBLE",
        reason:   `Standard removed ${removedFromStd.length} lines containing identifiers referenced by your custom code`,
        detail:   { brokenRefs, removedLineCount: removedFromStd.length, addedLineCount: addedToStd.length }
      };
    }
  }

  // Standard changed but custom not affected
  if (removedFromStd.length > 20) {
    return {
      category: "NEEDS-REVIEW",
      reason:   `Standard file substantially rewritten (${removedFromStd.length} lines removed, ${addedToStd.length} added) — manual check recommended`,
      detail:   { removedLineCount: removedFromStd.length, addedLineCount: addedToStd.length }
    };
  }
  if (removedFromStd.length > 0 || addedToStd.length > 0) {
    return {
      category: "SAFE",
      reason:   `Standard changed (${addedToStd.length} added, ${removedFromStd.length} removed) but no custom identifiers are affected`,
      detail:   { removedLineCount: removedFromStd.length, addedLineCount: addedToStd.length }
    };
  }

  return { category: "NEEDS-REVIEW", reason: "Standard changed but analysis inconclusive", detail: null };
}

// ── Main analysis ─────────────────────────────────────────────────────────

const cim     = JSON.parse(fs.readFileSync(cimFile, "utf8"));
const entries = (cim.IntegrationPoints || []).filter(ip => ip.Source && ip.Target);

// Build file index for newSapDir (for TARGET-MOVED detection)
const newSapFiles = getAllFiles(newSapDir);
const newSapByName = new Map(); // filename → [absPath, ...]
for (const f of newSapFiles) {
  const name = path.basename(f.abs);
  if (!newSapByName.has(name)) newSapByName.set(name, []);
  newSapByName.get(name).push(f);
}

// Build set of all files in old standard (for new-file detection)
const oldSapFiles     = new Set(getAllFiles(currentSapDir).map(f => f.rel));
const newSapFileRels  = new Set(getAllFiles(newSapDir).map(f => f.rel));

const results = {
  ABSORBED:      [],
  INCOMPATIBLE:  [],
  TARGET_MOVED:  [],
  NEEDS_REVIEW:  [],
  SAFE:          [],
  UNCONSTRAINED: [],
  ERRORS:        []
};

// ── Analyze CIM entries ───────────────────────────────────────────────────

for (const ip of entries) {
  const sourcePath = ip.Source.replace(/^\//, "");
  const targetPath = ip.Target.replace(/^\//, "");

  const customFile    = path.join(projectDir, sourcePath);
  const oldSapFile    = path.join(currentSapDir, targetPath.replace(/^SAPAssetManager\//, ""));
  const newSapFile    = path.join(newSapDir,     targetPath.replace(/^SAPAssetManager\//, ""));

  const customContent  = readSafe(customFile);
  const oldSapContent  = readSafe(oldSapFile);

  if (!customContent) {
    results.ERRORS.push({ source: sourcePath, issue: "Custom file not found: " + customFile });
    continue;
  }
  if (!oldSapContent) {
    results.ERRORS.push({ source: sourcePath, issue: "Old standard Target not found: " + oldSapFile });
    continue;
  }

  // Check if Target exists in new standard
  if (!fs.existsSync(newSapFile)) {
    // Try to find by filename in new standard (TARGET-MOVED)
    const fileName   = path.basename(newSapFile);
    const candidates = newSapByName.get(fileName) || [];
    results.TARGET_MOVED.push({
      source:    sourcePath,
      oldTarget: targetPath,
      newTarget: candidates.length === 1
        ? "SAPAssetManager/" + path.relative(newSapDir, candidates[0].abs).replace(/\\/g,"/")
        : null,
      candidates: candidates.map(c =>
        "SAPAssetManager/" + path.relative(newSapDir, c.abs).replace(/\\/g,"/")),
      reason: candidates.length === 0
        ? "File not found anywhere in new standard — may have been deleted"
        : candidates.length === 1
          ? "File found at new location"
          : "File found at " + candidates.length + " possible new locations"
    });
    continue;
  }

  const newSapContent = readSafe(newSapFile);
  if (!newSapContent) {
    results.ERRORS.push({ source: sourcePath, issue: "Could not read new standard file: " + newSapFile });
    continue;
  }

  const analysis = detectConflict(customContent, oldSapContent, newSapContent);

  const entry = {
    source:    sourcePath,
    target:    targetPath,
    category:  analysis.category,
    reason:    analysis.reason,
    detail:    analysis.detail
  };

  switch (analysis.category) {
    case "ABSORBED":     results.ABSORBED.push(entry);     break;
    case "INCOMPATIBLE": results.INCOMPATIBLE.push(entry); break;
    case "SAFE":         results.SAFE.push(entry);         break;
    case "NEEDS-REVIEW": results.NEEDS_REVIEW.push(entry); break;
  }
}

// ── Standalone files (in Z project, NOT in CIM) ───────────────────────────

const cimSources = new Set(entries.map(ip => ip.Source.replace(/^\//, "")));
const customFiles = getAllFiles(customDir);

for (const f of customFiles) {
  const rel = customName + "/" + f.rel;
  if (!cimSources.has(rel) && !f.rel.startsWith(".")) {
    // Skip scaffold files — only report meaningful additions
    const skipFiles = [".project.json","Application.app",".service.metadata",
                       "metadata.json","package.json",".eslintrc","jsconfig.json"];
    if (!skipFiles.includes(path.basename(f.abs))) {
      results.UNCONSTRAINED.push({ source: rel, reason: "No CIM entry — pure custom addition" });
    }
  }
}

// ── New files in target standard (informational) ─────────────────────────

const newStandardFiles = [];
for (const f of newSapFiles) {
  if (!oldSapFiles.has(f.rel) && !f.rel.startsWith(".")) {
    newStandardFiles.push("SAPAssetManager/" + f.rel);
  }
}

// ── Output ────────────────────────────────────────────────────────────────

const summary = {
  ABSORBED:      results.ABSORBED.length,
  INCOMPATIBLE:  results.INCOMPATIBLE.length,
  TARGET_MOVED:  results.TARGET_MOVED.length,
  NEEDS_REVIEW:  results.NEEDS_REVIEW.length,
  SAFE:          results.SAFE.length,
  UNCONSTRAINED: results.UNCONSTRAINED.length,
  ERRORS:        results.ERRORS.length
};

const highRisk   = summary.ABSORBED + summary.INCOMPATIBLE;
const mediumRisk = summary.TARGET_MOVED + summary.NEEDS_REVIEW;
const riskLevel  = highRisk >= 5 ? "HIGH" : highRisk >= 1 ? "MEDIUM" : mediumRisk > 0 ? "LOW" : "CLEAR";

console.log("=== SSAM_CA_RESULTS_BEGIN ===");
console.log(JSON.stringify({
  summary, riskLevel, results, newStandardFiles
}, null, 2));
console.log("=== SSAM_CA_RESULTS_END ===");
```

---

## Phase 5 — Render the conflict report

Parse the JSON between `SSAM_CA_RESULTS_BEGIN` and `SSAM_CA_RESULTS_END` from the script output.
Display the following report inline. Use markdown tables.

### Report format

```
## SSAM Upgrade Conflict Analysis Report

**Project:** <customName>
**Current SAP Version:** <currentVersion>
**Target SAP Version:**  <newVersion>
**CIM Entries Analyzed:** <total>
**Analysis date:** <today>

---

### Risk Summary

| Category | Count | Action |
|---|---|---|
| 🔴 ABSORBED | N | Remove custom — SAP standard now delivers this |
| 🔴 INCOMPATIBLE | N | Modify — standard API changed |
| 🟡 TARGET-MOVED | N | Update CIM Target path |
| 🟡 NEEDS-REVIEW | N | Manual inspection |
| 🟢 SAFE | N | Carry forward as-is |
| 🟢 UNCONSTRAINED | N | Carry forward as-is (pure additions) |

**Upgrade risk: <riskLevel>**

---

### 🔴 HIGH RISK — Action required before upgrade

#### ABSORBED — SAP standard now delivers this functionality
*Remove these custom overrides. Using them after upgrade will duplicate SAP functionality.*

| Custom File | Overrides | Evidence |
|---|---|---|
| <source> | <target> | <reason> |

#### INCOMPATIBLE — Custom code references removed/renamed standard APIs

For each broken reference, show rename hint when `renamedTo` is not null:

| Custom File | Overrides | Broken Reference | Likely Renamed To | Confidence |
|---|---|---|---|---|
| <source> | <target> | <brokenRef.name> | <brokenRef.renamedTo.name \| "— check release notes"> | <brokenRef.renamedTo.confidence + "%" \| "—"> |

*One row per broken reference. Where confidence ≥ 80% the rename is reliable; 50–79% is a strong hint; below 50% is not shown.*

---

### 🟡 MEDIUM RISK — Review before upgrade

#### TARGET-MOVED — Standard file relocated

| Custom File | Old CIM Target | Likely New Location |
|---|---|---|
| <source> | <oldTarget> | <newTarget or candidates list> |

*Action: Update CIM Target path before upgrading.*

#### NEEDS-REVIEW — Complex change, manual inspection required

| Custom File | Overrides | Reason |
|---|---|---|
| <source> | <target> | <reason> |

---

### 🟢 LOW RISK — No action needed

#### SAFE — Standard unchanged or only additively extended
(list files, one per line)

#### UNCONSTRAINED — Pure custom additions (no standard override)
(list files, one per line)

---

### New SAP Standard Features (Informational)
The following files are NEW in the target version — review if they overlap your custom functionality:
(list newStandardFiles, up to 20, grouped by folder)

---

### Migration Action Plan

| Priority | Custom File | Action | Effort |
|---|---|---|---|
| 1 | ... | Remove (absorbed) | Low |
| 2 | ... | Modify (incompatible) | Medium |
| 3 | ... | Update CIM Target (moved) | Low |
| — | ... | Retain (safe) | None |

*Run `upgrade.md` to execute the upgrade after reviewing and deciding on the actions above.*
```

If `results.ERRORS` is not empty, append an **Errors** section listing each file and issue.

---

## Execution notes

- Run each script with `node` via the Bash tool
- Show the user only: phase completion messages, the final report, and BLOCKINGs
- Do not show intermediate file reads or individual script lines
- Phase completion format: `✓ Phase N done — <one-line result>`
- If any BLOCKING is raised, wait for user input before continuing

---

## Related references

- `upgrade.md` (this skill) — run after this analysis to execute the upgrade
- `guide.md` (this skill) — SSAM conventions, CIM format, override patterns
- `mdk-app-builder` skill, `references/quality-checklist.md` — applied automatically during the upgrade
