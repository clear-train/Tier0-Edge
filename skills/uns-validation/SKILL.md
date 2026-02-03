---
name: UNS Validation
description: Validate UNS JSON structures against the standard three-tier hierarchy, type mapping, and alias uniqueness rules.
---

# UNS Validation Skill

This skill provides validation rules and procedures for checking UNS (Unified Namespace) JSON structures.

## Quick Validation Commands

When validating a UNS JSON file, check these critical rules:

### 1. Type Folder Presence

Every topic must be a child of a type folder (`METRIC`, `STATE`, or `ACTION`):

```javascript
// Valid: Topic under State folder
AMS/ERP/State/material ✓

// Invalid: Topic directly under business module
AMS/ERP/material ✗
```

### 2. DataType Consistency

| Parent Type Folder | Required `dataType` | Required `topicType` |
|--------------------|---------------------|----------------------|
| `METRIC` | `TIME_SEQUENCE_TYPE` | `METRIC` |
| `STATE` | `JSONB_TYPE` | `STATE` |
| `ACTION` | `JSONB_TYPE` | `ACTION` |

### 3. Alias Uniqueness

Check for duplicate aliases across the entire tree:

```javascript
// Collect all aliases
const aliases = collectAllAliases(unsTree);
const duplicates = findDuplicates(aliases);
if (duplicates.length > 0) {
  throw new Error(`Duplicate aliases: ${duplicates.join(', ')}`);
}
```

---

## Validation Rules

### Rule V1: No Orphan Topics

```
ASSERT: Every topic node has a parent with dataType in [METRIC, STATE, ACTION]
```

### Rule V2: METRIC Uses TIME_SEQUENCE_TYPE

```
ASSERT: IF topicType == "METRIC" THEN dataType == "TIME_SEQUENCE_TYPE"
ASSERT: IF topicType == "METRIC" THEN fields.find(f => f.name == "json") == null
```

### Rule V3: STATE/ACTION Uses JSONB_TYPE

```
ASSERT: IF topicType in ["STATE", "ACTION"] THEN dataType == "JSONB_TYPE"
ASSERT: IF topicType in ["STATE", "ACTION"] THEN fields.includes({name: "json", type: "STRING"})
```

### Rule V4: Alias Path Inheritance

```
ASSERT: node.alias == parent.alias + "_" + node.name
```

### Rule V5: No INFO Type

```
ASSERT: dataType != "INFO"
ASSERT: topicType != "INFO"
```

---

## Common Validation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Duplicate alias` | Same name in different branches without path prefix | Regenerate aliases using path inheritance |
| `Invalid dataType for METRIC` | METRIC topic using JSONB_TYPE | Change to TIME_SEQUENCE_TYPE |
| `Missing type folder` | Topic directly under business module | Add METRIC/STATE/ACTION folder |
| `topicType mismatch` | topicType doesn't match parent folder | Align topicType with parent |

---

## Validation Pseudocode

```python
def validate_uns_tree(node, parent_alias="", parent_type=None):
    errors = []
    
    # Calculate expected alias
    expected_alias = f"{parent_alias}_{node['name']}" if parent_alias else node['name']
    
    # Check alias
    if node.get('alias') != expected_alias:
        errors.append(f"Alias mismatch: expected {expected_alias}, got {node.get('alias')}")
    
    # For topic nodes
    if node['type'] == 'topic':
        # V1: Must have type folder parent
        if parent_type not in ['METRIC', 'STATE', 'ACTION']:
            errors.append(f"Topic {node['name']} not under type folder")
        
        # V2: METRIC rules
        if node.get('topicType') == 'METRIC':
            if node.get('dataType') != 'TIME_SEQUENCE_TYPE':
                errors.append(f"METRIC {node['name']} must use TIME_SEQUENCE_TYPE")
            if any(f['name'] == 'json' for f in node.get('fields', [])):
                errors.append(f"METRIC {node['name']} cannot have json field")
        
        # V3: STATE/ACTION rules
        if node.get('topicType') in ['STATE', 'ACTION']:
            if node.get('dataType') != 'JSONB_TYPE':
                errors.append(f"{node['topicType']} {node['name']} must use JSONB_TYPE")
    
    # Recurse for children
    current_type = node.get('dataType') if node.get('dataType') in ['METRIC', 'STATE', 'ACTION'] else parent_type
    for child in node.get('children', []):
        errors.extend(validate_uns_tree(child, node.get('alias', ''), current_type))
    
    return errors
```

---

## Integration

When implementing changes to UNS structures:

1. **Before save**: Run validation against all rules
2. **On import**: Validate and report all errors
3. **On migration**: Auto-fix where possible, report what can't be fixed

Refer to [UNS Structure Design](SKILL.md) for the complete design guidelines.
