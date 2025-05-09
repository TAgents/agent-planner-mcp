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
        
        // Artifact tools
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
        {
          name: "get_artifact",
          description: "Get a specific artifact by ID",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              node_id: { type: "string", description: "Node ID" },
              artifact_id: { type: "string", description: "Artifact ID" }
            },
            required: ["plan_id", "node_id", "artifact_id"]
          }
        },
        {
          name: "get_artifact_by_name",
          description: "Get an artifact by name (searches for exact or close matches)",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" },
              node_id: { type: "string", description: "Node ID" },
              name: { type: "string", description: "Artifact name to search for" }
            },
            required: ["plan_id", "node_id", "name"]
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
        },
        // Get plan nodes hierarchy
        {
          name: "get_plan_nodes",
          description: "Get the complete hierarchical structure of all nodes in a plan",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string", description: "Plan ID" }
            },
            required: ["plan_id"]
          }
        },
        // Summarize plan tool
        {
          name: "summarize_plan",
          description: "Generate a comprehensive summary of a plan with visualization",
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
      
      // Artifact tools
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
      
      // Get artifact by ID
      if (name === "get_artifact") {
        const { plan_id, node_id, artifact_id } = args;
        
        try {
          // Get the artifact details
          const artifact = await apiClient.artifacts.getArtifact(plan_id, node_id, artifact_id);
          
          // Get the artifact content
          const content = await apiClient.artifacts.getArtifactContent(plan_id, node_id, artifact_id);
          
          // Format the result based on content type
          let resultText = `# Artifact: ${artifact.name}\n\n`;
          resultText += `**ID:** \`${artifact.id}\`\n\n`;
          resultText += `**Content Type:** ${artifact.content_type}\n\n`;
          resultText += `**Created:** ${new Date(artifact.created_at).toLocaleString()}\n\n`;
          
          if (artifact.metadata && Object.keys(artifact.metadata).length > 0) {
            resultText += `## Metadata\n\n`;
            resultText += `\`\`\`json\n${JSON.stringify(artifact.metadata, null, 2)}\n\`\`\`\n\n`;
          }
          
          resultText += `## Content\n\n`;
          
          // Handle content based on its type
          if (artifact.content_type && artifact.content_type.includes('json')) {
            try {
              // Pretty-print JSON
              const jsonContent = typeof content === 'string' ? JSON.parse(content) : content;
              resultText += `\`\`\`json\n${JSON.stringify(jsonContent, null, 2)}\n\`\`\`\n`;
            } catch (e) {
              resultText += `\`\`\`\n${content}\n\`\`\`\n`;
            }
          } else if (artifact.content_type && (
              artifact.content_type.includes('javascript') || 
              artifact.content_type.includes('typescript') ||
              artifact.content_type.includes('python') ||
              artifact.content_type.includes('java') ||
              artifact.content_type.includes('c++') ||
              artifact.content_type.includes('csharp') ||
              artifact.content_type.includes('go') ||
              artifact.content_type.includes('rust')
          )) {
            // Code content
            resultText += `\`\`\`\n${content}\n\`\`\`\n`;
          } else if (artifact.content_type && artifact.content_type.includes('markdown')) {
            // Markdown content (include directly)
            resultText += `${content}\n`;
          } else {
            // Default handling for other content types
            resultText += `\`\`\`\n${content}\n\`\`\`\n`;
          }
          
          return {
            content: [
              {
                type: "text",
                text: resultText
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error retrieving artifact: ${error.message}`
              }
            ]
          };
        }
      }
      
      // Get artifact by name
      if (name === "get_artifact_by_name") {
        const { plan_id, node_id, name: artifactName } = args;
        
        try {
          // Get all artifacts for the node
          const artifacts = await apiClient.artifacts.getArtifacts(plan_id, node_id);
          
          // First try exact match
          let matchedArtifact = artifacts.find(artifact => 
            artifact.name.toLowerCase() === artifactName.toLowerCase()
          );
          
          // If no exact match, try fuzzy match
          if (!matchedArtifact) {
            const nameLower = artifactName.toLowerCase();
            const possibleMatches = artifacts.filter(artifact => 
              artifact.name.toLowerCase().includes(nameLower) || 
              nameLower.includes(artifact.name.toLowerCase())
            );
            
            // Sort by closest match
            possibleMatches.sort((a, b) => {
              const aName = a.name.toLowerCase();
              const bName = b.name.toLowerCase();
              
              const aContains = aName.includes(nameLower);
              const bContains = bName.includes(nameLower);
              const nameContainsA = nameLower.includes(aName);
              const nameContainsB = nameLower.includes(bName);
              
              // Prioritize artifacts that contain the search term
              if (aContains && !bContains) return -1;
              if (!aContains && bContains) return 1;
              
              // If both contain the search term, prioritize shorter names
              if (aContains && bContains) {
                return a.name.length - b.name.length;
              }
              
              // If search term contains both names, prioritize longer names
              if (nameContainsA && nameContainsB) {
                return b.name.length - a.name.length;
              }
              
              return 0;
            });
            
            matchedArtifact = possibleMatches[0];
          }
          
          if (!matchedArtifact) {
            return {
              content: [
                {
                  type: "text",
                  text: `No artifact found matching "${artifactName}" in node ${node_id}.`
                }
              ]
            };
          }
          
          // Use the get_artifact functionality directly instead of calling the tool
          // Get the artifact details
          const artifact = await apiClient.artifacts.getArtifact(plan_id, node_id, matchedArtifact.id);
          
          // Get the artifact content
          const content = await apiClient.artifacts.getArtifactContent(plan_id, node_id, matchedArtifact.id);
          
          // Format the result based on content type
          let resultText = `# Artifact: ${artifact.name}\n\n`;
          resultText += `**ID:** \`${artifact.id}\`\n\n`;
          resultText += `**Content Type:** ${artifact.content_type}\n\n`;
          resultText += `**Created:** ${new Date(artifact.created_at).toLocaleString()}\n\n`;
          
          if (artifact.metadata && Object.keys(artifact.metadata).length > 0) {
            resultText += `## Metadata\n\n`;
            resultText += `\`\`\`json\n${JSON.stringify(artifact.metadata, null, 2)}\n\`\`\`\n\n`;
          }
          
          resultText += `## Content\n\n`;
          
          // Handle content based on its type
          if (artifact.content_type && artifact.content_type.includes('json')) {
            try {
              // Pretty-print JSON
              const jsonContent = typeof content === 'string' ? JSON.parse(content) : content;
              resultText += `\`\`\`json\n${JSON.stringify(jsonContent, null, 2)}\n\`\`\`\n`;
            } catch (e) {
              resultText += `\`\`\`\n${content}\n\`\`\`\n`;
            }
          } else if (artifact.content_type && (
              artifact.content_type.includes('javascript') || 
              artifact.content_type.includes('typescript') ||
              artifact.content_type.includes('python') ||
              artifact.content_type.includes('java') ||
              artifact.content_type.includes('c++') ||
              artifact.content_type.includes('csharp') ||
              artifact.content_type.includes('go') ||
              artifact.content_type.includes('rust')
          )) {
            // Code content
            resultText += `\`\`\`\n${content}\n\`\`\`\n`;
          } else if (artifact.content_type && artifact.content_type.includes('markdown')) {
            // Markdown content (include directly)
            resultText += `${content}\n`;
          } else {
            // Default handling for other content types
            resultText += `\`\`\`\n${content}\n\`\`\`\n`;
          }
          
          return {
            content: [
              {
                type: "text",
                text: resultText
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error searching for artifact: ${error.message}`
              }
            ]
          };
        }
      }
      
      // Search tool
      if (name === "search_plan") {
        const { plan_id, query } = args;
        
        // Use the search wrapper which properly handles the API response format
        // and returns just the results array
        const searchWrapper = require('./tools/search-wrapper');
        const searchResults = await searchWrapper.searchPlan(plan_id, query);
        
        let resultText = `# Search Results for "${query}"\n\n`;
        if (!searchResults || searchResults.length === 0) {
          resultText += "No results found.\n";
        } else {
          resultText += `Found ${searchResults.length} results:\n\n`;
          
          searchResults.forEach((item, index) => {
            resultText += `## Result ${index + 1}: ${item.title || 'Untitled'} (${item.type || 'Unknown'})\n\n`;
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
      
      // Get plan nodes hierarchy tool
      if (name === "get_plan_nodes") {
        const { plan_id } = args;
        
        // Get plan details first
        const plan = await apiClient.plans.getPlan(plan_id);
        
        // Get the full node hierarchy
        const nodes = await apiClient.nodes.getNodes(plan_id);
        
        // Format the response
        let resultText = `# Plan Structure: ${plan.title}\n\n`;
        resultText += `**Plan ID:** \`${plan.id}\`\n\n`;
        resultText += `**Status:** ${plan.status}\n\n`;
        
        if (plan.description) {
          resultText += `## Description\n\n${plan.description}\n\n`;
        }
        
        // Count nodes by status
        const statusCounts = {
          not_started: 0,
          in_progress: 0,
          completed: 0,
          blocked: 0
        };
        
        // Function to count nodes recursively
        const countNodes = (nodeArray) => {
          nodeArray.forEach(node => {
            if (node.status) {
              statusCounts[node.status]++;
            }
            if (node.children && node.children.length > 0) {
              countNodes(node.children);
            }
          });
        };
        
        countNodes(nodes);
        
        resultText += `## Statistics\n\n`;
        resultText += `- Total nodes: ${nodes.reduce((count, node) => {
          // Recursive function to count all nodes including children
          const countAllNodes = (n) => {
            let c = 1; // Count the node itself
            if (n.children && n.children.length > 0) {
              n.children.forEach(child => {
                c += countAllNodes(child);
              });
            }
            return c;
          };
          return count + countAllNodes(node);
        }, 0)}\n`;
        resultText += `- Not started: ${statusCounts.not_started}\n`;
        resultText += `- In progress: ${statusCounts.in_progress}\n`;
        resultText += `- Completed: ${statusCounts.completed}\n`;
        resultText += `- Blocked: ${statusCounts.blocked}\n\n`;
        
        resultText += `## Node Hierarchy\n\n`;
        
        if (nodes.length === 0) {
          resultText += "No nodes found in this plan.\n\n";
        } else {
          // Generate text representation of the hierarchy
          function renderNode(node, depth = 0) {
            const indent = "  ".repeat(depth);
            const statusEmoji = getStatusEmoji(node.status);
            
            resultText += `${indent}- [${statusEmoji}] **${node.title}** (${node.node_type}) - ID: \`${node.id}\`\n`;
            
            if (node.description) {
              resultText += `${indent}  ${node.description.split('\n')[0]}${node.description.length > 50 ? '...' : ''}\n`;
            }
            
            if (node.children && node.children.length > 0) {
              node.children.forEach(child => {
                renderNode(child, depth + 1);
              });
            }
          }
          
          nodes.forEach(node => {
            renderNode(node);
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
      
      // Summarize plan tool
      if (name === "summarize_plan") {
        const { plan_id } = args;
        
        // Get plan details first
        const plan = await apiClient.plans.getPlan(plan_id);
        
        // Get the full node hierarchy
        const nodes = await apiClient.nodes.getNodes(plan_id);
        
        // Count nodes by type and status
        const nodeTypeCounts = {
          root: 0,
          phase: 0,
          task: 0,
          milestone: 0
        };
        
        const statusCounts = {
          not_started: 0,
          in_progress: 0,
          completed: 0,
          blocked: 0
        };
        
        // Calculate total nodes recursively
        const calculateTotalNodes = (nodeArray) => {
          let total = 0;
          nodeArray.forEach(node => {
            total++;
            if (node.children && node.children.length > 0) {
              total += calculateTotalNodes(node.children);
            }
          });
          return total;
        };
        
        // Function to count nodes recursively by type and status
        const countNodesByTypeAndStatus = (nodeArray) => {
          nodeArray.forEach(node => {
            // Count by node_type
            if (node.node_type) {
              nodeTypeCounts[node.node_type]++;
            }
            
            // Count by status
            if (node.status) {
              statusCounts[node.status]++;
            }
            
            // Process children
            if (node.children && node.children.length > 0) {
              countNodesByTypeAndStatus(node.children);
            }
          });
        };
        
        countNodesByTypeAndStatus(nodes);
        
        // Find in-progress nodes
        const findInProgressNodes = (nodeArray, results = []) => {
          nodeArray.forEach(node => {
            if (node.status === 'in_progress') {
              results.push(node);
            }
            if (node.children && node.children.length > 0) {
              findInProgressNodes(node.children, results);
            }
          });
          return results;
        };
        
        const inProgressNodes = findInProgressNodes(nodes);
        
        // Identify phases with most not-started tasks
        const phaseTaskCounts = new Map();
        const countTasksByPhase = (nodeArray, currentPhase = null) => {
          nodeArray.forEach(node => {
            let phaseForChildren = currentPhase;
            
            // If this is a phase, track it for its children
            if (node.node_type === 'phase') {
              phaseForChildren = node;
              if (!phaseTaskCounts.has(node.id)) {
                phaseTaskCounts.set(node.id, {
                  phase: node,
                  not_started: 0,
                  in_progress: 0,
                  completed: 0,
                  blocked: 0,
                  total: 0
                });
              }
            }
            
            // If this is a task and we have a current phase, count it
            if (node.node_type === 'task' && currentPhase) {
              const phaseCounts = phaseTaskCounts.get(currentPhase.id);
              phaseCounts.total++;
              phaseCounts[node.status]++;
            }
            
            // Process children with the current phase context
            if (node.children && node.children.length > 0) {
              countTasksByPhase(node.children, phaseForChildren);
            }
          });
        };
        
        countTasksByPhase(nodes);
        
        // Convert the phase counts to array and sort by not_started count (descending)
        const phasesWithTasks = Array.from(phaseTaskCounts.values())
          .filter(phase => phase.total > 0)
          .sort((a, b) => b.not_started - a.not_started);
        
        // Calculate progress percentage
        const totalNodes = calculateTotalNodes(nodes);
        const progressPercentage = totalNodes > 0 
          ? ((statusCounts.completed / totalNodes) * 100).toFixed(1)
          : 0;
        
        // Create a tree visualization
        let visualization = '```\n';
        visualization += `${plan.title} (root) ${getStatusEmoji(nodes[0]?.status || 'not_started')}\n`;
        
        // Function to build a tree visualization
        const buildTreeVisualization = (nodeArray, prefix = '│') => {
          // Sort nodes to show phases first, then milestones, then tasks
          const sortedNodes = [...nodeArray].sort((a, b) => {
            const typeOrder = { phase: 0, milestone: 1, task: 2 };
            return (typeOrder[a.node_type] || 3) - (typeOrder[b.node_type] || 3);
          });
          
          for (let i = 0; i < sortedNodes.length; i++) {
            const node = sortedNodes[i];
            const isLast = i === sortedNodes.length - 1;
            
            // Skip the root node as it's already added
            if (node.node_type === 'root') continue;
            
            // Determine the connector based on whether this is the last node
            const connector = isLast ? '└── ' : '├── ';
            
            // Add the node to the visualization
            visualization += `${prefix}${connector}${node.title} ${getStatusEmoji(node.status)}\n`;
            
            // Recursively process children with updated prefix
            if (node.children && node.children.length > 0) {
              const newPrefix = isLast ? `${prefix}    ` : `${prefix}│   `;
              buildTreeVisualization(node.children, newPrefix);
            }
          }
        };
        
        // Implement tree visualization starting with the root's children
        if (nodes[0] && nodes[0].children && nodes[0].children.length > 0) {
          buildTreeVisualization(nodes[0].children);
        }
        
        visualization += '\n';
        visualization += 'Legend:\n';
        visualization += '⚪ Not Started   🔵 In Progress   ✅ Completed   🔴 Blocked\n';
        visualization += '```';
        
        // Format the summary response
        let resultText = `# ${plan.title} - Plan Summary\n\n`;
        
        // Executive Summary
        resultText += `## Executive Summary\n\n`;
        resultText += `${plan.description}\n\n`;
        resultText += `This plan is currently **${plan.status.toUpperCase()}** with **${progressPercentage}%** completion.\n\n`;
        resultText += `### Quick Statistics\n\n`;
        resultText += `- **Total components:** ${totalNodes}\n`;
        resultText += `- **Phases:** ${nodeTypeCounts.phase}\n`;
        resultText += `- **Tasks:** ${nodeTypeCounts.task}\n`;
        resultText += `- **Milestones:** ${nodeTypeCounts.milestone}\n\n`;
        resultText += `### Current Progress\n\n`;
        resultText += `- **Not Started:** ${statusCounts.not_started} (${((statusCounts.not_started / totalNodes) * 100).toFixed(1)}%)\n`;
        resultText += `- **In Progress:** ${statusCounts.in_progress} (${((statusCounts.in_progress / totalNodes) * 100).toFixed(1)}%)\n`;
        resultText += `- **Completed:** ${statusCounts.completed} (${((statusCounts.completed / totalNodes) * 100).toFixed(1)}%)\n`;
        resultText += `- **Blocked:** ${statusCounts.blocked} (${((statusCounts.blocked / totalNodes) * 100).toFixed(1)}%)\n\n`;
        
        // Current Focus
        if (inProgressNodes.length > 0) {
          resultText += `## Current Focus Areas\n\n`;
          inProgressNodes.forEach((node, index) => {
            resultText += `${index + 1}. **${node.title}** (${node.node_type})\n`;
            if (node.description) {
              resultText += `   ${node.description.split('\n')[0]}${node.description.length > 100 ? '...' : ''}\n`;
            }
          });
          resultText += '\n';
        }
        
        // Next Focus Areas
        resultText += `## Upcoming Work\n\n`;
        if (phasesWithTasks.length > 0) {
          resultText += `### Phases With Pending Tasks\n\n`;
          
          // Show top 3 phases with most not-started tasks
          phasesWithTasks.slice(0, 3).forEach((phaseData, index) => {
            resultText += `${index + 1}. **${phaseData.phase.title}**\n`;
            resultText += `   - Not Started: ${phaseData.not_started}\n`;
            resultText += `   - In Progress: ${phaseData.in_progress}\n`;
            resultText += `   - Completed: ${phaseData.completed}\n`;
            resultText += `   - Total Tasks: ${phaseData.total}\n\n`;
          });
        } else {
          resultText += `No phases with pending tasks identified.\n\n`;
        }
        
        // Plan Visualization
        resultText += `## Plan Visualization\n\n`;
        resultText += visualization;
        
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
