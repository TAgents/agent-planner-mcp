/**
 * MCP Resources Implementation
 */
const { ListResourcesRequestSchema, ReadResourceRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const apiClient = require('./api-client');

/**
 * Setup resources for the MCP server
 * @param {Server} server - MCP server instance
 */
function setupResources(server) {
  console.error('Setting up MCP resources...');
  
  // Handler for listing available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "plans://list",
          name: "Plans List",
          description: "List of all plans accessible to the current user"
        },
        {
          uriTemplate: "plan://{planId}",
          name: "Plan Details",
          description: "Details for a specific plan"
        },
        {
          uriTemplate: "plan://{planId}/structure",
          name: "Plan Structure",
          description: "Hierarchical structure of a plan"
        },
        {
          uriTemplate: "plan://{planId}/node/{nodeId}",
          name: "Node Details",
          description: "Details for a specific node in a plan"
        },
        {
          uriTemplate: "plan://{planId}/activity",
          name: "Plan Activity",
          description: "Recent activity on a plan"
        },
        {
          uriTemplate: "plan://{planId}/node/{nodeId}/comments",
          name: "Node Comments",
          description: "Comments on a specific node"
        },
        {
          uriTemplate: "plan://{planId}/node/{nodeId}/logs",
          name: "Node Logs",
          description: "Log entries for a specific node"
        },
        {
          uriTemplate: "plan://{planId}/node/{nodeId}/artifacts",
          name: "Node Artifacts",
          description: "Artifacts attached to a specific node"
        },
        {
          uri: "activity://global",
          name: "Global Activity",
          description: "Recent activity across all plans"
        }
      ]
    };
  });
  
  // Handler for reading resources
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    console.error(`Reading resource: ${uri}`);
    
    try {
      // Plans list
      if (uri === "plans://list") {
        const plans = await apiClient.plans.getPlans();
        return {
          contents: [
            {
              uri,
              text: formatPlansListText(plans),
              mimeType: "text/markdown"
            }
          ]
        };
      }
      
      // Global activity
      if (uri === "activity://global") {
        const activities = await apiClient.activity.getGlobalActivity();
        return {
          contents: [
            {
              uri,
              text: formatActivityText(activities),
              mimeType: "text/markdown"
            }
          ]
        };
      }
      
      // Plan details
      const planMatch = uri.match(/^plan:\/\/([^\/]+)$/);
      if (planMatch) {
        const planId = planMatch[1];
        const plan = await apiClient.plans.getPlan(planId);
        return {
          contents: [
            {
              uri,
              text: formatPlanText(plan),
              mimeType: "text/markdown"
            }
          ]
        };
      }
      
      // Plan structure
      const structureMatch = uri.match(/^plan:\/\/([^\/]+)\/structure$/);
      if (structureMatch) {
        const planId = structureMatch[1];
        const nodes = await apiClient.nodes.getNodes(planId);
        return {
          contents: [
            {
              uri,
              text: formatPlanStructureText(nodes),
              mimeType: "text/markdown"
            }
          ]
        };
      }
      
      // Node details
      const nodeMatch = uri.match(/^plan:\/\/([^\/]+)\/node\/([^\/]+)$/);
      if (nodeMatch) {
        const planId = nodeMatch[1];
        const nodeId = nodeMatch[2];
        const node = await apiClient.nodes.getNode(planId, nodeId);
        return {
          contents: [
            {
              uri,
              text: formatNodeText(node),
              mimeType: "text/markdown"
            }
          ]
        };
      }
      
      // Plan activity
      const activityMatch = uri.match(/^plan:\/\/([^\/]+)\/activity$/);
      if (activityMatch) {
        const planId = activityMatch[1];
        const activities = await apiClient.activity.getPlanActivity(planId);
        return {
          contents: [
            {
              uri,
              text: formatActivityText(activities),
              mimeType: "text/markdown"
            }
          ]
        };
      }
      
      // Node comments
      const commentsMatch = uri.match(/^plan:\/\/([^\/]+)\/node\/([^\/]+)\/comments$/);
      if (commentsMatch) {
        const planId = commentsMatch[1];
        const nodeId = commentsMatch[2];
        const comments = await apiClient.comments.getComments(planId, nodeId);
        return {
          contents: [
            {
              uri,
              text: formatCommentsText(comments),
              mimeType: "text/markdown"
            }
          ]
        };
      }
      
      // Node logs
      const logsMatch = uri.match(/^plan:\/\/([^\/]+)\/node\/([^\/]+)\/logs$/);
      if (logsMatch) {
        const planId = logsMatch[1];
        const nodeId = logsMatch[2];
        const logs = await apiClient.logs.getLogs(planId, nodeId);
        return {
          contents: [
            {
              uri,
              text: formatLogsText(logs),
              mimeType: "text/markdown"
            }
          ]
        };
      }
      
      // Node artifacts
      const artifactsMatch = uri.match(/^plan:\/\/([^\/]+)\/node\/([^\/]+)\/artifacts$/);
      if (artifactsMatch) {
        const planId = artifactsMatch[1];
        const nodeId = artifactsMatch[2];
        const artifacts = await apiClient.artifacts.getArtifacts(planId, nodeId);
        return {
          contents: [
            {
              uri,
              text: formatArtifactsText(artifacts),
              mimeType: "text/markdown"
            }
          ]
        };
      }
      
      throw new Error(`Resource not found: ${uri}`);
    } catch (error) {
      console.error(`Error reading resource ${uri}:`, error);
      throw error;
    }
  });
  
  console.error('Resources setup complete');
}

/**
 * Format plans list as markdown text
 * @param {Array} plans - List of plans
 * @returns {string} - Markdown text
 */
function formatPlansListText(plans) {
  if (!plans || plans.length === 0) {
    return "# Plans\n\nNo plans found.";
  }
  
  let text = "# Plans\n\n";
  
  plans.forEach(plan => {
    text += `## ${plan.title}\n\n`;
    text += `**ID:** \`${plan.id}\`\n\n`;
    text += `**Status:** ${plan.status}\n\n`;
    if (plan.description) {
      text += `${plan.description}\n\n`;
    }
    text += `Created: ${new Date(plan.created_at).toLocaleString()}\n\n`;
    text += `---\n\n`;
  });
  
  return text;
}

/**
 * Format plan details as markdown text
 * @param {Object} plan - Plan object
 * @returns {string} - Markdown text
 */
function formatPlanText(plan) {
  let text = `# ${plan.title}\n\n`;
  
  text += `**ID:** \`${plan.id}\`\n\n`;
  text += `**Status:** ${plan.status}\n\n`;
  
  if (plan.description) {
    text += `## Description\n\n${plan.description}\n\n`;
  }
  
  text += `**Owner:** ${plan.owner_id}\n\n`;
  text += `**Created:** ${new Date(plan.created_at).toLocaleString()}\n\n`;
  text += `**Updated:** ${new Date(plan.updated_at).toLocaleString()}\n\n`;
  
  if (plan.metadata) {
    text += `## Metadata\n\n\`\`\`json\n${JSON.stringify(plan.metadata, null, 2)}\n\`\`\`\n\n`;
  }
  
  return text;
}

/**
 * Format plan structure as markdown text
 * @param {Array} nodes - List of nodes
 * @returns {string} - Markdown text
 */
function formatPlanStructureText(nodes) {
  if (!nodes || nodes.length === 0) {
    return "# Plan Structure\n\nNo nodes found.";
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
  
  // Generate markdown text
  let text = "# Plan Structure\n\n";
  
  function renderNode(node, depth = 0) {
    const indent = "  ".repeat(depth);
    const statusEmoji = getStatusEmoji(node.status);
    
    text += `${indent}- [${statusEmoji}] **${node.title}** (${node.node_type}) - ID: \`${node.id}\`\n`;
    
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        renderNode(child, depth + 1);
      });
    }
  }
  
  rootNodes.forEach(root => {
    renderNode(root);
  });
  
  return text;
}

/**
 * Format node details as markdown text
 * @param {Object} node - Node object
 * @returns {string} - Markdown text
 */
function formatNodeText(node) {
  let text = `# ${node.title}\n\n`;
  
  text += `**ID:** \`${node.id}\`\n\n`;
  text += `**Type:** ${node.node_type}\n\n`;
  text += `**Status:** ${node.status} ${getStatusEmoji(node.status)}\n\n`;
  
  if (node.description) {
    text += `## Description\n\n${node.description}\n\n`;
  }
  
  if (node.parent_id) {
    text += `**Parent Node:** \`${node.parent_id}\`\n\n`;
  }
  
  text += `**Plan:** \`${node.plan_id}\`\n\n`;
  
  if (node.context) {
    text += `## Context\n\n${node.context}\n\n`;
  }
  
  if (node.agent_instructions) {
    text += `## Agent Instructions\n\n${node.agent_instructions}\n\n`;
  }
  
  if (node.acceptance_criteria) {
    text += `## Acceptance Criteria\n\n${node.acceptance_criteria}\n\n`;
  }
  
  text += `**Created:** ${new Date(node.created_at).toLocaleString()}\n\n`;
  text += `**Updated:** ${new Date(node.updated_at).toLocaleString()}\n\n`;
  
  if (node.due_date) {
    text += `**Due Date:** ${new Date(node.due_date).toLocaleString()}\n\n`;
  }
  
  if (node.metadata) {
    text += `## Metadata\n\n\`\`\`json\n${JSON.stringify(node.metadata, null, 2)}\n\`\`\`\n\n`;
  }
  
  return text;
}

/**
 * Format activity as markdown text
 * @param {Array} activities - List of activities
 * @returns {string} - Markdown text
 */
function formatActivityText(activities) {
  if (!activities || activities.length === 0) {
    return "# Activity\n\nNo recent activity.";
  }
  
  let text = "# Activity\n\n";
  
  activities.forEach(activity => {
    const date = new Date(activity.timestamp).toLocaleString();
    text += `## ${activity.type} on ${date}\n\n`;
    
    if (activity.user) {
      text += `**User:** ${activity.user.name || activity.user.email || activity.user_id}\n\n`;
    }
    
    if (activity.plan) {
      text += `**Plan:** ${activity.plan.title} (\`${activity.plan_id}\`)\n\n`;
    }
    
    if (activity.node) {
      text += `**Node:** ${activity.node.title} (\`${activity.node_id}\`)\n\n`;
    }
    
    if (activity.details) {
      text += `${activity.details}\n\n`;
    }
    
    text += `---\n\n`;
  });
  
  return text;
}

/**
 * Format comments as markdown text
 * @param {Array} comments - List of comments
 * @returns {string} - Markdown text
 */
function formatCommentsText(comments) {
  if (!comments || comments.length === 0) {
    return "# Comments\n\nNo comments found.";
  }
  
  let text = "# Comments\n\n";
  
  comments.forEach(comment => {
    const date = new Date(comment.created_at).toLocaleString();
    const typeLabel = comment.comment_type === 'human' ? 'Human' : 
                       comment.comment_type === 'agent' ? 'AI Agent' : 'System';
    
    text += `## ${typeLabel} Comment (${date})\n\n`;
    text += `**ID:** \`${comment.id}\`\n\n`;
    text += `**User:** \`${comment.user_id}\`\n\n`;
    text += `${comment.content}\n\n`;
    text += `---\n\n`;
  });
  
  return text;
}

/**
 * Format logs as markdown text
 * @param {Array} logs - List of logs
 * @returns {string} - Markdown text
 */
function formatLogsText(logs) {
  if (!logs || logs.length === 0) {
    return "# Logs\n\nNo logs found.";
  }
  
  let text = "# Logs\n\n";
  
  logs.forEach(log => {
    const date = new Date(log.created_at).toLocaleString();
    
    text += `## ${log.log_type} Log (${date})\n\n`;
    text += `**ID:** \`${log.id}\`\n\n`;
    text += `**User:** \`${log.user_id}\`\n\n`;
    text += `${log.content}\n\n`;
    
    if (log.metadata && Object.keys(log.metadata).length > 0) {
      text += `**Metadata:**\n\n\`\`\`json\n${JSON.stringify(log.metadata, null, 2)}\n\`\`\`\n\n`;
    }
    
    if (log.tags && log.tags.length > 0) {
      text += `**Tags:** ${log.tags.join(', ')}\n\n`;
    }
    
    text += `---\n\n`;
  });
  
  return text;
}

/**
 * Format artifacts as markdown text
 * @param {Array} artifacts - List of artifacts
 * @returns {string} - Markdown text
 */
function formatArtifactsText(artifacts) {
  if (!artifacts || artifacts.length === 0) {
    return "# Artifacts\n\nNo artifacts found.";
  }
  
  let text = "# Artifacts\n\n";
  
  artifacts.forEach(artifact => {
    const date = new Date(artifact.created_at).toLocaleString();
    
    text += `## ${artifact.name} (${date})\n\n`;
    text += `**ID:** \`${artifact.id}\`\n\n`;
    text += `**Content Type:** ${artifact.content_type}\n\n`;
    text += `**URL:** ${artifact.url}\n\n`;
    text += `**Created By:** \`${artifact.created_by}\`\n\n`;
    
    if (artifact.metadata && Object.keys(artifact.metadata).length > 0) {
      text += `**Metadata:**\n\n\`\`\`json\n${JSON.stringify(artifact.metadata, null, 2)}\n\`\`\`\n\n`;
    }
    
    text += `---\n\n`;
  });
  
  return text;
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

module.exports = { setupResources };
