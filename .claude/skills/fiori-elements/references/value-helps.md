*Part of the fiori-elements skill.*

# Value helps & actions

Value helps let users pick valid input from a dropdown or a selection dialog instead of typing. Two flavours: **fixed-value** (enums) and **collection-based** (references to another entity). Actions are surfaced as `UI.DataFieldForAction` — never invoked from controller code in Fiori Elements. Define all of this in `srv/annotations.cds`.

## Fixed values (enums) → dropdown

For a small, fixed set of codes (status, category, priority), `Common.ValueListWithFixedValues: true` renders an inline dropdown automatically. No collection needed.

```cds
annotate PurchaseOrderService.PurchaseOrders with {
  POStatus @( Common.Label: 'Status', Common.ValueListWithFixedValues: true );
};
```

For human-readable text behind the code, model a code list (CAP `sap.common.CodeList`) and add `Common.Text` so the UI shows the description, not the raw code:

```cds
POStatus @(
  Common.Label: 'Status',
  Common.ValueListWithFixedValues: true,
  Common.Text: status.name,                 // show description…
  Common.TextArrangement: #TextOnly         // …instead of the code
);
```

## Collection-based value help (references)

For a reference to another entity (vendor, plant, cost centre) where the list is large or maintained elsewhere, use `Common.ValueList` with a `CollectionPath` and parameters that map the picked row back to the local field.

```cds
annotate PurchaseOrderService.PurchaseOrders with {
  plant @( Common.ValueList: {
    $Type         : 'Common.ValueListType',
    CollectionPath: 'Plants',                       // the value-help entity set
    Label         : 'Plant',
    Parameters    : [
      // writes the chosen Plant's ID back into plant_ID, and filters as you type
      { $Type: 'Common.ValueListParameterInOut',
        LocalDataProperty: plant_ID, ValueListProperty: 'ID' },
      // extra display-only columns in the dialog
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'city' }
    ]
  });
};
```

### Parameter types

| Parameter `$Type` | Meaning |
|---|---|
| `Common.ValueListParameterInOut` | maps to a local property; used both to filter and to write back the selection |
| `Common.ValueListParameterIn` | passes a local value INTO the value-help query (constrains the list) |
| `Common.ValueListParameterOut` | only writes a value back from the selected row |
| `Common.ValueListParameterDisplayOnly` | shows a column in the dialog only (no binding) |
| `Common.ValueListParameterConstant` | a fixed filter value applied to the value-help query |

For very large value lists, add `Common.ValueListWithFixedValues: false` (the default) so FE opens a dialog with type-ahead rather than loading everything inline.

### CAP: annotate the association, never the generated foreign key

For a managed association (`department : Association to Departments`) CAP generates the foreign key `department_code` only in the OData output — it is not an element of the CDS entity. So:

- Put `Common.ValueList`, `Common.Text`, `Common.Label` on the **association** `department`. The compiler copies them to `department_code` in `$metadata`.
- Inside the value list, `LocalDataProperty` is the **foreign key** `department_code`.
- `Departments` must be exposed in the same service (it is the `CollectionPath`), readable by every role that edits the field.

```cds
annotate EmployeeService.Employees with {
  department @(
    Common.Label          : 'Department',
    Common.Text           : department.name,
    Common.TextArrangement: #TextFirst,
    Common.ValueList      : {
      CollectionPath: 'Departments',
      Parameters    : [
        { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: department_code, ValueListProperty: 'code' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
      ]
    }
  );
};
```

| Written as | Result (verified with the cds 9 compiler) |
|---|---|
| `department @(Common.ValueList: …)` with `LocalDataProperty: department_code` | ✅ emitted on `Employees/department_code` |
| `department_code @(…)` | ❌ `WARNING Element "department_code" has not been found` — the annotation is dropped, the field has no value help |
| `LocalDataProperty: department` (the association) | ❌ emitted as a navigation path — the picked value is not written back |

A `has not been found` warning from `cds compile`, `cds build` or `cds watch` always means an annotation was dropped. Fix it before the next step — never treat it as noise.

## Actions — UI.DataFieldForAction (never call from controllers)

In Fiori Elements, OData actions are declared in annotations and invoked by the FE edit flow — calling them from controller code bypasses draft handling, messages, and refresh. Bind them on the `LineItem` (table toolbar/row) and/or `Identification` (Object Page header).

```cds
// CAP action declaration (srv/service.cds)
// action approve() returns PurchaseOrders;  action reject(reason: String) returns PurchaseOrders;

annotate PurchaseOrderService.PurchaseOrders with @(
  UI.LineItem: [
    // …columns…
    { $Type: 'UI.DataFieldForAction',
      Action: 'PurchaseOrderService.approve',
      Label : 'Approve',
      ![@UI.Criticality]: #Positive },          // green button
    { $Type: 'UI.DataFieldForAction',
      Action: 'PurchaseOrderService.reject',
      Label : 'Reject',
      ![@UI.Criticality]: #Negative }           // red button
  ],
  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'PurchaseOrderService.approve', Label: 'Approve' }
  ]
);
```

- The `Action` value is `<ServiceName>.<actionName>` (a bound action on the entity).
- `![@UI.Criticality]` colours the button using the standard enum (`#Positive` green, `#Negative` red, `#Critical` orange, `#Neutral`).
- For actions with parameters (e.g. `reject(reason)`), FE renders a parameter dialog automatically — no controller code.
- Guard transitions server-side in the CAP action handler (e.g. reject an invalid status change with HTTP 409). See `cap-skill` and `sap-unit-testing`.

### Value help and label on an action parameter

A bound action is declared in the `actions { }` block of the entity projection. Its parameters are annotated through `annotate <Entity> with actions { <action>(<param> @(…)); }`:

```cds
// srv/service.cds
entity Employees as projection on db.Employees actions {
  action transferDepartment(department : String(10)) returns Employees;
};

// srv/annotations.cds
annotate EmployeeService.Employees with actions {
  transferDepartment(
    department @(
      Common.Label    : 'New Department',
      Common.ValueList: {
        CollectionPath: 'Departments',
        Parameters    : [
          { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: department, ValueListProperty: 'code' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
        ]
      },
      Common.ValueListWithFixedValues: true    // dropdown; omit it for a search dialog
    )
  );
};
```

- `LocalDataProperty` is the **parameter name** (`department`), not an entity field.
- Several parameters: `transferDepartment(department @(…), reason @(…));`. Several actions: one `name(…);` line each inside the same `actions { }` block.
- Unbound action (declared directly in the service): `annotate EmployeeService.transferAll with (department @(…));`

| Written as | Result (verified with the cds 9 compiler) |
|---|---|
| `annotate S.Employees with actions { transferDepartment(department @(…)); }` | ✅ target `S.transferDepartment(S.Employees)/department` |
| the same without `with` | ✅ also accepted |
| `annotate S.transferDepartment with (department @(…))` for a **bound** action | ❌ `WARNING Artifact "S.transferDepartment" has not been found` — dropped |
| `transferDepartment { department @…; }` (braces) | ❌ syntax error (Mismatched brace) |
| `annotate S.Employees with { transferDepartment(department @…); }` (element block) | ❌ syntax error (Mismatched parenthesis) |

## Navigation as a "value help" (semantic links)

To make a field a link to a related object, use `Common.SemanticObject` + `Common.SemanticObjectMapping` so FE renders intent-based navigation — not a controller `window.location` call.

## Hard rules

- Enums → `Common.ValueListWithFixedValues: true`; references → `Common.ValueList` with `CollectionPath` + parameters.
- CAP association: annotate `department`, never `department_code`; `LocalDataProperty: department_code`.
- Action parameter: `annotate <Entity> with actions { <action>(<param> @(…)); }`; `LocalDataProperty: <param>`.
- A compiler `has not been found` warning = a dropped annotation — fix it, never ignore it.
- Show descriptions via `Common.Text` + `Common.TextArrangement`, not raw codes.
- Actions ONLY as `UI.DataFieldForAction`; never invoke OData actions from controller code.
- Colour action buttons with `![@UI.Criticality]`; validate the transition in the backend.

## Checklist

Every enum field has a fixed-value help · every reference field has a `ValueList` with `InOut` mapping · descriptions via `Common.Text` · actions declared as `DataFieldForAction` on `LineItem`/`Identification` with criticality colour · no controller-side action calls · server-side transition guards exist.
