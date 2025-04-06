/**
 * MCP Tools Implementation
 */
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const apiClient = require('./api-client');

/**
 * Setup tools for the MCP server
 * @param {Server} server - MCP server instance
 */
function setupTools(server) {
  console.error('Setting up MCP tools...');
  
  // Handler for listing available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        // Plan listing tool
        {
          name: "list_plans",
          description: "List all plans that the user has access to",
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
        // Find plans tool
        {
          name: "find_plans",
          description: "Find plans by title or description",
          inputSchema: {
            type: "object",
            properties: {
              query: { 
                type: "string", 
                description: "Search query to find in plan title or description"
              },
              status: { 
                type: "string", 
                description: "Optional filter by plan status",
                enum: ["draft", "active", "completed", "archived"]
              }
            },
            required: ["query"]
          }
        },
        // Get plan by name tool
        {
          name: "get_plan_by_name",
          description: "Get a specific plan by its name/title or a close match",
          inputSchema: {
            type: "object",
            properties: {
              name: { 
                type: "string", 
                description: "Plan name/title to search for"
              }
            },
            required: ["name"]
          }
        },
        // Plan management tools
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
        
        // Node management tools
        {
          name: "create_node",
          description: "Create a new node in a plan",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              parent_id: { type: "string", description: "Parent node ID (optional for root nodes)" },
              node_type: { 
                type: "string", 
                description: "Node type",
                enum: ["root", "phase", "task", "milestone"]
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
              acceptance_criteria: { type: "string", description: "Criteria for node completion" }
            },
            required: ["plan_id", "node_type", "title"]
          }
        },
        {
          name: "update_node_status",
          description: "Update the status of a node",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              node_id: { type: "string", description: "Node ID" },
              status: { 
                type: "string", 
                description: "New node status",
                enum: ["not_started", "in_progress", "completed", "blocked"]
              }
            },
            required: ["plan_id", "node_id", "status"]
          }
        },
        
        // Comment and log tools
        {
          name: "add_comment",
          description: "Add a comment to a node",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              node_id: { type: "string", description: "Node ID" },
              content: { type: "string", description: "Comment content" },
              comment_type: { 
                type: "string", 
                description: "Type of comment",
                enum: ["human", "agent", "system"],
                default: "agent"
              }
            },
            required: ["plan_id", "node_id", "content"]
          }
        },
        {
          name: "add_log_entry",
          description: "Add a log entry to a node",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              node_id: { type: "string", description: "Node ID" },
              content: { type: "string", description: "Log content" },
              log_type: { 
                type: "string", 
                description: "Type of log entry",
                enum: ["progress", "reasoning", "challenge", "decision"],
                default: "reasoning"
              },
              tags: { 
                type: "array", 
                description: "Tags for categorizing the log entry",
                items: { type: "string" }
              }
            },
            required: ["plan_id", "node_id", "content", "log_type"]
          }
        },
        
        // Artifact tool
        {
          name: "add_artifact",
          description: "Add an artifact to a node",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              node_id: { type: "string", description: "Node ID" },
              name: { type: "string", description: "Artifact name" },
              content_type: { type: "string", description: "Content MIME type (e.g., text/markdown)" },
              url: { type: "string", description: "URL where the artifact can be accessed" },
              metadata: { 
                type: "object", 
                description: "Additional metadata for the artifact"
              }
            },
            required: ["plan_id", "node_id", "name", "content_type", "url"]
          }
        },
        
        // Search tool
        {
          name: "search_plan",
          description: "Search within a plan",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              query: { type: "string", description: "Search query" }
            },
            required: ["plan_id", "query"]
          }
        }
      ]
    };
  });
  
  // Handler for calling tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`Calling tool: ${name} with arguments:`, args);
    
    try {
      let result;
      
      // Plan management tools
      if (name === "create_plan") {
        result = await apiClient.plans.createPlan(args);
        return {
          content: [
            {
              type: "text",
              text: `Successfully created plan "${result.title}" with ID: ${result.id}`
            }
          ]
        };
      }
      
      if (name === "update_plan") {
        const { plan_id, ...planData } = args;
        result = await apiClient.plans.updatePlan(plan_id, planData);
        return {
          content: [
            {
              type: "text",
              text: `Successfully updated plan "${result.title}" (ID: ${result.id})`
            }
          ]
        };
      }
      
      // Node management tools
      if (name === "create_node") {
        const { plan_id, ...nodeData } = args;
        result = await apiClient.nodes.createNode(plan_id, nodeData);
        return {
          content: [
            {
              type: "text",
              text: `Successfully created ${result.node_type} node "${result.title}" with ID: ${result.id}`
            }
          ]
        };
      }
      
      if (name === "update_node_status") {
        const { plan_id, node_id, status } = args;
        result = await apiClient.nodes.updateNodeStatus(plan_id, node_id, status);
        return {
          content: [
            {
              type: "text",
              text: `Successfully updated status of node "${result.title}" to "${status}"`
            }
          ]
        };
      }
      
      // Comment and log tools
      if (name === "add_comment") {
        const { plan_id, node_id, ...commentData } = args;
        result = await apiClient.comments.addComment(plan_id, node_id, commentData);
        return {
          content: [
            {
              type: "text",
              text: `Successfully added comment to node`
            }
          ]
        };
      }
      
      if (name === "add_log_entry") {
        const { plan_id, node_id, ...logData } = args;
        result = await apiClient.logs.addLogEntry(plan_id, node_id, logData);
        return {
          content: [
            {
              type: "text",
              text: `Successfully added ${logData.log_type} log entry to node`
            }
          ]
        };
      }
      
      // Artifact tool
      if (name === "add_artifact") {
        const { plan_id, node_id, ...artifactData } = args;
        result = await apiClient.artifacts.addArtifact(plan_id, node_id, artifactData);
        return {
          content: [
            {
              type: "text",
              text: `Successfully added artifact "${artifactData.name}" to node`
            }
          ]
        };
      }
      
      // Search tool
      if (name === "search_plan") {
        const { plan_id, query } = args;
        result = await apiClient.search.searchPlan(plan_id, query);
        
        let resultText = `# Search Results for "${query}"\n\n`;
        if (result.length === 0) {
          resultText += "No results found.\n";
        } else {
          resultText += `Found ${result.length} results:\n\n`;
          
          result.forEach((item, index) => {
            resultText += `## Result ${index + 1}: ${item.title} (${item.type})\n\n`;
            if (item.content) {
              resultText += `${item.content.substring(0, 200)}${item.content.length > 200 ? '...' : ''}\n\n`;
            }
            resultText += `**ID:** \`${item.id}\`\n\n`;
            resultText += `---\n\n`;
          });
        }
        
        return {
          content: [
            {
              type: "text",
              text: resultText
            }
          ]
        };
      }
      
      // Get plan by name tool
      if (name === "get_plan_by_name") {
        const { name: planName } = args;
        const plans = await apiClient.plans.getPlans();
        
        // First try to find an exact match
        let matchedPlan = plans.find(plan => 
          plan.title.toLowerCase() === planName.toLowerCase()
        );
        
        // If no exact match, try a fuzzy match
        if (!matchedPlan) {
          const nameLower = planName.toLowerCase();
          const possibleMatches = plans.filter(plan => 
            plan.title.toLowerCase().includes(nameLower) || 
            nameLower.includes(plan.title.toLowerCase())
          );
          
          // Sort by closest match (shortest title that contains search term or vice versa)
          possibleMatches.sort((a, b) => {
            const aTitle = a.title.toLowerCase();
            const bTitle = b.title.toLowerCase();
            
            const aContains = aTitle.includes(nameLower);
            const bContains = bTitle.includes(nameLower);
            const nameContainsA = nameLower.includes(aTitle);
            const nameContainsB = nameLower.includes(bTitle);
            
            // Prioritize titles that contain the search term
            if (aContains && !bContains) return -1;
            if (!aContains && bContains) return 1;
            
            // If both contain the search term, prioritize shorter titles
            if (aContains && bContains) {
              return a.title.length - b.title.length;
            }
            
            // If search term contains both titles, prioritize longer titles
            if (nameContainsA && nameContainsB) {
              return b.title.length - a.title.length;
            }
            
            return 0;
          });
          
          matchedPlan = possibleMatches[0];
        }
        
        if (!matchedPlan) {
          return {
            content: [
              {
                type: "text",
                text: `No plan found matching "${planName}". Try using the find_plans tool with a different search term.`
              }
            ]
          };
        }
        
        // Get all data for this plan
        const plan = await apiClient.plans.getPlan(matchedPlan.id);
        const nodes = await apiClient.nodes.getNodes(plan.id);
        
        // Format the plan data
        let resultText = `# Plan: ${plan.title}\n\n`;
        resultText += `**ID:** \`${plan.id}\`\n\n`;
        resultText += `**Status:** ${plan.status}\n\n`;
        
        if (plan.description) {
          resultText += `## Description\n\n${plan.description}\n\n`;
        }
        
        resultText += `**Created:** ${new Date(plan.created_at).toLocaleString()}\n\n`;
        resultText += `**Updated:** ${new Date(plan.updated_at).toLocaleString()}\n\n`;
        
        // Add plan structure
        resultText += `## Plan Structure\n\n`;
        
        if (nodes.length === 0) {
          resultText += "No nodes found in this plan.\n\n";
        } else {
          // Create a map of nodes by ID
          const nodeMap = new Map();
          nodes.forEach(node => {
            nodeMap.set(node.id, {
              ...node,
              children: []
            });
          });
          
          // Build the tree structure
          const rootNodes = [];
          nodeMap.forEach(node => {
            if (node.parent_id) {
              const parent = nodeMap.get(node.parent_id);
              if (parent) {
                parent.children.push(node);
              } else {
                rootNodes.push(node);
              }
            } else {
              rootNodes.push(node);
            }
          });
          
          // Sort nodes
          rootNodes.sort((a, b) => a.order_index - b.order_index);
          nodeMap.forEach(node => {
            node.children.sort((a, b) => a.order_index - b.order_index);
          });
          
          // Generate text
          function renderNode(node, depth = 0) {
            const indent = "  ".repeat(depth);
            const statusEmoji = getStatusEmoji(node.status);
            
            resultText += `${indent}- [${statusEmoji}] **${node.title}** (${node.node_type}) - ID: \`${node.id}\`\n`;
            
            if (node.children && node.children.length > 0) {
              node.children.forEach(child => {
                renderNode(child, depth + 1);
              });
            }
          }
          
          rootNodes.forEach(root => {
            renderNode(root);
          });
        }
        
        return {
          content: [
            {
              type: "text",
              text: resultText
            }
          ]
        };
      }
      
      // Find plans tool
      if (name === "find_plans") {
        const { query, status } = args;
        const plans = await apiClient.plans.getPlans();
        
        // Filter by query and status if provided
        const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
        
        // First, try exact matching
        let filteredPlans = plans.filter(plan => {
          const titleLower = plan.title.toLowerCase();
          const descLower = plan.description ? plan.description.toLowerCase() : '';
          
          // Check if the whole query is contained in title or description
          const exactMatch = titleLower.includes(query.toLowerCase()) || 
                            descLower.includes(query.toLowerCase());
          
          const matchesStatus = status ? plan.status === status : true;
          
          return exactMatch && matchesStatus;
        });
        
        // If no exact matches, try matching individual terms
        if (filteredPlans.length === 0) {
          filteredPlans = plans.filter(plan => {
            const titleLower = plan.title.toLowerCase();
            const descLower = plan.description ? plan.description.toLowerCase() : '';
            
            // Check if all terms are found in title or description
            const allTermsMatch = queryTerms.every(term => 
              titleLower.includes(term) || descLower.includes(term)
            );
            
            // Check if the majority of terms are found
            const someTermsMatch = queryTerms.filter(term => 
              titleLower.includes(term) || descLower.includes(term)
            ).length > queryTerms.length / 2;
            
            const matchesStatus = status ? plan.status === status : true;
            
            return (allTermsMatch || someTermsMatch) && matchesStatus;
          });
        }
        
        if (filteredPlans.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No plans found matching "${query}"${status ? ` with status "${status}"` : ''}`
              }
            ]
          };
        }
        
        let resultText = `# Plans Matching "${query}"${status ? ` (Status: ${status})` : ''}\n\n`;
        
        filteredPlans.forEach((plan, index) => {
          resultText += `## ${index + 1}. ${plan.title}\n\n`;
          resultText += `**ID:** \`${plan.id}\`\n\n`;
          resultText += `**Status:** ${plan.status}\n\n`;
          if (plan.description) {
            resultText += `**Description:** ${plan.description}\n\n`;
          }
          resultText += `**Created:** ${new Date(plan.created_at).toLocaleString()}\n\n`;
          resultText += `---\n\n`;
        });
        
        return {
          content: [
            {
              type: "text",
              text: resultText
            }
          ]
        };
      }
      
      // List plans tool
      if (name === "list_plans") {
        const { status } = args;
        const plans = await apiClient.plans.getPlans();
        
        // Filter by status if provided
        const filteredPlans = status ? plans.filter(plan => plan.status === status) : plans;
        
        if (filteredPlans.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: status ? `No plans found with status "${status}"` : "No plans found"
              }
            ]
          };
        }
        
        let resultText = `# Available Plans${status ? ` (Status: ${status})` : ''}\n\n`;
        
        filteredPlans.forEach((plan, index) => {
          resultText += `## ${index + 1}. ${plan.title}\n\n`;
          resultText += `**ID:** \`${plan.id}\`\n\n`;
          resultText += `**Status:** ${plan.status}\n\n`;
          if (plan.description) {
            resultText += `**Description:** ${plan.description}\n\n`;
          }
          resultText += `**Created:** ${new Date(plan.created_at).toLocaleString()}\n\n`;
          resultText += `---\n\n`;
        });
        
        return {
          content: [
            {
              type: "text",
              text: resultText
            }
          ]
        };
      }
      
      // Tool not found
      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      console.error(`Error calling tool ${name}:`, error);
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
  
  console.error('Tools setup complete');
}

/**
 * Get emoji for node status
 * @param {string} status - Node status
 * @returns {string} - Emoji
 */
function getStatusEmoji(status) {
  switch (status) {
    case 'not_started':
      return '⚪';
    case 'in_progress':
      return '🔵';
    case 'completed':
      return '✅';
    case 'blocked':
      return '🔴';
    default:
      return '⚪';
  }
}

module.exports = { setupTools };
