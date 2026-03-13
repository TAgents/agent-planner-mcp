# API Response Size Optimization - Summary

## Problem
The `GET /plans/{id}/nodes` endpoint returned ALL fields for ALL nodes, causing:
- Large response sizes (43KB+ for typical plans)
- Excessive context usage in MCP calls
- Defeated the purpose of hierarchical navigation

## Solution
Implemented smart defaults with explicit opt-in for full details:
- **Default:** Returns only 7 minimal fields
- **With `?include_details=true`:** Returns all 16 fields

## Results

### Response Size Comparison
```
Minimal fields (default):   9,415 bytes
Full fields (details=true): 43,528 bytes

Size reduction: 78.38%
```

### Fields Returned

**Minimal Mode (Default - 7 fields):**
```json
{
  "id": "uuid",
  "parent_id": "uuid",
  "node_type": "phase",
  "title": "Phase title",
  "status": "in_progress",
  "order_index": 0,
  "children": [...]
}
```

**Full Mode (include_details=true - 16 fields):**
Includes all above plus:
- `acceptance_criteria`
- `agent_instructions`
- `context`
- `created_at`
- `description`
- `due_date`
- `metadata`
- `plan_id`
- `updated_at`

## Usage

### Direct API Call
```bash
# Minimal fields (default)
GET /plans/{id}/nodes

# Full fields
GET /plans/{id}/nodes?include_details=true
```

### MCP Tool
```javascript
// Minimal fields (default)
mcp__planning-system__get_plan_structure({
  plan_id: "uuid"
})

// Full fields
mcp__planning-system__get_plan_structure({
  plan_id: "uuid",
  include_details: true
})
```

### MCP API Client
```javascript
// Minimal fields (default)
const nodes = await apiClient.nodes.getNodes(planId);

// Full fields
const nodesDetailed = await apiClient.nodes.getNodes(planId, { 
  include_details: true 
});
```

## Best Practices

1. **Use minimal mode** for structure navigation and overview
2. **Use `get_node_context`** when you need detailed information about specific nodes
3. **Use full mode** only when you truly need all fields for all nodes (rare)

## Files Modified

1. `agent-planner/src/controllers/node.controller.js` - Added include_details parameter
2. `agent-planner/src/routes/node.routes.js` - Updated API documentation
3. `agent-planner-mcp/src/api-client.js` - Added options parameter support
4. `agent-planner-mcp/src/tools.js` - Pass include_details to API

## Impact

- **78% reduction** in response size for typical plans
- **Better context management** for AI agents
- **Faster response times** due to less data transfer
- **Backward compatible** via explicit opt-in parameter
