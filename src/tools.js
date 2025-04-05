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

module.exports = { setupTools };
