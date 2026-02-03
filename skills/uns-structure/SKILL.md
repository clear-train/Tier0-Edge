---
name: UNS Structure Design
description: Guidelines for designing and validating Unified Namespace (UNS) topic structures following the three-tier hierarchy and alias conventions.
---

# UNS Structure Design Skill

This skill defines the standards and rules for creating and validating UNS (Unified Namespace) structures in the Tier0 platform.

## Core Design Principles

1. **Path Hierarchy (路径层级化)**: Topics are organized in a hierarchical tree structure.
2. **Type Uniqueness (类型唯一化)**: Each topic belongs to exactly one data type category.
3. **Alias Pathification (别名路径化)**: Aliases are generated from path inheritance to ensure global uniqueness.

---

## Three-Level Terminal Structure

All business topics **MUST** follow this terminal hierarchy:

```
... / {Business Parent} / {Type Folder} / {Topic}
```

### Type Folders

The type folder layer is **mandatory** and must be one of:

| Type Folder | Purpose | Data Type Mapping |
|-------------|---------|-------------------|
| `METRIC` | Time-series numeric data | `TIME_SEQUENCE_TYPE` |
| `STATE` | State/status data with complex payloads | `JSONB_TYPE` |
| `ACTION` | Command/action triggers | `JSONB_TYPE` |

> [!IMPORTANT]
> The `INFO` type is **deprecated**. All former INFO data should be migrated to `STATE`.

### Constraints

- A type folder **CANNOT** contain topics with mismatched `dataType`.
- `METRIC` topics **MUST** use `TIME_SEQUENCE_TYPE` (JSONB is forbidden).
- `STATE` and `ACTION` topics use `JSONB_TYPE` with payloads in a `json` string field.

---

## Alias Generation Algorithm

To eliminate duplicate alias conflicts, aliases are generated using **path inheritance**:

### Formula

```
Current_Alias = Parent_Alias + "_" + Current_Name
```

### Examples

| Path | Generated Alias |
|------|-----------------|
| `Sales/Orders/METRIC` | `Sales_Orders_METRIC` |
| `Purchase/Orders/METRIC` | `Purchase_Orders_METRIC` |
| `AMS/ERP/State/material` | `AMS_ERP_State_material` |

> [!NOTE]
> This ensures that even when different branches have the same `name`, their aliases remain globally unique.

---

## Type Mapping Specifications

| Original Type | Target Data Type | Field Structure | Storage |
|---------------|------------------|-----------------|---------|
| `METRIC` | `TIME_SEQUENCE_TYPE` | Numeric fields only | Time-series DB |
| `STATE` | `JSONB_TYPE` | `json: STRING` field | JSONB storage |
| `ACTION` | `JSONB_TYPE` | `json: STRING` field | JSONB storage |

### Key Constraints

1. **METRIC forbids JSONB**: Metrics must use `TIME_SEQUENCE_TYPE` for time-series aggregation.
2. **JSON encapsulation**: STATE and ACTION payloads are wrapped in a `json` string field.

---

## UNS Node Types

In UNS, nodes are categorized by their `type` field:

| Type Value | Role | Description |
|------------|------|-------------|
| `"path"` | **Folder** | Container node that organizes the hierarchy; can have `children` |
| `"topic"` | **File/Leaf** | Terminal node that holds actual data; has `fields` for data schema |

---

## UNS Node Structure

### Path Node (Folder - `type: "path"`)

```json
{
  "type": "path",
  "name": "ERP",
  "alias": "AMS_ERP",
  "dataType": "NORMAL",
  "children": [...]
}
```

### Type Folder Node (Folder - `type: "path"`, special `dataType`)

```json
{
  "type": "path",
  "name": "State",
  "alias": "AMS_ERP_State",
  "dataType": "STATE",
  "children": [...]
}
```

### Topic Node (File - `type: "topic"`)

```json
{
  "type": "topic",
  "name": "material",
  "alias": "AMS_ERP_State_material",
  "fields": [
    {
      "name": "json",
      "type": "STRING",
      "maxLen": 512
    }
  ],
  "dataType": "JSONB_TYPE",
  "generateDashboard": "FALSE",
  "enableHistory": "TRUE",
  "mockData": "FALSE",
  "topicType": "STATE"
}
```

---

## Transformation Workflow

When converting or creating UNS structures, follow these steps:

### Step 1: Parse Path
Decompose the original path to identify business modules (e.g., `Inventory/Stock`).

### Step 2: Inject Type Layer
Based on the original `type` attribute, insert the appropriate type folder (`METRIC`/`STATE`/`ACTION`).

### Step 3: Calculate Unique Alias
Traverse the tree recursively, generating unique aliases for each node using path inheritance.

### Step 4: Validate Compliance
- Verify all `METRIC` nodes use `TIME_SEQUENCE_TYPE`.
- Verify no `METRIC` nodes contain illegal `json` fields.
- Verify `topicType` matches the parent type folder.

---

## Validation Checklist

When reviewing or creating UNS structures, verify:

- [ ] All topics are under a type folder (`METRIC`/`STATE`/`ACTION`)
- [ ] METRIC topics use `TIME_SEQUENCE_TYPE` (not JSONB)
- [ ] STATE/ACTION topics use `JSONB_TYPE` with `json` field
- [ ] All aliases are path-derived and globally unique
- [ ] No deprecated `INFO` type is used
- [ ] `topicType` matches the parent type folder name

---

## Common Business Modules

Typical top-level business modules in the UNS tree:

| Module | Description | Common Topics |
|--------|-------------|---------------|
| `ERP` | Enterprise Resource Planning | material, bom, routing, plan_order, batch |
| `MES` | Manufacturing Execution System | work_order, production_report, production_task |
| `QMS` | Quality Management System | process_inspection, production_inspection |
| `Dashboard` | Data visualization | statistics topics |

---

## Reference

For full examples, see the UNS JSON structure in [uns修改.md](file:///d:/Tier0/test/Tier0-Edge/uns修改.md).
