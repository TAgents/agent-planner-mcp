# Agent Planner MCP Refactoring Tasks

This document outlines the necessary enhancements to the agent-planner-mcp server to provide more comprehensive tools for working with plans via the Model Context Protocol.

## New MCP Tools

### 1. Get Plan Structure Tool

```
get_plan_structure
```

**Description:** Retrieve and display the complete hierarchical structure of a plan.

**Tasks:**
- [ ] Add tool schema to the tools list in `src/tools.js`
- [ ] Implement the tool function using the new `/plans/{planId}/structure` API endpoint
- [ ] Add formatting for clear display of the hierarchy
- [ ] Add status emoji/indicators for better visualization
- [ ] Add unit tests

**Expected Schema:**
```javascript
{
  name: "get_plan_structure",
  description: "Retrieve the complete hierarchical structure of a plan",
  inputSchema: {
    type: "object",
    properties: {
      plan_id: { 
        type: "string", 
        description: "Plan ID" 
      },
      include_details: { 
        type: "boolean", 
        description: "Include full node details in the response"
      }
    },
    required: ["plan_id"]
  }
}
```

### 2. Get Node By Name Tool

```
get_node_by_name
```

**Description:** Find and retrieve a specific node by its name or partial match within a plan.

**Tasks:**
- [ ] Add tool schema to the tools list in `src/tools.js`
- [ ] Implement the tool function using the new `/plans/{planId}/nodes/by-name/{name}` API endpoint
- [ ] Add formatting for search results
- [ ] Handle cases with multiple matching nodes
- [ ] Add unit tests

**Expected Schema:**
```javascript
{
  name: "get_node_by_name",
  description: "Find and retrieve a specific node by its name or partial match",
  inputSchema: {
    type: "object",
    properties: {
      plan_id: { 
        type: "string", 
        description: "Plan ID" 
      },
      name: { 
        type: "string", 
        description: "Node name to search for" 
      },
      exact: { 
        type: "boolean", 
        description: "Require exact name match" 
      },
      node_type: { 
        type: "string", 
        description: "Filter by node type",
        enum: ["root", "phase", "task", "milestone"]
      }
    },
    required: ["plan_id", "name"]
  }
}
```

### 3. List Nodes Tool

```
list_nodes
```

**Description:** Get a filtered list of nodes in a plan based on various criteria.

**Tasks:**
- [ ] Add tool schema to the tools list in `src/tools.js`
- [ ] Implement the tool function using the enhanced node search API endpoint
- [ ] Add formatting for results with status indicators
- [ ] Add pagination support for large result sets
- [ ] Add unit tests

**Expected Schema:**
```javascript
{
  name: "list_nodes",
  description: "Get a filtered list of nodes in a plan",
  inputSchema: {
    type: "object",
    properties: {
      plan_id: { 
        type: "string", 
        description: "Plan ID" 
      },
      status: { 
        type: "string", 
        description: "Filter by node status",
        enum: ["not_started", "in_progress", "completed", "blocked"]
      },
      node_type: { 
        type: "string", 
        description: "Filter by node type",
        enum: ["root", "phase", "task", "milestone"]
      },
      parent_id: { 
        type: "string", 
        description: "Show only children of a specific node" 
      },
      query: { 
        type: "string", 
        description: "Text search across node titles and descriptions" 
      }
    },
    required: ["plan_id"]
  }
}
```

### 4. Move Node Tool

```
move_node
```

**Description:** Move a node to a new parent or reposition it among siblings.

**Tasks:**
- [ ] Add tool schema to the tools list in `src/tools.js`
- [ ] Implement the tool function using the enhanced node update API endpoint
- [ ] Add validation for parent_id and order_index values
- [ ] Add confirmation of the move operation
- [ ] Add unit tests

**Expected Schema:**
```javascript
{
  name: "move_node",
  description: "Move a node to a new parent or reposition it among siblings",
  inputSchema: {
    type: "object",
    properties: {
      plan_id: { 
        type: "string", 
        description: "Plan ID" 
      },
      node_id: { 
        type: "string", 
        description: "Node ID to move" 
      },
      parent_id: { 
        type: "string", 
        description: "New parent node ID" 
      },
      order_index: { 
        type: "number", 
        description: "Position among siblings (0-based index)" 
      },
      preserve_children: { 
        type: "boolean", 
        description: "Whether to move children with the node",
        default: true
      }
    },
    required: ["plan_id", "node_id"]
  }
}
```

### 5. Get Plan Summary Tool

```
get_plan_summary
```

**Description:** Generate a statistical summary of plan progress and composition.

**Tasks:**
- [ ] Add tool schema to the tools list in `src/tools.js`
- [ ] Implement the tool function using the new plan statistics API endpoint
- [ ] Format the statistical results in a clear, readable manner
- [ ] Add visual indicators (charts, tables) where appropriate
- [ ] Add unit tests

**Expected Schema:**
```javascript
{
  name: "get_plan_summary",
  description: "Generate a statistical summary of plan progress",
  inputSchema: {
    type: "object",
    properties: {
      plan_id: { 
        type: "string", 
        description: "Plan ID" 
      }
    },
    required: ["plan_id"]
  }
}
```

## Enhanced MCP Tools

### 1. Improve Search Plan Tool

**Description:** Enhance the existing `search_plan` tool with more advanced filtering capabilities.

**Tasks:**
- [ ] Update the tool schema to include new filter parameters
- [ ] Implement the enhancements using the improved search API
- [ ] Improve result formatting with more context
- [ ] Add unit tests for the new functionality

**Expected Schema Updates:**
```javascript
{
  name: "search_plan",
  description: "Advanced search within a plan with multiple filters",
  inputSchema: {
    type: "object",
    properties: {
      plan_id: { type: "string", description: "Plan ID" },
      query: { type: "string", description: "Search query" },
      node_types: { 
        type: "array", 
        items: { 
          type: "string",
          enum: ["root", "phase", "task", "milestone"]
        },
        description: "Filter by node types" 
      },
      statuses: { 
        type: "array", 
        items: { 
          type: "string",
          enum: ["not_started", "in_progress", "completed", "blocked"]
        },
        description: "Filter by node statuses" 
      }
    },
    required: ["plan_id", "query"]
  }
}
```

### 2. Enhance Create Node Tool

**Description:** Improve the existing `create_node` tool to support setting node position during creation.

**Tasks:**
- [ ] Update the tool schema to include order_index parameter
- [ ] Modify the implementation to use the parameter when creating nodes
- [ ] Add validation for the new parameter
- [ ] Update unit tests

**Expected Schema Updates:**
```javascript
// Add to existing create_node schema
{
  order_index: { 
    type: "number", 
    description: "Position among siblings (0-based index)" 
  }
}
```

### 3. Enhance Find Plans Tool

**Description:** Improve the existing `find_plans` tool with more sophisticated search capabilities.

**Tasks:**
- [ ] Update the tool schema with additional search parameters
- [ ] Enhance the result formatting to provide more context
- [ ] Improve the search algorithm's relevance
- [ ] Update unit tests

**Expected Schema Updates:**
```javascript
// Add to existing find_plans schema
{
  sort_by: { 
    type: "string", 
    description: "Sort results by field",
    enum: ["title", "created_at", "updated_at", "status", "relevance"]
  },
  sort_direction: { 
    type: "string", 
    description: "Sort direction",
    enum: ["asc", "desc"]
  }
}
```

## New MCP Resources

### 1. Plan Structure Resource

```
plan://{planId}/full-structure
```

**Description:** A resource that provides the complete hierarchical structure of a plan.

**Tasks:**
- [ ] Add the resource definition to the resources list in `src/resources.js`
- [ ] Implement the resource handler using the new plan structure API endpoint
- [ ] Format the structure as readable markdown with proper indentation
- [ ] Add unit tests

### 2. Plan Statistics Resource

```
plan://{planId}/statistics
```

**Description:** A resource that provides statistical information about a plan's progress.

**Tasks:**
- [ ] Add the resource definition to the resources list in `src/resources.js`
- [ ] Implement the resource handler using the new plan statistics API endpoint
- [ ] Format the statistics in a clear, insightful manner
- [ ] Add unit tests

## MCP Prompt Enhancements

### 1. Plan Structure Analysis Prompt

```
analyze_plan_structure
```

**Description:** A prompt that analyzes the structure of a plan for completeness, balance, and organization.

**Tasks:**
- [ ] Add the prompt definition to the prompts list in `src/prompts.js`
- [ ] Implement the prompt handler using the plan structure API
- [ ] Structure the prompt to encourage detailed analysis of the plan hierarchy
- [ ] Add unit tests

**Expected Arguments:**
```javascript
{
  name: "analyze_plan_structure",
  description: "Analyze the structure of a plan for completeness and organization",
  arguments: [
    {
      name: "planId",
      description: "ID of the plan to analyze",
      required: true
    }
  ]
}
```

### 2. Node Recommendations Prompt

```
recommend_node_improvements
```

**Description:** A prompt that suggests improvements for a specific node or set of nodes.

**Tasks:**
- [ ] Add the prompt definition to the prompts list in `src/prompts.js`
- [ ] Implement the prompt handler using the node detail and search APIs
- [ ] Structure the prompt to provide targeted improvement suggestions
- [ ] Add unit tests

**Expected Arguments:**
```javascript
{
  name: "recommend_node_improvements",
  description: "Suggest improvements for specific nodes in a plan",
  arguments: [
    {
      name: "planId",
      description: "ID of the plan",
      required: true
    },
    {
      name: "nodeId",
      description: "ID of the node to analyze (optional)",
      required: false
    },
    {
      name: "nodeType",
      description: "Analyze all nodes of this type (if nodeId not provided)",
      required: false
    }
  ]
}
```

## General Improvements

### 1. Error Handling and Response Formatting

**Tasks:**
- [ ] Improve error handling throughout the MCP server
- [ ] Standardize error messages for better readability
- [ ] Add more detailed context to error responses
- [ ] Implement consistent formatting for all tool and resource responses

### 2. Documentation and Examples

**Tasks:**
- [ ] Update README.md with detailed information about new tools and resources
- [ ] Add examples for each tool showing input and expected output
- [ ] Create a usage guide for complex operations
- [ ] Add troubleshooting section for common issues

### 3. Testing

**Tasks:**
- [ ] Create unit tests for all new tools and resources
- [ ] Implement integration tests for end-to-end functionality
- [ ] Add test cases for error conditions and edge cases
- [ ] Set up test fixtures for different plan structures

## Implementation Timeline

**Phase 1: Core Navigation Tools**
- Get Plan Structure Tool
- List Nodes Tool
- Get Node By Name Tool

**Phase 2: Plan Analysis**
- Get Plan Summary Tool
- Plan Structure Resource
- Plan Statistics Resource

**Phase 3: Node Management**
- Move Node Tool
- Enhance Create Node Tool
- Enhance Find Plans Tool

**Phase 4: Advanced Features and Prompts**
- Plan Structure Analysis Prompt
- Node Recommendations Prompt
- General improvements and error handling

## Dependencies

- These MCP enhancements depend on the corresponding API improvements
- Implementation should be coordinated with the API development timeline
- Some tools could be implemented with client-side processing as an interim solution before API enhancements are complete
