---
name: fiori-elements
description: >
  SAP Fiori Elements UI annotations for Intent2Code — annotations.cds (CAP) and local annotation.xml
  (RAP/external). Covers List Report (LineItem, SelectionFields), Analytical List Page (Chart,
  PresentationVariant), Object Page (HeaderInfo, Facets, FieldGroup), value helps, currency via
  @Measures.ISOCurrency, and semantic status with the SAP criticality enum. Load when writing or
  reviewing UI annotations, adding columns/filters/sections, or rendering a status with colour/icon.
  Keywords: annotations.cds, annotation.xml, UI.LineItem, UI.SelectionFields, UI.Chart, UI.Facets,
  UI.HeaderInfo, UI.FieldGroup, UI.DataPoint, Criticality, CriticalityRepresentation, Common.ValueList,
  FPM, sap.fe.macros, macros:FilterBar, macros:Table, macros:Chart, custom section, side effects.
---

# Fiori Elements Annotations

## Quick load — pick ONE reference for your task, load nothing else

| Task | Load this reference only |
|---|---|
| List Report — columns, filters, status colour | [`references/list-report.md`](references/list-report.md) |
| Analytical List Page — chart, KPIs, drill-down | [`references/alp-charts.md`](references/alp-charts.md) |
| Object Page — header, facets, field groups | [`references/object-page.md`](references/object-page.md) |
| Value helps — dropdowns, select dialogs | [`references/value-helps.md`](references/value-helps.md) |
| FPM building blocks (`macros:Table`, `macros:FilterBar`) | [`references/fpm-annotations.md`](references/fpm-annotations.md) |
| OData V2 extensions (generic-template) | [`references/list-report-extensions-v2.md`](references/list-report-extensions-v2.md) |
| Backend vs local annotation placement | [`references/local-vs-backend-annotations.md`](references/local-vs-backend-annotations.md) |

Load the one that matches your current task. Do not load all references — each is self-contained.

> Complements `fiori-bootstrap` (manifest/routing) and `cap-skill` (the model).
> Use `mcp__intent2code__generate_annotations` to emit a first cut, then refine. Canonical example:
> `reference-apps/cap-fullstack-listreport/srv/annotations.cds`.

## Where annotations live

- **CAP backend** → `srv/annotations.cds` (`annotate Service.Entity with @( … );`). Preferred — reusable, server-driven.
- **RAP / existing service** → backend **CDS metadata extension** is the Clean Core choice (document it in the TDD as a backend change); use a **local `annotation.xml`** in the UI app only for app-specific UI tweaks. Never modify the core to satisfy a single app's layout.

## Labels & i18n in CDS annotations (otherwise the UI shows raw property names)

- **Property labels are the source of truth.** Give every displayed/filterable property a
  property-level label — `poNumber @title: '{i18n>poNumber}';` (or `@Common.Label`). The filter
  bar, value helps and the Object Page read the **property** label; a `Label:` inside `UI.LineItem`
  only labels that one column. Every `UI.SelectionFields` entry without a property label renders
  as its raw name (e.g. "status:").
- **`{i18n>key}` in a `.cds` file is resolved by CAP**, from `<cap-root>/_i18n/i18n.properties`
  (or `i18n/`, `assets/i18n/` next to the `.cds` file or a parent folder). CAP **never** reads
  `app/*/webapp/i18n/i18n.properties` — that bundle is only for the UI5 app's own texts (manifest,
  views). A key that exists only there is served as the raw key (`Label="poNumber"`).
- Table title / object name come from `UI.HeaderInfo.TypeName(Plural)` — label those too.
- `cds watch` does not reload on `.properties` changes: touch a `.cds` file or restart.
- Verified by the deterministic static checks (`application-sanity-check/scripts/ui-health-checks.mjs`, static checks 15 and 16).
- The production build must contain these annotations too: static checks 20–22 fail when the `cds.build.tasks` model leaves out `app`, when an `app/<module>/annotations.cds` is not imported (`using from './<module>/annotations';` in `app/services.cds`), or when a List Report / `sap.fe.macros` building block names an annotation term or qualifier that does not exist.

## Criticality (SAP standard — memorise)

`0` Neutral · `1` Negative (red) · `2` Critical (orange) · `3` Positive (green). Always render a status via a `UI.DataPoint` with `Criticality` + `CriticalityRepresentation: #WithIcon` (never colour alone — accessibility). Compute the integer in a CAP `after('READ')` handler (see `cap-skill`).

```cds
UI.DataPoint #Status: { $Type: 'UI.DataPointType', Value: status,
  Criticality: statusCriticality, CriticalityRepresentation: #WithIcon },
```
Reference it from the LineItem as a `UI.DataFieldForAnnotation` → `@UI.DataPoint#Status` so the column shows colour + icon.

## List Report

```cds
UI.SelectionFields: [ status, vendor, orderDate ],     // filter bar
UI.LineItem: [
  { $Type: 'UI.DataField', Value: poNumber, ![@UI.Importance]: #High },
  { $Type: 'UI.DataField', Value: vendor },
  { $Type: 'UI.DataField', Value: totalAmount },        // currency via @Measures.ISOCurrency below
  { $Type: 'UI.DataFieldForAnnotation', Target: '@UI.DataPoint#Status', Label: 'Status' }
]
```
**Several fields in one column** (e.g. first + last name): point a `UI.DataFieldForAnnotation` at a
`UI.FieldGroup` — the fields are stacked in one cell:
```cds
{ $Type: 'UI.DataFieldForAnnotation', Target: '@UI.FieldGroup#Name', Label: 'Name' },   // in UI.LineItem
UI.FieldGroup #Name: { Data: [ { $Type: 'UI.DataField', Value: firstName },
                               { $Type: 'UI.DataField', Value: lastName } ] },
```
**Never put `UI.ConnectedFields` in a `UI.LineItem`:** the table crashes with `TypeError: t.some is not a
function` and shows no rows (tested on UI5 1.136, with and without `$Type: 'Core.Dictionary'` in `Data`).
`UI.ConnectedFields` (one line built from a `Template`) is for Object Page forms — reference it from a
`UI.FieldGroup` there. Runtime check 7 fails on this crash.

Field-level: `totalAmount @( Common.Label: 'Total', Measures.ISOCurrency: currency );` and hide the raw criticality integer: `statusCriticality @( UI.Hidden: true );`. See [`references/list-report.md`](references/list-report.md). For OData V2 generic-template extension scenarios, see [`references/list-report-extensions-v2.md`](references/list-report-extensions-v2.md).

## Analytical List Page

Add a chart + presentation variant; ALP shows chart + table with drill-down:
```cds
UI.Chart #alp: { $Type:'UI.ChartDefinitionType', ChartType:#Column,
  Dimensions:[status], Measures:[totalAmount],
  MeasureAttributes:[{ $Type:'UI.ChartMeasureAttributeType', Measure:totalAmount, Role:#Axis1,
    DataPoint:'@UI.DataPoint#amount' }] },
UI.PresentationVariant #alp: { Visualizations: ['@UI.Chart#alp', '@UI.LineItem'] },
```
See [`references/alp-charts.md`](references/alp-charts.md) for chart types and KPIs.

## Object Page

```cds
UI.HeaderInfo: { TypeName:'Purchase Order', TypeNamePlural:'Purchase Orders',
  Title:{ Value: poNumber }, Description:{ Value: vendor } },
UI.HeaderFacets: [ { $Type:'UI.ReferenceFacet', Target:'@UI.DataPoint#Status', Label:'Status' } ],
UI.FieldGroup #Details: { $Type:'UI.FieldGroupType', Data:[
  { $Type:'UI.DataField', Value: vendor }, { $Type:'UI.DataField', Value: orderDate } ] },
UI.Facets: [ { $Type:'UI.ReferenceFacet', ID:'DetailsFacet', Label:'Details',
  Target:'@UI.FieldGroup#Details' } ]
```
See [`references/object-page.md`](references/object-page.md).

## Value helps

```cds
status @( Common.ValueListWithFixedValues: true );    // enum → dropdown automatically
plant  @( Common.ValueList: { CollectionPath:'Plants',
  Parameters:[ { $Type:'Common.ValueListParameterInOut', LocalDataProperty: plant_ID,
    ValueListProperty:'ID' }, { $Type:'Common.ValueListParameterDisplayOnly',
    ValueListProperty:'name' } ] } );
```
Two CAP rules (verified with the compiler — see [`references/value-helps.md`](references/value-helps.md) before writing any value help):
- **Association, not foreign key:** annotate `department` (the association), never the generated `department_code` — that one is dropped with only an `Element not found` warning. `LocalDataProperty` is the foreign key `department_code`.
- **Action parameter:** `annotate <Svc>.<Entity> with actions { <action>(<param> @(Common.ValueList: {…})); };` with `LocalDataProperty: <param>`.

Actions as `UI.DataFieldForAction` in the LineItem/Identification — never call OData actions from controller code in Fiori Elements. See [`references/value-helps.md`](references/value-helps.md) and [`references/local-vs-backend-annotations.md`](references/local-vs-backend-annotations.md).

## Extension & FPM scenarios (beyond standard annotations)

When the standard annotation-driven floorplan isn't enough — custom columns/actions/filters on a generic-template app, or a hand-laid FPM page using building blocks:

- **List Report extensions (OData V2, `sap.suite.ui.generic.template`)** — custom column, cross-app navigation, custom filter, custom action, filter-bar value help, Object Page field group (view/controller extensions + fragments). See [`references/list-report-extensions-v2.md`](references/list-report-extensions-v2.md).
- **FPM Filter Bar + Table with building blocks (OData V4, `sap.fe.macros`)** — custom XML view with `macros:FilterBar` + `macros:Table`, `sap.fe.core.fpm` routing target, local annotations. See the `fiori-bootstrap` skill's [`fpm.md`](../fiori-bootstrap/references/fpm.md) (full file-by-file walkthrough).

## Checklist

`contextPath` matches the entity · several fields in one table column via `UI.FieldGroup`, never `UI.ConnectedFields` · status via DataPoint + `#WithIcon` · currency paired with `@Measures.ISOCurrency` · raw criticality `UI.Hidden` · all labels via `Common.Label`/i18n · value helps for enums & references · actions as `UI.DataFieldForAction`.
