*Part of the review-quality-checks skill.*

# Code Quality Rules

Two areas: **comment hygiene** (WHY-not-WHAT rule) and **changelog / versioning** requirements.

---

## Comment hygiene — the WHY-not-WHAT rule

A comment should explain *why* something is done — a hidden constraint, a known bug workaround,
a non-obvious invariant. If removing the comment wouldn't confuse a future reader, it shouldn't exist.

### WARNING findings

**Commented-out code blocks** — dead code should be deleted, not commented.
```bash
# Detect commented-out code (lines starting with // followed by code-like tokens)
grep -rn "^[[:space:]]*//.*(const\|let\|var\|function\|return\|await\|if\|for)" \
  srv/ app/*/webapp 2>/dev/null | grep -v "node_modules"
```

**`TODO` / `FIXME` / `HACK` in production source** — these belong in the Requirement Register,
not inline where they accumulate silently.
```bash
grep -rn "TODO\|FIXME\|HACK" srv/ app/*/webapp db/ 2>/dev/null | grep -v "node_modules"
```

**Multi-line docstring blocks explaining *what* a function does** — if the function name and
parameter names already say what it does, the comment is noise. Flag blocks of 3+ comment lines
that only restate the function signature or its steps.

### Expected (do not flag)

These are the only comments worth keeping:

| Comment purpose | Example |
|---|---|
| Hidden constraint or SAP-specific quirk | `// CAP does not select virtual fields via autoExpandSelect — use plain Integer` |
| Workaround for a known framework bug | `// cds-plugin-ui5 requires devDependency at root, not in app/ — see SAP Note 12345` |
| Non-obvious invariant | `// criticality must be recomputed before returning — never stored in DB` |
| One-line file header identifying domain | `// Orders domain — CAP service handlers for OrdersService` |

### Required comments (INFO if missing)

- CDS schema files should have a one-line file-level comment stating the domain namespace purpose.
- Handler files should have a one-line module comment identifying the service they implement.

---

## Changelog and versioning requirements

### `CHANGELOG.md` (WARNING if absent)

Must exist at the project root in [Keep a Changelog](https://keepachangelog.com) / semver format:

```markdown
# Changelog

## [Unreleased]

## [1.0.0] — 2026-07-21
### Added
- Initial release: Orders entity, OrdersService, Fiori LR+OP app
```

Rules:
- Every `package.json` version bump must have a matching entry.
- `[Unreleased]` section must be at the top — records work-in-progress not yet released.
- Dates in `YYYY-MM-DD` format.

### `package.json` version (WARNING if not semver)

```bash
npm pkg get version
```

The printed value must match `MAJOR.MINOR.PATCH` (`^\d+\.\d+\.\d+$`); anything else, or `{}` (no
`version` key) → `NOT_SEMVER: <value>`. `version: "0.0.1"` is valid semver. `version: ""` or `version: "1.0"` = WARNING.
The version must have a matching entry in `CHANGELOG.md`.

### Revision history in deliverable documents (INFO if missing)

`deliverables/Technical-Design-Document.md` and `deliverables/Application-Architecture.md`
should each have a **Revision History** table near the top:

```markdown
| Version | Date       | Author | Change |
|---------|------------|--------|--------|
| 1.0     | 2026-07-21 | Alice  | Initial draft |
```

Absent revision history = INFO only — documents without it are still deliverable but harder
to track across sprints.

---

## Forbidden HTTP primitives in UI5 controllers

### WARNING findings

**`fetch` / `XMLHttpRequest` / `$.ajax` in UI5 source** — direct HTTP calls bypass OData V4
CSRF token handling, session management, and the batch queue. All service calls must go through
the OData V4 model.

```bash
# Detect forbidden HTTP primitives in UI5 source
grep -rn "\bfetch(\|new XMLHttpRequest\|\.ajax(" \
  app/*/webapp 2>/dev/null | grep -v "node_modules"
```

Flag each hit as WARNING with fix: "Replace with OData V4
`this.getView().getModel().bindContext('/ActionName(...)')` and call `.execute()` on the
resulting binding."
