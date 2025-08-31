/**
 * MCP Tools Implementation
 * 
 * Provides comprehensive planning tools for AI agents:
 * - Full CRUD operations on all entities
 * - Unified search across all scopes
 * - Batch operations for efficiency
 * - Rich context retrieval
 * - Text responses for Claude Desktop compatibility
 */

const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const apiClient = require('./api-client');

/**
 * Format JSON data as text for Claude Desktop
 */
function formatResponse(data) {
  // If data is an error object with a message, return just the message
  if (data && data.error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: data.error
        }
      ]
    };
  }
  
  // For successful responses, stringify the data
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

/**
 * Setup tools for the MCP server
 * @param {Server} server - MCP server instance
 */
function setupTools(server) {
  // Suppress console logs when not in debug mode
  if (process.env.NODE_ENV !== 'development') {
    // Silent mode for production
  } else {
    console.error('Setting up MCP tools...');
  }
  
  // Handler for listing available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        // ===== UNIFIED SEARCH TOOL =====
        {
          name: "search",
          description: "Universal search tool for plans, nodes, and content",
          inputSchema: {
            type: "object",
            properties: {
              scope: { 
                type: "string",
                description: "Search scope",
                enum: ["global", "plans", "plan", "node"],
                default: "global"
              },
              scope_id: { 
                type: "string", 
                description: "Plan ID (if scope is 'plan') or Node ID (if scope is 'node')"
              },
              query: { 
                type: "string", 
                description: "Search query"
              },
              filters: {
                type: "object",
                description: "Optional filters",
                properties: {
                  status: { 
                    type: "string",
                    description: "Filter by status",
                    enum: ["draft", "active", "completed", "archived", "not_started", "in_progress", "blocked"]
                  },
                  type: {
                    type: "string",
                    description: "Filter by type",
                    enum: ["plan", "node", "phase", "task", "milestone", "artifact", "log"]
                  },
                  limit: {
                    type: "integer",
                    description: "Maximum number of results",
                    default: 20
                  }
                }
              }
            },
            required: ["query"]
          }
        },
        
        // ===== PLAN MANAGEMENT TOOLS =====
        {
          name: "list_plans",
          description: "List all plans or filter by status",
          inputSchema: {
            type: "object",
            properties: {
              status: { 
                type: "string", 
                description: "Optional filter by plan status",
                enum: ["draft", "active", "completed", "archived"]
              }
            }
          }
        },
        {
          name: "create_plan",
          description: "Create a new plan",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string", description: "Plan title" },
              description: { type: "string", description: "Plan description" },
              status: { 
                type: "string", 
                description: "Plan status",
                enum: ["draft", "active", "completed", "archived"],
                default: "draft"
              }
            },
            required: ["title"]
          }
        },
        {
          name: "update_plan",
          description: "Update an existing plan",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              title: { type: "string", description: "New plan title" },
              description: { type: "string", description: "New plan description" },
              status: { 
                type: "string", 
                description: "New plan status",
                enum: ["draft", "active", "completed", "archived"]
              }
            },
            required: ["plan_id"]
          }
        },
        {
          name: "delete_plan",
          description: "Delete a plan",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID to delete" }
            },
            required: ["plan_id"]
          }
        },
        
        // ===== NODE MANAGEMENT TOOLS =====
        {
          name: "create_node",
          description: "Create a new node in a plan",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              parent_id: { type: "string", description: "Parent node ID (optional, defaults to root)" },
              node_type: { 
                type: "string", 
                description: "Node type",
                enum: ["phase", "task", "milestone"]
              },
              title: { type: "string", description: "Node title" },
              description: { type: "string", description: "Node description" },
              status: { 
                type: "string", 
                description: "Node status",
                enum: ["not_started", "in_progress", "completed", "blocked"],
                default: "not_started"
              },
              context: { type: "string", description: "Additional context for the node" },
              agent_instructions: { type: "string", description: "Instructions for AI agents working on this node" },
              acceptance_criteria: { type: "string", description: "Criteria for node completion" },
              due_date: { type: "string", description: "Due date (ISO format)" },
              metadata: { type: "object", description: "Additional metadata" }
            },
            required: ["plan_id", "node_type", "title"]
          }
        },
        {
          name: "update_node",
          description: "Update a node's properties",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              node_id: { type: "string", description: "Node ID" },
              title: { type: "string", description: "New node title" },
              description: { type: "string", description: "New node description" },
              status: { 
                type: "string", 
                description: "New node status",
                enum: ["not_started", "in_progress", "completed", "blocked"]
              },
              context: { type: "string", description: "New context" },
              agent_instructions: { type: "string", description: "New agent instructions" },
              acceptance_criteria: { type: "string", description: "New acceptance criteria" },
              due_date: { type: "string", description: "New due date (ISO format)" },
              metadata: { type: "object", description: "New metadata" }
            },
            required: ["plan_id", "node_id"]
          }
        },
        {
          name: "delete_node",
          description: "Delete a node and all its children",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              node_id: { type: "string", description: "Node ID to delete" }
            },
            required: ["plan_id", "node_id"]
          }
        },
        {
          name: "move_node",
          description: "Move a node to a different parent or position",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              node_id: { type: "string", description: "Node ID to move" },
              parent_id: { type: "string", description: "New parent node ID" },
              order_index: { type: "integer", description: "New position index" }
            },
            required: ["plan_id", "node_id"]
          }
        },
        {
          name: "get_node_context",
          description: "Get comprehensive context for a node including children, logs, and artifacts",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              node_id: { type: "string", description: "Node ID" }
            },
            required: ["plan_id", "node_id"]
          }
        },
        {
          name: "get_node_ancestry",
          description: "Get the path from root to a specific node",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              node_id: { type: "string", description: "Node ID" }
            },
            required: ["plan_id", "node_id"]
          }
        },
        
        // ===== LOGGING TOOLS (Replaces Comments) =====
        {
          name: "add_log",
          description: "Add a log entry to a node (replaces comments)",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              node_id: { type: "string", description: "Node ID" },
              content: { type: "string", description: "Log content" },
              log_type: { 
                type: "string", 
                description: "Type of log entry",
                enum: ["progress", "reasoning", "challenge", "decision", "comment"],
                default: "comment"
              },
              tags: { 
                type: "array", 
                description: "Tags for categorizing the log entry",
                items: { type: "string" }
              }
            },
            required: ["plan_id", "node_id", "content"]
          }
        },
        {
          name: "get_logs",
          description: "Get log entries for a node",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              node_id: { type: "string", description: "Node ID" },
              log_type: { 
                type: "string", 
                description: "Filter by log type",
                enum: ["progress", "reasoning", "challenge", "decision", "comment"]
              },
              limit: {
                type: "integer",
                description: "Maximum number of logs to return",
                default: 50
              }
            },
            required: ["plan_id", "node_id"]
          }
        },
        
        // ===== ARTIFACT MANAGEMENT =====
        {
          name: "manage_artifact",
          description: "Add, get, or search for artifacts",
          inputSchema: {
            type: "object",
            properties: {
              action: {
                type: "string",
                description: "Action to perform",
                enum: ["add", "get", "search", "list"]
              },
              plan_id: { type: "string", description: "Plan ID" },
              node_id: { type: "string", description: "Node ID" },
              artifact_id: { type: "string", description: "Artifact ID (for 'get' action)" },
              name: { type: "string", description: "Artifact name (for 'add' or 'search')" },
              content_type: { type: "string", description: "Content MIME type (for 'add')" },
              url: { type: "string", description: "URL where artifact can be accessed (for 'add')" },
              metadata: { type: "object", description: "Additional metadata (for 'add')" }
            },
            required: ["action", "plan_id", "node_id"]
          }
        },
        
        // ===== BATCH OPERATIONS =====
        {
          name: "batch_update_nodes",
          description: "Update multiple nodes at once",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              updates: {
                type: "array",
                description: "List of node updates",
                items: {
                  type: "object",
                  properties: {
                    node_id: { type: "string", description: "Node ID" },
                    status: { 
                      type: "string",
                      enum: ["not_started", "in_progress", "completed", "blocked"]
                    },
                    title: { type: "string" },
                    description: { type: "string" }
                  },
                  required: ["node_id"]
                }
              }
            },
            required: ["plan_id", "updates"]
          }
        },
        {
          name: "batch_get_artifacts",
          description: "Get multiple artifacts at once",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              artifact_requests: {
                type: "array",
                description: "List of artifact requests",
                items: {
                  type: "object",
                  properties: {
                    node_id: { type: "string", description: "Node ID" },
                    artifact_id: { type: "string", description: "Artifact ID" }
                  },
                  required: ["node_id", "artifact_id"]
                }
              }
            },
            required: ["plan_id", "artifact_requests"]
          }
        },
        
        // ===== PLAN STRUCTURE & SUMMARY =====
        {
          name: "get_plan_structure",
          description: "Get the complete hierarchical structure of a plan",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              include_details: { 
                type: "boolean", 
                description: "Include full node details",
                default: false
              }
            },
            required: ["plan_id"]
          }
        },
        {
          name: "get_plan_summary",
          description: "Get a comprehensive summary with statistics",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" }
            },
            required: ["plan_id"]
          }
        }
      ]
    };
  });
  
  // Handler for calling tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.error(`Calling tool: ${name} with arguments:`, args);
    }
    
    try {
      // ===== UNIFIED SEARCH TOOL =====
      if (name === "search") {
        const { scope, scope_id, query, filters = {} } = args;
        
        let results = [];
        
        switch (scope) {
          case "global":
            // Global search across all plans
            const searchWrapper = require('./tools/search-wrapper');
            results = await searchWrapper.globalSearch(query);
            break;
            
          case "plans":
            // Search only in plan titles/descriptions
            const plans = await apiClient.plans.getPlans();
            
            // Handle wildcard queries
            if (query === '*' || query === '' || !query) {
              // Return all plans (with optional status filter)
              results = plans.filter(plan => 
                !filters.status || plan.status === filters.status
              );
            } else {
              // Normal search
              const queryLower = query.toLowerCase();
              results = plans.filter(plan => {
                const titleMatch = plan.title.toLowerCase().includes(queryLower);
                const descMatch = plan.description?.toLowerCase().includes(queryLower);
                const statusMatch = !filters.status || plan.status === filters.status;
                return (titleMatch || descMatch) && statusMatch;
              });
            }
            break;
            
          case "plan":
            // Search within a specific plan
            if (!scope_id) {
              throw new Error("scope_id (plan_id) is required when scope is 'plan'");
            }
            const searchWrapperPlan = require('./tools/search-wrapper');
            results = await searchWrapperPlan.searchPlan(scope_id, query);
            break;
            
          case "node":
            // Search within a specific node's children
            if (!scope_id) {
              throw new Error("scope_id (node_id) is required when scope is 'node'");
            }
            // This would need a specific implementation
            results = [];
            break;
            
          default:
            // Default to global search
            const searchWrapperDefault = require('./tools/search-wrapper');
            results = await searchWrapperDefault.globalSearch(query);
        }
        
        // Apply filters
        if (filters.type) {
          results = results.filter(item => item.type === filters.type);
        }
        if (filters.limit) {
          results = results.slice(0, filters.limit);
        }
        
        return formatResponse({
          query,
          scope,
          scope_id,
          filters,
          count: results.length,
          results
        });
      }
      
      // ===== PLAN MANAGEMENT =====
      if (name === "list_plans") {
        const { status } = args;
        const plans = await apiClient.plans.getPlans();
        const filteredPlans = status ? plans.filter(p => p.status === status) : plans;
        return formatResponse(filteredPlans);
      }
      
      if (name === "create_plan") {
        const result = await apiClient.plans.createPlan(args);
        return formatResponse(result);
      }
      
      if (name === "update_plan") {
        const { plan_id, ...planData } = args;
        const result = await apiClient.plans.updatePlan(plan_id, planData);
        return formatResponse(result);
      }
      
      if (name === "delete_plan") {
        const { plan_id } = args;
        await apiClient.plans.deletePlan(plan_id);
        return formatResponse({
          success: true,
          message: `Plan ${plan_id} deleted successfully`
        });
      }
      
      // ===== NODE MANAGEMENT =====
      if (name === "create_node") {
        const { plan_id, ...nodeData } = args;
        const result = await apiClient.nodes.createNode(plan_id, nodeData);
        return formatResponse(result);
      }
      
      if (name === "update_node") {
        const { plan_id, node_id, ...nodeData } = args;
        const result = await apiClient.nodes.updateNode(plan_id, node_id, nodeData);
        return formatResponse(result);
      }
      
      if (name === "delete_node") {
        const { plan_id, node_id } = args;
        await apiClient.nodes.deleteNode(plan_id, node_id);
        return formatResponse({
          success: true,
          message: `Node ${node_id} and its children deleted successfully`
        });
      }
      
      if (name === "move_node") {
        const { plan_id, node_id, parent_id, order_index } = args;
        
        try {
          // Call the move endpoint - using POST as per API definition
          const response = await apiClient.axiosInstance.post(
            `/plans/${plan_id}/nodes/${node_id}/move`,
            { 
              parent_id: parent_id || null,
              order_index: order_index !== undefined ? order_index : null
            }
          );
          
          return formatResponse(response.data);
        } catch (error) {
          // If endpoint still doesn't work, try updating the node directly
          if (error.response && error.response.status === 404) {
            console.error('Move endpoint not found, trying direct update');
            // Fallback to updating the node's parent_id via regular update
            const updateResponse = await apiClient.nodes.updateNode(plan_id, node_id, {
              parent_id: parent_id || null,
              order_index: order_index !== undefined ? order_index : null
            });
            return formatResponse(updateResponse);
          }
          throw error;
        }
      }
      
      if (name === "get_node_context") {
        const { plan_id, node_id } = args;
        
        // Get node with context
        const response = await apiClient.axiosInstance.get(
          `/plans/${plan_id}/nodes/${node_id}/context`
        );
        
        return formatResponse(response.data);
      }
      
      if (name === "get_node_ancestry") {
        const { plan_id, node_id } = args;
        
        // Get node ancestry
        const response = await apiClient.axiosInstance.get(
          `/plans/${plan_id}/nodes/${node_id}/ancestry`
        );
        
        return formatResponse(response.data);
      }
      
      // ===== LOGGING =====
      if (name === "add_log") {
        const { plan_id, node_id, content, log_type = "comment", tags } = args;
        
        const logData = {
          content,
          log_type,
          tags
        };
        
        const result = await apiClient.logs.addLogEntry(plan_id, node_id, logData);
        return formatResponse(result);
      }
      
      if (name === "get_logs") {
        const { plan_id, node_id, log_type, limit = 50 } = args;
        
        let logs = await apiClient.logs.getLogs(plan_id, node_id);
        
        // Apply filters
        if (log_type) {
          logs = logs.filter(log => log.log_type === log_type);
        }
        
        // Apply limit
        logs = logs.slice(0, limit);
        
        return formatResponse(logs);
      }
      
      // ===== ARTIFACT MANAGEMENT =====
      if (name === "manage_artifact") {
        const { action, plan_id, node_id, ...params } = args;
        
        switch (action) {
          case "add":
            const { name, content_type, url, metadata } = params;
            const newArtifact = await apiClient.artifacts.addArtifact(plan_id, node_id, {
              name,
              content_type,
              url,
              metadata
            });
            return formatResponse(newArtifact);
            
          case "get":
            const { artifact_id } = params;
            const artifact = await apiClient.artifacts.getArtifact(plan_id, node_id, artifact_id);
            const content = await apiClient.artifacts.getArtifactContent(plan_id, node_id, artifact_id);
            return formatResponse({
              ...artifact,
              content
            });
            
          case "search":
            const { name: searchName } = params;
            const artifacts = await apiClient.artifacts.getArtifacts(plan_id, node_id);
            const searchLower = searchName.toLowerCase();
            const matches = artifacts.filter(a => 
              a.name.toLowerCase().includes(searchLower)
            );
            return formatResponse(matches);
            
          case "list":
            const allArtifacts = await apiClient.artifacts.getArtifacts(plan_id, node_id);
            return formatResponse(allArtifacts);
            
          default:
            throw new Error(`Unknown artifact action: ${action}`);
        }
      }
      
      // ===== BATCH OPERATIONS =====
      if (name === "batch_update_nodes") {
        const { plan_id, updates } = args;
        
        const results = [];
        const errors = [];
        
        for (const update of updates) {
          const { node_id, ...updateData } = update;
          try {
            const result = await apiClient.nodes.updateNode(plan_id, node_id, updateData);
            results.push({ node_id, success: true, data: result });
          } catch (error) {
            errors.push({ node_id, success: false, error: error.message });
          }
        }
        
        return formatResponse({
          total: updates.length,
          successful: results.length,
          failed: errors.length,
          results,
          errors
        });
      }
      
      if (name === "batch_get_artifacts") {
        const { plan_id, artifact_requests } = args;
        
        const results = [];
        const errors = [];
        
        for (const request of artifact_requests) {
          const { node_id, artifact_id } = request;
          try {
            const artifact = await apiClient.artifacts.getArtifact(plan_id, node_id, artifact_id);
            const content = await apiClient.artifacts.getArtifactContent(plan_id, node_id, artifact_id);
            results.push({
              node_id,
              artifact_id,
              success: true,
              data: { ...artifact, content }
            });
          } catch (error) {
            errors.push({
              node_id,
              artifact_id,
              success: false,
              error: error.message
            });
          }
        }
        
        return formatResponse({
          total: artifact_requests.length,
          successful: results.length,
          failed: errors.length,
          results,
          errors
        });
      }
      
      // ===== PLAN STRUCTURE & SUMMARY =====
      if (name === "get_plan_structure") {
        const { plan_id, include_details = false } = args;
        
        const plan = await apiClient.plans.getPlan(plan_id);
        const nodes = await apiClient.nodes.getNodes(plan_id);
        
        // The API already returns a tree structure, not a flat list
        // If it's already hierarchical, use it directly
        let structure;
        if (Array.isArray(nodes) && nodes.length > 0 && nodes[0].children !== undefined) {
          // Already hierarchical - use directly
          structure = nodes;
        } else {
          // Flat list - build hierarchy
          structure = buildNodeHierarchy(nodes, include_details);
        }
        
        return formatResponse({
          plan: {
            id: plan.id,
            title: plan.title,
            status: plan.status,
            description: plan.description
          },
          structure
        });
      }
      
      if (name === "get_plan_summary") {
        const { plan_id } = args;
        
        const plan = await apiClient.plans.getPlan(plan_id);
        const nodes = await apiClient.nodes.getNodes(plan_id);
        
        // Calculate statistics
        const stats = calculatePlanStatistics(nodes);
        
        return formatResponse({
          plan: {
            id: plan.id,
            title: plan.title,
            status: plan.status,
            description: plan.description,
            created_at: plan.created_at,
            updated_at: plan.updated_at
          },
          statistics: stats,
          progress_percentage: stats.total > 0 
            ? ((stats.status_counts.completed / stats.total) * 100).toFixed(1)
            : 0
        });
      }
      
      // Tool not found
      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`Error calling tool ${name}:`, error);
      }
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`
          }
        ]
      };
    }
  });
  
  if (process.env.NODE_ENV === 'development') {
    console.error('Tools setup complete');
  }
}

/**
 * Build hierarchical node structure
 */
function buildNodeHierarchy(nodes, includeDetails = false) {
  if (!nodes || nodes.length === 0) {
    return [];
  }
  
  // Debug logging to understand the structure
  if (process.env.NODE_ENV === 'development') {
    console.error('Building hierarchy for nodes:', nodes.length);
    if (nodes[0]) {
      console.error('Sample node:', {
        id: nodes[0].id,
        parent_id: nodes[0].parent_id,
        node_type: nodes[0].node_type
      });
    }
  }
  
  const nodeMap = new Map();
  const rootNodes = [];
  
  // First pass: create all nodes in the map
  nodes.forEach(node => {
    const nodeData = includeDetails ? { ...node } : {
      id: node.id,
      title: node.title,
      node_type: node.node_type,
      status: node.status,
      parent_id: node.parent_id,
      order_index: node.order_index
    };
    
    // Initialize with empty children array
    nodeMap.set(node.id, {
      ...nodeData,
      children: []
    });
  });
  
  // Second pass: build parent-child relationships
  nodes.forEach(node => {
    const currentNode = nodeMap.get(node.id);
    
    if (node.parent_id) {
      const parent = nodeMap.get(node.parent_id);
      if (parent) {
        // Add as child to parent
        parent.children.push(currentNode);
      } else {
        // Parent not found, treat as root
        if (process.env.NODE_ENV === 'development') {
          console.error(`Parent ${node.parent_id} not found for node ${node.id}`);
        }
        rootNodes.push(currentNode);
      }
    } else {
      // No parent_id means it's a root node
      rootNodes.push(currentNode);
    }
  });
  
  // Special case: if we have a single root node of type 'root', return its children
  if (rootNodes.length === 1 && rootNodes[0].node_type === 'root') {
    // Return the root node itself with its children
    const rootNode = rootNodes[0];
    
    // Sort children by order_index
    const sortNodes = (nodeArray) => {
      nodeArray.sort((a, b) => {
        const orderA = a.order_index ?? 999;
        const orderB = b.order_index ?? 999;
        return orderA - orderB;
      });
      
      nodeArray.forEach(node => {
        if (node.children && node.children.length > 0) {
          sortNodes(node.children);
        }
      });
    };
    
    sortNodes(rootNode.children);
    return [rootNode]; // Return root with its properly sorted children
  }
  
  // Sort all root nodes and their children
  const sortNodes = (nodeArray) => {
    nodeArray.sort((a, b) => {
      const orderA = a.order_index ?? 999;
      const orderB = b.order_index ?? 999;
      return orderA - orderB;
    });
    
    nodeArray.forEach(node => {
      if (node.children && node.children.length > 0) {
        sortNodes(node.children);
      }
    });
  };
  
  sortNodes(rootNodes);
  
  return rootNodes;
}

/**
 * Calculate plan statistics
 */
function calculatePlanStatistics(nodes) {
  const stats = {
    total: 0,
    type_counts: {
      root: 0,
      phase: 0,
      task: 0,
      milestone: 0
    },
    status_counts: {
      not_started: 0,
      in_progress: 0,
      completed: 0,
      blocked: 0
    },
    in_progress_nodes: [],
    blocked_nodes: []
  };
  
  const processNode = (node) => {
    stats.total++;
    
    if (node.node_type && stats.type_counts[node.node_type] !== undefined) {
      stats.type_counts[node.node_type]++;
    }
    
    if (node.status && stats.status_counts[node.status] !== undefined) {
      stats.status_counts[node.status]++;
      
      if (node.status === 'in_progress') {
        stats.in_progress_nodes.push({
          id: node.id,
          title: node.title,
          type: node.node_type
        });
      } else if (node.status === 'blocked') {
        stats.blocked_nodes.push({
          id: node.id,
          title: node.title,
          type: node.node_type
        });
      }
    }
    
    if (node.children && node.children.length > 0) {
      node.children.forEach(processNode);
    }
  };
  
  nodes.forEach(processNode);
  
  return stats;
}

module.exports = { setupTools };
