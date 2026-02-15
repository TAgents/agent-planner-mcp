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
        // ========================================
        // QUICK ACTIONS - Low friction entry points
        // Use these for common operations
        // ========================================
        {
          name: "quick_plan",
          description: "Create a plan quickly from a title and list of tasks. Perfect for getting started fast - just provide a title and task names. Returns plan URL and task IDs for immediate use.",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string", description: "Plan title" },
              description: { type: "string", description: "Optional plan description" },
              tasks: { 
                type: "array", 
                items: { type: "string" },
                description: "List of task titles (simple strings). A phase will be created automatically."
              },
              goal_id: { type: "string", description: "Optionally link to a goal" },
              organization_id: { type: "string", description: "Organization ID (uses default if not provided)" }
            },
            required: ["title", "tasks"]
          }
        },
        {
          name: "quick_task",
          description: "Add a single task to an existing plan. Minimal parameters - just plan_id and title. Automatically adds to the first phase or creates one.",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan to add task to" },
              title: { type: "string", description: "Task title" },
              description: { type: "string", description: "Optional task description" },
              phase_id: { type: "string", description: "Specific phase to add to (optional - uses first phase if not provided)" },
              agent_instructions: { type: "string", description: "Instructions for AI agents working on this task" }
            },
            required: ["plan_id", "title"]
          }
        },
        {
          name: "quick_status",
          description: "Update a task's status. The most common operation - made simple. Returns what to do next.",
          inputSchema: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "Task ID to update" },
              plan_id: { type: "string", description: "Plan ID (required for API)" },
              status: { 
                type: "string", 
                enum: ["not_started", "in_progress", "completed", "blocked"],
                description: "New status"
              },
              note: { type: "string", description: "Optional note explaining the status change (especially useful for 'blocked')" }
            },
            required: ["task_id", "plan_id", "status"]
          }
        },
        {
          name: "quick_log",
          description: "Add a progress note to a task. Use this to document work as you go - helps humans follow along and other agents understand what happened.",
          inputSchema: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "Task ID" },
              plan_id: { type: "string", description: "Plan ID" },
              message: { type: "string", description: "What you did or learned" },
              log_type: { 
                type: "string", 
                enum: ["progress", "decision", "blocker", "completion"],
                default: "progress",
                description: "Type of log entry"
              }
            },
            required: ["task_id", "plan_id", "message"]
          }
        },

        // ========================================
        // CONTEXT LOADING - Get everything you need
        // Use before starting work on a plan/goal
        // ========================================
        {
          name: "get_context",
          description: "Load EVERYTHING you need to work on a plan or goal: structure, status, progress, blocked tasks, recent activity, and relevant knowledge. Call this FIRST before starting work.",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan to get context for" },
              goal_id: { type: "string", description: "Goal to get context for" },
              include_knowledge: { type: "boolean", default: true, description: "Include relevant knowledge entries" }
            }
          }
        },
        {
          name: "get_my_tasks",
          description: "Get tasks that need attention - blocked tasks, in-progress tasks, and next tasks to start. Perfect for heartbeat check-ins.",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Specific plan to check (optional - checks all if not provided)" },
              status: { 
                type: "array", 
                items: { type: "string" },
                default: ["blocked", "in_progress"],
                description: "Task statuses to include"
              }
            }
          }
        },

        // ========================================
        // KNOWLEDGE - Build persistent memory
        // ========================================
        {
          name: "add_learning",
          description: "Capture something you learned for future reference. This persists beyond the current session - other agents and future-you will benefit.",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string", description: "Brief title summarizing the learning" },
              content: { type: "string", description: "What you learned - be specific and include context" },
              scope: { type: "string", enum: ["organization", "goal", "plan"], description: "Where to store this (defaults to organization)" },
              scope_id: { type: "string", description: "ID of the organization/goal/plan" },
              tags: { type: "array", items: { type: "string" }, description: "Tags for easier retrieval" },
              entry_type: {
                type: "string",
                enum: ["learning", "decision", "context", "constraint"],
                default: "learning",
                description: "Type of knowledge"
              }
            },
            required: ["title", "content"]
          }
        },

        // ========================================
        // MARKDOWN EXPORT/IMPORT - Filesystem pattern
        // ========================================
        {
          name: "export_plan_markdown",
          description: "Export a plan as markdown text. Useful for reviewing plans in text format or saving to files.",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan to export" },
              include_descriptions: { type: "boolean", default: true, description: "Include task descriptions" },
              include_status: { type: "boolean", default: true, description: "Include status indicators" }
            },
            required: ["plan_id"]
          }
        },
        {
          name: "import_plan_markdown",
          description: "Create a new plan from markdown text. Parses headings as phases and list items as tasks. Great for converting text plans into structured AgentPlanner plans.",
          inputSchema: {
            type: "object",
            properties: {
              markdown: { 
                type: "string", 
                description: "Markdown text to parse. Use # for title, ## for phases, - for tasks" 
              },
              title: { 
                type: "string", 
                description: "Plan title (optional - extracted from first # heading if not provided)" 
              },
              goal_id: { type: "string", description: "Optionally link to a goal" }
            },
            required: ["markdown"]
          }
        },

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
                    enum: ["plan", "node", "phase", "task", "milestone", "log"]
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
        {
          name: "share_plan",
          description: "Share a plan by making it public or private. Public plans can be viewed by anyone with the link.",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID to share" },
              visibility: { 
                type: "string", 
                description: "Plan visibility setting",
                enum: ["public", "private"],
                default: "public"
              },
              github_repo_owner: { 
                type: "string", 
                description: "GitHub repository owner (optional, for linking public plans to a repo)" 
              },
              github_repo_name: { 
                type: "string", 
                description: "GitHub repository name (optional, for linking public plans to a repo)" 
              }
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
          description: "Get comprehensive context for a node including children and logs",
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
        
        // ===== PLAN STRUCTURE & SUMMARY =====
        {
          name: "get_plan_structure",
          description: "Get the hierarchical structure of a plan with minimal fields (id, parent_id, node_type, title, status, order_index). Use get_node_context for detailed information about specific nodes.",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              include_details: {
                type: "boolean",
                description: "Include full node details (description, context, agent_instructions, etc.). Default is false for efficient context usage.",
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
        },
        
        // ===== AGENT CONTEXT TOOLS (Leaf-up context loading) =====
        {
          name: "get_agent_context",
          description: "Get focused context for a specific task/node. Uses leaf-up traversal - returns only the relevant path from the node to root, not the entire plan tree. Best for agents starting work on a specific task.",
          inputSchema: {
            type: "object",
            properties: {
              node_id: { 
                type: "string", 
                description: "Task or phase node ID to get context for" 
              },
              include_knowledge: { 
                type: "boolean", 
                description: "Include knowledge entries from relevant scopes (plan, goals, org)",
                default: true
              },
              include_siblings: { 
                type: "boolean", 
                description: "Include sibling tasks in the same phase",
                default: false
              }
            },
            required: ["node_id"]
          }
        },
        {
          name: "get_plan_context",
          description: "Get plan-level context overview. Returns plan details, phase summaries (not full tree), linked goals, and organization. Use get_agent_context for task-focused work.",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { 
                type: "string", 
                description: "Plan ID" 
              },
              include_knowledge: { 
                type: "boolean", 
                description: "Include knowledge entries",
                default: true
              }
            },
            required: ["plan_id"]
          }
        },
        
        // ===== ORGANIZATION TOOLS =====
        {
          name: "list_organizations",
          description: "List all organizations the user is a member of",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "get_organization",
          description: "Get organization details including member count and plan count",
          inputSchema: {
            type: "object",
            properties: {
              organization_id: { type: "string", description: "Organization ID" }
            },
            required: ["organization_id"]
          }
        },
        {
          name: "create_organization",
          description: "Create a new organization. You become the owner.",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Organization name" },
              description: { type: "string", description: "Organization description" },
              slug: { type: "string", description: "URL-friendly slug (auto-generated if not provided)" }
            },
            required: ["name"]
          }
        },
        {
          name: "update_organization",
          description: "Update organization details (owner only)",
          inputSchema: {
            type: "object",
            properties: {
              organization_id: { type: "string", description: "Organization ID" },
              name: { type: "string", description: "New name" },
              description: { type: "string", description: "New description" }
            },
            required: ["organization_id"]
          }
        },
        
        // ===== GOAL TOOLS =====
        {
          name: "list_goals",
          description: "List goals, optionally filtered by organization or status",
          inputSchema: {
            type: "object",
            properties: {
              organization_id: { type: "string", description: "Filter by organization ID" },
              status: { 
                type: "string", 
                description: "Filter by status",
                enum: ["active", "achieved", "at_risk", "abandoned"]
              }
            }
          }
        },
        {
          name: "get_goal",
          description: "Get goal details including linked plans",
          inputSchema: {
            type: "object",
            properties: {
              goal_id: { type: "string", description: "Goal ID" }
            },
            required: ["goal_id"]
          }
        },
        {
          name: "create_goal",
          description: "Create a new goal within an organization",
          inputSchema: {
            type: "object",
            properties: {
              organization_id: { type: "string", description: "Organization ID" },
              title: { type: "string", description: "Goal title" },
              description: { type: "string", description: "Goal description" },
              success_metrics: { 
                type: "array", 
                description: "Success metrics array [{metric, target, current, unit}]",
                items: {
                  type: "object",
                  properties: {
                    metric: { type: "string" },
                    target: { type: "number" },
                    current: { type: "number" },
                    unit: { type: "string" }
                  }
                }
              },
              time_horizon: { type: "string", description: "Target date (ISO format)" },
              github_repo_url: { type: "string", description: "Related GitHub repo URL" }
            },
            required: ["organization_id", "title"]
          }
        },
        {
          name: "update_goal",
          description: "Update goal details or status",
          inputSchema: {
            type: "object",
            properties: {
              goal_id: { type: "string", description: "Goal ID" },
              title: { type: "string", description: "New title" },
              description: { type: "string", description: "New description" },
              status: { 
                type: "string", 
                description: "New status",
                enum: ["active", "achieved", "at_risk", "abandoned"]
              },
              success_metrics: { type: "array", description: "Updated metrics" },
              time_horizon: { type: "string", description: "New target date" }
            },
            required: ["goal_id"]
          }
        },
        {
          name: "link_plan_to_goal",
          description: "Link a plan to a goal (shows the plan contributes to this goal)",
          inputSchema: {
            type: "object",
            properties: {
              goal_id: { type: "string", description: "Goal ID" },
              plan_id: { type: "string", description: "Plan ID to link" }
            },
            required: ["goal_id", "plan_id"]
          }
        },
        {
          name: "unlink_plan_from_goal",
          description: "Remove a plan-goal link",
          inputSchema: {
            type: "object",
            properties: {
              goal_id: { type: "string", description: "Goal ID" },
              plan_id: { type: "string", description: "Plan ID to unlink" }
            },
            required: ["goal_id", "plan_id"]
          }
        },
        
        // ===== KNOWLEDGE TOOLS =====
        {
          name: "add_knowledge_entry",
          description: "Add a knowledge entry (decision, context, constraint, learning, reference, note) to a scope",
          inputSchema: {
            type: "object",
            properties: {
              scope: { 
                type: "string", 
                description: "Scope type",
                enum: ["organization", "goal", "plan"]
              },
              scope_id: { type: "string", description: "ID of the org, goal, or plan" },
              entry_type: { 
                type: "string", 
                description: "Type of knowledge entry",
                enum: ["decision", "context", "constraint", "learning", "reference", "note"]
              },
              title: { type: "string", description: "Entry title" },
              content: { type: "string", description: "Entry content" },
              source_url: { type: "string", description: "Source URL (optional)" },
              tags: { type: "array", description: "Tags for categorization", items: { type: "string" } }
            },
            required: ["scope", "scope_id", "entry_type", "title", "content"]
          }
        },
        {
          name: "list_knowledge_entries",
          description: "List knowledge entries for a scope",
          inputSchema: {
            type: "object",
            properties: {
              scope: { 
                type: "string", 
                description: "Scope type",
                enum: ["organization", "goal", "plan"]
              },
              scope_id: { type: "string", description: "ID of the org, goal, or plan" },
              entry_type: { 
                type: "string", 
                description: "Filter by entry type",
                enum: ["decision", "context", "constraint", "learning", "reference", "note"]
              },
              tags: { type: "string", description: "Filter by tags (comma-separated)" },
              limit: { type: "integer", description: "Max entries to return", default: 50 }
            },
            required: ["scope", "scope_id"]
          }
        },
        {
          name: "search_knowledge",
          description: "Search knowledge entries across scopes using text search",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
              scope: { 
                type: "string", 
                description: "Limit to scope type",
                enum: ["organization", "goal", "plan"]
              },
              scope_id: { type: "string", description: "Limit to specific scope" },
              entry_types: { 
                type: "array", 
                description: "Filter by entry types",
                items: { type: "string" }
              },
              limit: { type: "integer", description: "Max results", default: 10 }
            },
            required: ["query"]
          }
        },
        {
          name: "update_knowledge_entry",
          description: "Update a knowledge entry",
          inputSchema: {
            type: "object",
            properties: {
              entry_id: { type: "string", description: "Entry ID" },
              title: { type: "string", description: "New title" },
              content: { type: "string", description: "New content" },
              entry_type: { type: "string", description: "New type" },
              tags: { type: "array", description: "New tags", items: { type: "string" } }
            },
            required: ["entry_id"]
          }
        },
        {
          name: "delete_knowledge_entry",
          description: "Delete a knowledge entry",
          inputSchema: {
            type: "object",
            properties: {
              entry_id: { type: "string", description: "Entry ID to delete" }
            },
            required: ["entry_id"]
          }
        },

        // ===== HELPER / GUIDANCE TOOLS =====
        {
          name: "get_started",
          description: "Get guidance on how to use AgentPlanner effectively. Returns an overview of the system and recommended workflows for common tasks. Call this when you're new to AgentPlanner or need to understand how to approach a task.",
          inputSchema: {
            type: "object",
            properties: {
              topic: { 
                type: "string", 
                enum: ["overview", "planning", "execution", "knowledge", "collaboration"],
                description: "Specific topic to learn about: 'overview' (system intro), 'planning' (creating plans), 'execution' (working through tasks), 'knowledge' (storing decisions/learnings), 'collaboration' (working with others)",
                default: "overview"
              }
            }
          }
        },
        {
          name: "understand_context",
          description: "Get comprehensive context about a plan or goal - its purpose, current state, recent activity, blocked tasks, and relevant knowledge. Use this BEFORE starting work to understand the full situation.",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID to understand" },
              goal_id: { type: "string", description: "Goal ID to understand" },
              include_knowledge: { type: "boolean", description: "Include relevant knowledge entries", default: true }
            }
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
      // ========================================
      // QUICK ACTIONS IMPLEMENTATIONS
      // ========================================
      
      if (name === "quick_plan") {
        const { title, description, tasks, goal_id, organization_id } = args;
        
        if (!tasks || tasks.length === 0) {
          return formatResponse({
            error: "At least one task is required",
            suggestion: "Provide an array of task titles in the 'tasks' parameter"
          });
        }
        
        // Create the plan
        const planData = { title };
        if (description) planData.description = description;
        if (organization_id) planData.organization_id = organization_id;
        
        const plan = await apiClient.plans.createPlan(planData);
        
        // Get the root node
        const nodes = await apiClient.nodes.getNodes(plan.id);
        const rootNode = nodes.find(n => n.node_type === 'root') || nodes[0];
        
        // Create a phase for the tasks
        const phase = await apiClient.nodes.createNode(plan.id, {
          parent_id: rootNode.id,
          node_type: 'phase',
          title: 'Tasks',
          status: 'not_started',
          order_index: 0
        });
        
        // Create tasks
        const createdTasks = [];
        for (let i = 0; i < tasks.length; i++) {
          const task = await apiClient.nodes.createNode(plan.id, {
            parent_id: phase.id,
            node_type: 'task',
            title: tasks[i],
            status: 'not_started',
            order_index: i
          });
          createdTasks.push({ id: task.id, title: task.title });
        }
        
        // Link to goal if provided
        if (goal_id) {
          try {
            await apiClient.goals.linkPlan(goal_id, plan.id);
          } catch (e) {
            // Goal linking failed, continue anyway
          }
        }
        
        return formatResponse({
          success: true,
          message: `Plan "${title}" created with ${tasks.length} tasks`,
          plan_id: plan.id,
          plan_url: `https://www.agentplanner.io/app/plans/${plan.id}`,
          phase_id: phase.id,
          task_ids: createdTasks.map(t => t.id),
          tasks: createdTasks,
          next_steps: [
            "Use quick_status to update task progress",
            "Use quick_log to document your work",
            "Use get_context to load full plan details"
          ]
        });
      }
      
      if (name === "quick_task") {
        const { plan_id, title, description, phase_id, agent_instructions } = args;
        
        // Get plan structure to find the phase
        const nodes = await apiClient.nodes.getNodes(plan_id);
        const flatNodes = flattenNodes(nodes);
        
        // Find target phase
        let targetPhaseId = phase_id;
        if (!targetPhaseId) {
          // Find first phase
          const phases = flatNodes.filter(n => n.node_type === 'phase');
          if (phases.length > 0) {
            targetPhaseId = phases[0].id;
          } else {
            // No phase exists, create one
            const rootNode = flatNodes.find(n => n.node_type === 'root') || nodes[0];
            const newPhase = await apiClient.nodes.createNode(plan_id, {
              parent_id: rootNode.id,
              node_type: 'phase',
              title: 'Tasks',
              status: 'not_started',
              order_index: 0
            });
            targetPhaseId = newPhase.id;
          }
        }
        
        // Get task count in phase for order_index
        const phaseTasks = flatNodes.filter(n => n.parent_id === targetPhaseId && n.node_type === 'task');
        
        // Create the task
        const taskData = {
          parent_id: targetPhaseId,
          node_type: 'task',
          title,
          status: 'not_started',
          order_index: phaseTasks.length
        };
        if (description) taskData.description = description;
        if (agent_instructions) taskData.agent_instructions = agent_instructions;
        
        const task = await apiClient.nodes.createNode(plan_id, taskData);
        
        return formatResponse({
          success: true,
          message: `Task "${title}" added to plan`,
          task_id: task.id,
          plan_id: plan_id,
          phase_id: targetPhaseId,
          task_url: `https://www.agentplanner.io/app/plans/${plan_id}?node=${task.id}`,
          next_steps: [
            "Use quick_status to mark as in_progress when you start",
            "Use quick_log to document progress"
          ]
        });
      }
      
      if (name === "quick_status") {
        const { task_id, plan_id, status, note } = args;
        
        // Update the task status
        const updateData = { status };
        const updated = await apiClient.nodes.updateNode(plan_id, task_id, updateData);
        
        // Add a log entry if note provided or if blocking
        if (note || status === 'blocked') {
          const logMessage = note || (status === 'blocked' ? 'Task blocked - needs attention' : `Status changed to ${status}`);
          try {
            await apiClient.logs.addLogEntry(plan_id, task_id, {
              type: status === 'blocked' ? 'blocker' : 'progress',
              content: logMessage
            });
          } catch (e) {
            // Log failed, continue
          }
        }
        
        // Get next tasks for suggestion
        let nextTasks = [];
        try {
          const nodes = await apiClient.nodes.getNodes(plan_id);
          const flatNodes = flattenNodes(nodes);
          nextTasks = flatNodes
            .filter(n => n.node_type === 'task' && n.status === 'not_started')
            .slice(0, 3)
            .map(n => ({ id: n.id, title: n.title }));
        } catch (e) {
          // Failed to get next tasks, continue
        }
        
        const response = {
          success: true,
          message: `Task status updated to "${status}"`,
          task_id,
          plan_id,
          new_status: status
        };
        
        if (status === 'completed' && nextTasks.length > 0) {
          response.next_tasks = nextTasks;
          response.suggestion = "Here are the next tasks to work on";
        } else if (status === 'blocked') {
          response.suggestion = "Task marked as blocked. A human will be notified to help unblock.";
        }
        
        return formatResponse(response);
      }
      
      if (name === "quick_log") {
        const { task_id, plan_id, message, log_type = 'progress' } = args;
        
        const logEntry = await apiClient.logs.addLogEntry(plan_id, task_id, {
          type: log_type,
          content: message
        });
        
        return formatResponse({
          success: true,
          message: "Progress logged",
          log_id: logEntry.id,
          task_id,
          plan_id,
          logged: message,
          tip: "Good practice! Logging helps humans follow your work."
        });
      }
      
      // ========================================
      // CONTEXT LOADING IMPLEMENTATIONS
      // ========================================
      
      if (name === "get_context") {
        // Redirect to understand_context implementation (same functionality)
        const { plan_id, goal_id, include_knowledge = true } = args;
        
        if (!plan_id && !goal_id) {
          return formatResponse({
            error: "Provide either plan_id or goal_id to get context",
            suggestion: "Use list_plans or list_goals to find IDs"
          });
        }
        
        const context = {
          retrieved_at: new Date().toISOString()
        };
        
        // Get goal context
        if (goal_id) {
          try {
            context.goal = await apiClient.goals.getGoal(goal_id);
            if (include_knowledge) {
              try {
                const knowledge = await apiClient.knowledge.getEntries({ 
                  scope: 'goal',
                  scope_id: goal_id,
                  limit: 10 
                });
                context.goal_knowledge = knowledge.entries || [];
              } catch (e) {}
            }
          } catch (e) {
            context.goal_error = e.message;
          }
        }
        
        // Get plan context
        if (plan_id) {
          try {
            context.plan = await apiClient.plans.getPlan(plan_id);
            context.plan_url = `https://www.agentplanner.io/app/plans/${plan_id}`;
            
            const nodes = await apiClient.nodes.getNodes(plan_id);
            context.statistics = calculatePlanStatistics(nodes);
            context.progress_percentage = context.statistics.total > 0 
              ? ((context.statistics.status_counts.completed / context.statistics.total) * 100).toFixed(1) + '%'
              : '0%';
            
            const flatNodes = flattenNodes(nodes);
            context.needs_attention = {
              blocked: flatNodes.filter(n => n.status === 'blocked').map(n => ({ 
                id: n.id, title: n.title, type: n.node_type
              })),
              in_progress: flatNodes.filter(n => n.status === 'in_progress').map(n => ({ 
                id: n.id, title: n.title, type: n.node_type
              })),
              ready_to_start: flatNodes
                .filter(n => n.node_type === 'task' && n.status === 'not_started')
                .slice(0, 5)
                .map(n => ({ id: n.id, title: n.title }))
            };
            
            try {
              const activity = await apiClient.activity.getPlanActivity(plan_id);
              context.recent_activity = (activity || []).slice(0, 5);
            } catch (e) {}
            
            if (include_knowledge) {
              try {
                const knowledge = await apiClient.knowledge.getEntries({ 
                  scope: 'plan',
                  scope_id: plan_id,
                  limit: 10 
                });
                context.plan_knowledge = knowledge.entries || [];
              } catch (e) {}
            }
          } catch (e) {
            context.plan_error = e.message;
          }
        }
        
        context.recommendation = context.needs_attention?.blocked?.length > 0 
          ? "⚠️ There are blocked tasks that need attention first"
          : context.needs_attention?.in_progress?.length > 0
            ? "Continue working on the in-progress tasks"
            : "Pick a task from ready_to_start to begin";
            
        return formatResponse(context);
      }
      
      if (name === "get_my_tasks") {
        const { plan_id, status = ["blocked", "in_progress"] } = args;
        
        const tasks = {
          retrieved_at: new Date().toISOString(),
          needs_attention: [],
          ready_to_start: []
        };
        
        // Get plans to check
        let plansToCheck = [];
        if (plan_id) {
          plansToCheck = [{ id: plan_id }];
        } else {
          plansToCheck = await apiClient.plans.getPlans();
        }
        
        for (const plan of plansToCheck.slice(0, 10)) { // Limit to 10 plans
          try {
            const nodes = await apiClient.nodes.getNodes(plan.id);
            const flatNodes = flattenNodes(nodes);
            
            const matchingTasks = flatNodes
              .filter(n => n.node_type === 'task' && status.includes(n.status))
              .map(n => ({
                id: n.id,
                title: n.title,
                status: n.status,
                plan_id: plan.id,
                plan_title: plan.title
              }));
            
            tasks.needs_attention.push(...matchingTasks);
            
            // Also get a few ready-to-start tasks
            const readyTasks = flatNodes
              .filter(n => n.node_type === 'task' && n.status === 'not_started')
              .slice(0, 3)
              .map(n => ({
                id: n.id,
                title: n.title,
                plan_id: plan.id,
                plan_title: plan.title
              }));
            
            tasks.ready_to_start.push(...readyTasks);
          } catch (e) {
            // Skip this plan
          }
        }
        
        tasks.summary = {
          blocked: tasks.needs_attention.filter(t => t.status === 'blocked').length,
          in_progress: tasks.needs_attention.filter(t => t.status === 'in_progress').length,
          ready: tasks.ready_to_start.length
        };
        
        return formatResponse(tasks);
      }
      
      // ========================================
      // KNOWLEDGE SHORTCUTS
      // ========================================
      
      if (name === "add_learning") {
        const { title, content, scope = 'organization', scope_id, tags, entry_type = 'learning' } = args;
        
        const entryData = {
          entry_type,
          title,
          content
        };
        if (scope) entryData.scope = scope;
        if (scope_id) entryData.scope_id = scope_id;
        if (tags) entryData.tags = tags;
        
        const entry = await apiClient.knowledge.createEntry(entryData);
        
        return formatResponse({
          success: true,
          message: "Knowledge captured for future reference",
          entry_id: entry.id,
          entry_type,
          title,
          tip: "This will be searchable via search_knowledge. Good practice!"
        });
      }
      
      // ========================================
      // MARKDOWN EXPORT
      // ========================================
      
      if (name === "export_plan_markdown") {
        const { plan_id, include_descriptions = true, include_status = true } = args;
        
        const plan = await apiClient.plans.getPlan(plan_id);
        const nodes = await apiClient.nodes.getNodes(plan_id);
        
        let markdown = `# ${plan.title}\n\n`;
        if (plan.description) {
          markdown += `${plan.description}\n\n`;
        }
        
        const statusEmoji = {
          not_started: '⬜',
          in_progress: '🔄',
          completed: '✅',
          blocked: '🚫',
          cancelled: '❌'
        };
        
        // Process nodes recursively
        const processNode = (node, depth = 0) => {
          const indent = '  '.repeat(depth);
          const status = include_status ? (statusEmoji[node.status] || '⬜') + ' ' : '';
          
          if (node.node_type === 'phase') {
            markdown += `\n${indent}## ${node.title}\n`;
            if (include_descriptions && node.description) {
              markdown += `${indent}${node.description}\n`;
            }
          } else if (node.node_type === 'task') {
            markdown += `${indent}- ${status}${node.title}\n`;
            if (include_descriptions && node.description) {
              markdown += `${indent}  _${node.description}_\n`;
            }
          } else if (node.node_type === 'milestone') {
            markdown += `${indent}- 🎯 ${status}**${node.title}**\n`;
          }
          
          if (node.children) {
            node.children.forEach(child => processNode(child, depth + 1));
          }
        };
        
        // Start from root's children
        if (nodes.length > 0 && nodes[0].children) {
          nodes[0].children.forEach(child => processNode(child, 0));
        }
        
        return formatResponse({
          plan_id,
          title: plan.title,
          markdown,
          tip: "You can save this to a file or share it as text"
        });
      }
      
      if (name === "import_plan_markdown") {
        const { markdown, title: providedTitle, goal_id } = args;
        
        // Parse markdown
        const lines = markdown.split('\n').map(l => l.trim()).filter(l => l);
        
        let planTitle = providedTitle;
        let planDescription = '';
        const phases = [];
        let currentPhase = null;
        
        for (const line of lines) {
          // H1 = Plan title
          if (line.startsWith('# ')) {
            if (!planTitle) {
              planTitle = line.slice(2).trim();
            }
          }
          // H2 = Phase
          else if (line.startsWith('## ')) {
            const phaseTitle = line.slice(3).trim();
            currentPhase = { title: phaseTitle, tasks: [] };
            phases.push(currentPhase);
          }
          // List item = Task (with optional status emoji)
          else if (line.startsWith('- ') || line.startsWith('* ')) {
            let taskTitle = line.slice(2).trim();
            let taskStatus = 'not_started';
            
            // Parse status from emoji
            if (taskTitle.startsWith('✅')) {
              taskStatus = 'completed';
              taskTitle = taskTitle.slice(1).trim();
            } else if (taskTitle.startsWith('🔄')) {
              taskStatus = 'in_progress';
              taskTitle = taskTitle.slice(1).trim();
            } else if (taskTitle.startsWith('🚫')) {
              taskStatus = 'blocked';
              taskTitle = taskTitle.slice(1).trim();
            } else if (taskTitle.startsWith('⬜')) {
              taskTitle = taskTitle.slice(1).trim();
            }
            
            // Skip milestone markers for now
            if (taskTitle.startsWith('🎯')) {
              taskTitle = taskTitle.slice(1).trim().replace(/\*\*/g, '');
            }
            
            if (currentPhase) {
              currentPhase.tasks.push({ title: taskTitle, status: taskStatus });
            } else {
              // No phase yet, create a default one
              currentPhase = { title: 'Tasks', tasks: [{ title: taskTitle, status: taskStatus }] };
              phases.push(currentPhase);
            }
          }
          // Regular text after title = description
          else if (planTitle && !currentPhase && !line.startsWith('#')) {
            planDescription += (planDescription ? ' ' : '') + line;
          }
        }
        
        if (!planTitle) {
          return formatResponse({
            error: "Could not extract plan title",
            suggestion: "Add a '# Title' heading at the start, or provide the 'title' parameter"
          });
        }
        
        if (phases.length === 0) {
          return formatResponse({
            error: "No phases or tasks found",
            suggestion: "Use '## Phase Name' for phases and '- Task name' for tasks"
          });
        }
        
        // Create the plan
        const planData = { title: planTitle };
        if (planDescription) planData.description = planDescription;
        
        const plan = await apiClient.plans.createPlan(planData);
        
        // Get root node
        const nodes = await apiClient.nodes.getNodes(plan.id);
        const rootNode = nodes.find(n => n.node_type === 'root') || nodes[0];
        
        // Create phases and tasks
        const createdPhases = [];
        const createdTasks = [];
        
        for (let i = 0; i < phases.length; i++) {
          const phaseData = phases[i];
          
          const phase = await apiClient.nodes.createNode(plan.id, {
            parent_id: rootNode.id,
            node_type: 'phase',
            title: phaseData.title,
            status: 'not_started',
            order_index: i
          });
          createdPhases.push({ id: phase.id, title: phase.title });
          
          for (let j = 0; j < phaseData.tasks.length; j++) {
            const taskData = phaseData.tasks[j];
            
            const task = await apiClient.nodes.createNode(plan.id, {
              parent_id: phase.id,
              node_type: 'task',
              title: taskData.title,
              status: taskData.status,
              order_index: j
            });
            createdTasks.push({ id: task.id, title: task.title, status: task.status });
          }
        }
        
        // Link to goal if provided
        if (goal_id) {
          try {
            await apiClient.goals.linkPlan(goal_id, plan.id);
          } catch (e) {}
        }
        
        return formatResponse({
          success: true,
          message: `Plan "${planTitle}" created from markdown with ${phases.length} phases and ${createdTasks.length} tasks`,
          plan_id: plan.id,
          plan_url: `https://www.agentplanner.io/app/plans/${plan.id}`,
          phases: createdPhases,
          tasks: createdTasks,
          next_steps: [
            "Use get_context to review the imported plan",
            "Use quick_status to update task progress"
          ]
        });
      }

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
      
      if (name === "share_plan") {
        const { plan_id, visibility = "public", github_repo_owner, github_repo_name } = args;
        
        const visibilityData = { visibility };
        if (github_repo_owner) visibilityData.github_repo_owner = github_repo_owner;
        if (github_repo_name) visibilityData.github_repo_name = github_repo_name;
        
        const result = await apiClient.plans.updateVisibility(plan_id, visibilityData);
        
        const shareUrl = visibility === "public" 
          ? `https://www.agentplanner.io/app/plans/${plan_id}`
          : null;
        
        return formatResponse({
          success: true,
          plan_id: plan_id,
          visibility: result.visibility,
          is_public: result.is_public,
          share_url: shareUrl,
          github_repo_owner: result.github_repo_owner,
          github_repo_name: result.github_repo_name,
          message: visibility === "public" 
            ? `Plan is now public. Share URL: ${shareUrl}`
            : `Plan is now private.`
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
      
      // ===== PLAN STRUCTURE & SUMMARY =====
      if (name === "get_plan_structure") {
        const { plan_id, include_details = false } = args;

        const plan = await apiClient.plans.getPlan(plan_id);
        // Pass include_details to the API - defaults to minimal fields
        const nodes = await apiClient.nodes.getNodes(plan_id, {
          include_details: include_details
        });

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
      
      // ===== AGENT CONTEXT TOOLS =====
      if (name === "get_agent_context") {
        const { node_id, include_knowledge = true, include_siblings = false } = args;
        
        const result = await apiClient.context.getNodeContext(node_id, {
          include_knowledge,
          include_siblings
        });
        
        return formatResponse(result);
      }
      
      if (name === "get_plan_context") {
        const { plan_id, include_knowledge = true } = args;
        
        const result = await apiClient.context.getPlanContext(plan_id, {
          include_knowledge
        });
        
        return formatResponse(result);
      }
      
      // ===== ORGANIZATION TOOLS =====
      if (name === "list_organizations") {
        const result = await apiClient.organizations.list();
        return formatResponse(result);
      }
      
      if (name === "get_organization") {
        const { organization_id } = args;
        const result = await apiClient.organizations.get(organization_id);
        return formatResponse(result);
      }
      
      if (name === "create_organization") {
        const { name, description, slug } = args;
        const result = await apiClient.organizations.create({ name, description, slug });
        return formatResponse(result);
      }
      
      if (name === "update_organization") {
        const { organization_id, ...updateData } = args;
        const result = await apiClient.organizations.update(organization_id, updateData);
        return formatResponse(result);
      }
      
      // ===== GOAL TOOLS =====
      if (name === "list_goals") {
        const { organization_id, status } = args;
        const result = await apiClient.goals.list({ organization_id, status });
        return formatResponse(result);
      }
      
      if (name === "get_goal") {
        const { goal_id } = args;
        const result = await apiClient.goals.get(goal_id);
        return formatResponse(result);
      }
      
      if (name === "create_goal") {
        const { organization_id, title, description, success_metrics, time_horizon, github_repo_url } = args;
        const result = await apiClient.goals.create({
          organization_id,
          title,
          description,
          success_metrics,
          time_horizon,
          github_repo_url
        });
        return formatResponse(result);
      }
      
      if (name === "update_goal") {
        const { goal_id, ...updateData } = args;
        const result = await apiClient.goals.update(goal_id, updateData);
        return formatResponse(result);
      }
      
      if (name === "link_plan_to_goal") {
        const { goal_id, plan_id } = args;
        const result = await apiClient.goals.linkPlan(goal_id, plan_id);
        return formatResponse({
          success: true,
          message: `Plan ${plan_id} linked to goal ${goal_id}`,
          ...result
        });
      }
      
      if (name === "unlink_plan_from_goal") {
        const { goal_id, plan_id } = args;
        const result = await apiClient.goals.unlinkPlan(goal_id, plan_id);
        return formatResponse({
          success: true,
          message: `Plan ${plan_id} unlinked from goal ${goal_id}`,
          ...result
        });
      }
      
      // ===== KNOWLEDGE TOOLS =====
      if (name === "add_knowledge_entry") {
        const { scope, scope_id, entry_type, title, content, source_url, tags } = args;
        const result = await apiClient.knowledge.createEntry({
          scope,
          scope_id,
          entry_type,
          title,
          content,
          source_url,
          tags
        });
        return formatResponse(result);
      }
      
      if (name === "list_knowledge_entries") {
        const { scope, scope_id, entry_type, tags, limit = 50 } = args;
        
        // First get/create the store for this scope
        const stores = await apiClient.knowledge.listStores({ scope, scope_id });
        if (!stores || stores.length === 0) {
          return formatResponse({ entries: [], message: 'No knowledge store exists for this scope yet' });
        }
        
        const store = stores[0];
        const result = await apiClient.knowledge.listEntries(store.id, { entry_type, tags, limit });
        return formatResponse(result);
      }
      
      if (name === "search_knowledge") {
        const { query, scope, scope_id, entry_types, limit = 10 } = args;
        
        // Build search request
        const searchData = { query, limit };
        if (scope && scope_id) {
          searchData.scope = scope;
          searchData.scope_id = scope_id;
        }
        if (entry_types) {
          searchData.entry_types = entry_types;
        }
        
        const result = await apiClient.knowledge.search(searchData);
        return formatResponse(result);
      }
      
      if (name === "update_knowledge_entry") {
        const { entry_id, ...updateData } = args;
        const result = await apiClient.knowledge.updateEntry(entry_id, updateData);
        return formatResponse(result);
      }
      
      if (name === "delete_knowledge_entry") {
        const { entry_id } = args;
        await apiClient.knowledge.deleteEntry(entry_id);
        return formatResponse({
          success: true,
          message: `Knowledge entry ${entry_id} deleted`
        });
      }

      // ===== HELPER TOOLS =====
      if (name === "get_started") {
        const { topic = "overview" } = args || {};
        
        const guides = {
          overview: {
            title: "AgentPlanner Overview",
            description: "AgentPlanner is a collaborative planning system for AI agents and humans to work together on structured plans.",
            key_concepts: [
              "Organizations - Groups of users, goals, and resources",
              "Goals - High-level objectives with success metrics that plans work toward",
              "Plans - Hierarchical structures with phases, tasks, and milestones",
              "Nodes - Individual items in a plan (phases contain tasks and milestones)",
              "Knowledge - Persistent storage for decisions, context, constraints, and learnings"
            ],
            recommended_workflow: [
              "1. Check list_goals to understand current objectives",
              "2. Use list_plans to see existing plans",
              "3. Before working on a plan, use understand_context to get the full picture",
              "4. Update task statuses as you work (update_node with status)",
              "5. Store important decisions and learnings using add_knowledge_entry",
              "6. Check search_knowledge before making decisions to see past context"
            ],
            quick_tips: [
              "Always capture WHY decisions were made, not just WHAT",
              "Mark tasks 'blocked' with notes when stuck - this helps humans help you",
              "Use logs to document progress so others can follow your work"
            ]
          },
          planning: {
            title: "Planning Best Practices",
            description: "How to create and structure effective plans.",
            structure: [
              "Plans have a hierarchical structure: Plan → Phases → Tasks/Milestones",
              "Phases are major stages or milestones of work",
              "Tasks are actionable work items within phases",
              "Milestones mark significant checkpoints"
            ],
            tips: [
              "Break work into phases (major stages)",
              "Each phase should contain 3-7 tasks (not too granular, not too big)",
              "Add clear acceptance_criteria to tasks so completion is unambiguous",
              "Use agent_instructions to guide how AI agents should approach tasks",
              "Link plans to goals to track how work contributes to objectives"
            ],
            tools_to_use: ["create_plan", "create_node", "get_plan_structure", "link_plan_to_goal"]
          },
          execution: {
            title: "Executing Plans",
            description: "How to work through plans effectively.",
            workflow: [
              "1. Use get_plan_structure to see the full plan",
              "2. Find tasks with status 'not_started' or 'in_progress'",
              "3. Before starting a task, check search_knowledge for relevant context",
              "4. Update task status to 'in_progress' when you begin",
              "5. Add logs to document what you're doing",
              "6. Mark 'completed' when done, or 'blocked' if stuck"
            ],
            status_values: {
              not_started: "Work hasn't begun",
              in_progress: "Currently being worked on",
              completed: "Finished and verified",
              blocked: "Cannot proceed - add notes explaining why",
              cancelled: "No longer needed"
            },
            tips: [
              "Check get_plan_summary for current progress and blockers",
              "When blocked, clearly document what's blocking you",
              "Store learnings as you go - don't wait until the end"
            ],
            tools_to_use: ["get_plan_structure", "update_node", "add_log", "search_knowledge"]
          },
          knowledge: {
            title: "Knowledge Management",
            description: "How to capture and use organizational knowledge effectively.",
            entry_types: {
              decision: "Choices made and their rationale - ALWAYS capture WHY",
              context: "Background information needed to understand something",
              constraint: "Rules, limitations, or requirements that must be respected",
              learning: "Insights gained from experience - what worked, what didn't",
              reference: "Links to external resources or documentation",
              note: "General notes that don't fit other categories"
            },
            best_practices: [
              "ALWAYS capture significant decisions with reasoning",
              "Search knowledge BEFORE making decisions (check for constraints)",
              "Add learnings when you discover something useful",
              "Tag entries well for easier retrieval later",
              "Include enough context that future-you can understand"
            ],
            when_to_create_entries: [
              "When a decision is made (especially if non-obvious)",
              "When you learn something that might be useful later",
              "When you discover a constraint or rule",
              "When you find a useful resource or reference"
            ],
            tools_to_use: ["add_knowledge_entry", "search_knowledge", "list_knowledge_entries"]
          },
          collaboration: {
            title: "Collaboration",
            description: "Working with humans and other agents.",
            tips: [
              "Plans can be shared with collaborators (viewer, editor, admin roles)",
              "Use logs to document progress so others can follow your work",
              "Knowledge stores are shared within their scope (org/goal/plan)",
              "When stuck, mark tasks as 'blocked' with clear notes - humans will see this"
            ],
            communication: [
              "Logs are visible to all plan collaborators",
              "Knowledge entries persist and are searchable by others",
              "Clear status updates help humans understand where things stand"
            ],
            tools_to_use: ["list_organizations", "list_goals", "add_log"]
          }
        };
        
        return formatResponse(guides[topic] || guides.overview);
      }

      if (name === "understand_context") {
        const { plan_id, goal_id, include_knowledge = true } = args;
        
        if (!plan_id && !goal_id) {
          return formatResponse({
            error: "Provide either plan_id or goal_id to get context"
          });
        }
        
        const context = {
          retrieved_at: new Date().toISOString()
        };
        
        // Get goal context
        if (goal_id) {
          try {
            context.goal = await apiClient.goals.getGoal(goal_id);
            
            // Get related knowledge if available
            if (include_knowledge) {
              try {
                const knowledge = await apiClient.knowledge.getEntries({ 
                  scope: 'goal',
                  scope_id: goal_id,
                  limit: 10 
                });
                context.goal_knowledge = knowledge.entries || [];
              } catch (e) {
                // Knowledge fetch failed, continue without it
              }
            }
          } catch (e) {
            context.goal_error = e.message;
          }
        }
        
        // Get plan context
        if (plan_id) {
          try {
            context.plan = await apiClient.plans.getPlan(plan_id);
            
            const nodes = await apiClient.nodes.getNodes(plan_id);
            context.statistics = calculatePlanStatistics(nodes);
            context.progress_percentage = context.statistics.total > 0 
              ? ((context.statistics.status_counts.completed / context.statistics.total) * 100).toFixed(1) + '%'
              : '0%';
            
            // Get blocked and in-progress tasks for attention
            const flatNodes = flattenNodes(nodes);
            context.needs_attention = {
              blocked: flatNodes.filter(n => n.status === 'blocked').map(n => ({ 
                id: n.id, 
                title: n.title,
                type: n.node_type
              })),
              in_progress: flatNodes.filter(n => n.status === 'in_progress').map(n => ({ 
                id: n.id, 
                title: n.title,
                type: n.node_type
              }))
            };
            
            // Get recent activity
            try {
              const activity = await apiClient.activity.getPlanActivity(plan_id);
              context.recent_activity = (activity || []).slice(0, 5);
            } catch (e) {
              // Activity fetch failed, continue without it
            }
            
            // Get related knowledge if available
            if (include_knowledge) {
              try {
                const knowledge = await apiClient.knowledge.getEntries({ 
                  scope: 'plan',
                  scope_id: plan_id,
                  limit: 10 
                });
                context.plan_knowledge = knowledge.entries || [];
              } catch (e) {
                // Knowledge fetch failed, continue without it
              }
            }
          } catch (e) {
            context.plan_error = e.message;
          }
        }
        
        context.recommendation = "Review the statistics, needs_attention, and knowledge entries before starting work.";
        return formatResponse(context);
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
 * Flatten a hierarchical node structure into a flat array
 */
function flattenNodes(nodes) {
  const flat = [];
  
  const processNode = (node) => {
    flat.push(node);
    if (node.children && node.children.length > 0) {
      node.children.forEach(processNode);
    }
  };
  
  if (Array.isArray(nodes)) {
    nodes.forEach(processNode);
  }
  
  return flat;
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
