/**
 * MCP Prompts Implementation
 */
const { ListPromptsRequestSchema, GetPromptRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const apiClient = require('./api-client');

/**
 * Setup prompts for the MCP server
 * @param {Server} server - MCP server instance
 */
function setupPrompts(server) {
  console.error('Setting up MCP prompts...');
  
  // Handler for listing available prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: "analyze_plan",
          description: "Analyze a plan for completeness and organization",
          arguments: [
            {
              name: "planId",
              description: "ID of the plan to analyze",
              required: true
            }
          ]
        },
        {
          name: "suggest_improvements",
          description: "Suggest improvements for a plan or node",
          arguments: [
            {
              name: "planId",
              description: "ID of the plan",
              required: true
            },
            {
              name: "nodeId",
              description: "ID of the specific node (optional, if not provided will analyze the whole plan)",
              required: false
            }
          ]
        },
        {
          name: "generate_implementation_steps",
          description: "Generate detailed implementation steps for a task",
          arguments: [
            {
              name: "planId",
              description: "ID of the plan",
              required: true
            },
            {
              name: "nodeId",
              description: "ID of the task node",
              required: true
            }
          ]
        },
        {
          name: "summarize_plan",
          description: "Generate a concise summary of a plan",
          arguments: [
            {
              name: "planId",
              description: "ID of the plan to summarize",
              required: true
            }
          ]
        },
        {
          name: "generate_status_report",
          description: "Generate a status report for a plan",
          arguments: [
            {
              name: "planId",
              description: "ID of the plan",
              required: true
            }
          ]
        }
      ]
    };
  });
  
  // Handler for getting a specific prompt
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`Getting prompt: ${name} with arguments:`, args);
    
    try {
      // Analyze plan prompt
      if (name === "analyze_plan") {
        const { planId } = args;
        
        // Get plan details
        const plan = await apiClient.plans.getPlan(planId);
        // Get plan structure
        const nodes = await apiClient.nodes.getNodes(planId);
        
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `I'd like you to analyze this plan for completeness, organization, and potential issues. Look for missing elements, unclear tasks, dependencies, and suggest improvements if needed.

## Plan Details
Title: ${plan.title}
Status: ${plan.status}
Description: ${plan.description || 'No description provided'}

## Plan Structure
${formatPlanStructureForPrompt(nodes)}

Please provide a thorough analysis covering:
1. Overall structure and organization
2. Completeness (are there missing elements or gaps?)
3. Task clarity and specificity
4. Dependencies and relationships
5. Potential blockers or risks
6. Suggestions for improvement`
              }
            }
          ]
        };
      }
      
      // Suggest improvements prompt
      if (name === "suggest_improvements") {
        const { planId, nodeId } = args;
        
        if (nodeId) {
          // Get node details
          const node = await apiClient.nodes.getNode(planId, nodeId);
          
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `I'd like you to suggest improvements for this specific node in my plan. Consider clarity, completeness, and actionability.

## Node Details
Title: ${node.title}
Type: ${node.node_type}
Status: ${node.status}
Description: ${node.description || 'No description provided'}
${node.context ? `Context: ${node.context}` : ''}
${node.agent_instructions ? `Agent Instructions: ${node.agent_instructions}` : ''}
${node.acceptance_criteria ? `Acceptance Criteria: ${node.acceptance_criteria}` : ''}

Please suggest improvements for:
1. Title clarity and specificity
2. Description completeness and detail
3. Context and background information
4. Instructions clarity (for agents or humans)
5. Acceptance criteria clarity and measurability
6. Any other relevant aspects`
                }
              }
            ]
          };
        } else {
          // Get plan details
          const plan = await apiClient.plans.getPlan(planId);
          // Get plan structure
          const nodes = await apiClient.nodes.getNodes(planId);
          
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `I'd like you to suggest improvements for this plan. Consider structure, organization, clarity, and completeness.

## Plan Details
Title: ${plan.title}
Status: ${plan.status}
Description: ${plan.description || 'No description provided'}

## Plan Structure
${formatPlanStructureForPrompt(nodes)}

Please suggest improvements for:
1. Overall plan structure and organization
2. Title and description clarity
3. Node organization and hierarchy
4. Task clarity and specificity
5. Dependencies and relationships
6. Coverage of all necessary aspects
7. Any other relevant improvements`
                }
              }
            ]
          };
        }
      }
      
      // Generate implementation steps prompt
      if (name === "generate_implementation_steps") {
        const { planId, nodeId } = args;
        
        // Get node details
        const node = await apiClient.nodes.getNode(planId, nodeId);
        
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `I need to break down this task into detailed implementation steps. Please help me create a comprehensive list of steps that would be required to complete this task successfully.

## Task Details
Title: ${node.title}
Description: ${node.description || 'No description provided'}
${node.context ? `Context: ${node.context}` : ''}
${node.agent_instructions ? `Instructions: ${node.agent_instructions}` : ''}
${node.acceptance_criteria ? `Acceptance Criteria: ${node.acceptance_criteria}` : ''}

Please create a detailed breakdown with:
1. Numbered implementation steps in sequential order
2. Any prerequisites or dependencies for each step
3. Estimated effort or complexity for each step (if possible)
4. Potential challenges or considerations for each step
5. Success criteria for each step`
              }
            }
          ]
        };
      }
      
      // Summarize plan prompt
      if (name === "summarize_plan") {
        const { planId } = args;
        
        // Get plan details
        const plan = await apiClient.plans.getPlan(planId);
        // Get plan structure
        const nodes = await apiClient.nodes.getNodes(planId);
        
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please generate a concise summary of this plan that captures its key elements, goals, and structure. The summary should be clear and informative.

## Plan Details
Title: ${plan.title}
Status: ${plan.status}
Description: ${plan.description || 'No description provided'}

## Plan Structure
${formatPlanStructureForPrompt(nodes)}

Please create a summary that includes:
1. The plan's main objective or goal
2. Key phases or components
3. Major deliverables or outcomes
4. Timeline or key milestones (if available)
5. Current status and progress`
              }
            }
          ]
        };
      }
      
      // Generate status report prompt
      if (name === "generate_status_report") {
        const { planId } = args;
        
        // Get plan details
        const plan = await apiClient.plans.getPlan(planId);
        // Get plan structure
        const nodes = await apiClient.nodes.getNodes(planId);
        
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please generate a professional status report for this plan based on the current state of its nodes and tasks. The report should provide a clear picture of progress, accomplishments, challenges, and next steps.

## Plan Details
Title: ${plan.title}
Status: ${plan.status}
Description: ${plan.description || 'No description provided'}

## Plan Structure with Status
${formatPlanStructureForPrompt(nodes, true)}

Please generate a comprehensive status report that includes:
1. Executive Summary (brief overview of the plan and its current status)
2. Accomplishments (completed items and milestones achieved)
3. In Progress Items (what's currently being worked on)
4. Blockers and Challenges (any issues impeding progress)
5. Next Steps (upcoming priorities and actions)
6. Overall Assessment (evaluation of whether the plan is on track, ahead, or behind)`
              }
            }
          ]
        };
      }
      
      // Prompt not found
      throw new Error(`Unknown prompt: ${name}`);
    } catch (error) {
      console.error(`Error getting prompt ${name}:`, error);
      throw error;
    }
  });
  
  console.error('Prompts setup complete');
}

/**
 * Format plan structure for prompts
 * @param {Array} nodes - List of nodes
 * @param {boolean} includeStatus - Whether to include status information
 * @returns {string} - Formatted text
 */
function formatPlanStructureForPrompt(nodes, includeStatus = false) {
  if (!nodes || nodes.length === 0) {
    return "No nodes found in this plan.";
  }
  
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
  let result = '';
  
  function renderNode(node, depth = 0) {
    const indent = "  ".repeat(depth);
    const statusInfo = includeStatus ? ` [${node.status}]` : '';
    
    result += `${indent}- ${node.title} (${node.node_type})${statusInfo}\n`;
    
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        renderNode(child, depth + 1);
      });
    }
  }
  
  rootNodes.forEach(root => {
    renderNode(root);
  });
  
  return result;
}

module.exports = { setupPrompts };
