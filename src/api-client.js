/**
 * Client for interacting with the Planning System API
 */
const axios = require('axios');
require('dotenv').config();

// Get token from environment
const userApiToken = process.env.USER_API_TOKEN || process.env.API_TOKEN; // Support both new and old env var names

// Determine proper authentication scheme
// If token looks like a JWT (has two dots), use Bearer scheme, otherwise use ApiKey
const getAuthScheme = (token) => {
  if (!token) return null;
  // Simple check if it's a JWT (contains two dots for header.payload.signature)
  return token.split('.').length === 3 ? 'Bearer' : 'ApiKey';
};

const authScheme = getAuthScheme(userApiToken);

// Create API client instance
const apiClient = axios.create({
  baseURL: process.env.API_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': userApiToken ? `${authScheme} ${userApiToken}` : undefined
  }
});

// Log API requests only in development mode
if (process.env.NODE_ENV === 'development') {
  apiClient.interceptors.request.use(request => {
    console.error(`API Request: ${request.method.toUpperCase()} ${request.url}`);
    return request;
  });
}

// Handle API responses - log details only in development, always handle auth errors helpfully
apiClient.interceptors.response.use(
  response => {
    if (process.env.NODE_ENV === 'development') {
      console.error(`API Response: ${response.status} ${response.statusText}`);
    }
    return response;
  },
  error => {
    // Always log auth errors helpfully (but not the token itself)
    if (error.response && error.response.status === 401) {
      console.error('API Error: Authentication failed (401). Please check that your USER_API_TOKEN is correct and not revoked.');
    } else if (process.env.NODE_ENV === 'development') {
      // Only log other errors in development
      console.error('API Error:', error.response ? error.response.data : error.message);
    }
    return Promise.reject(error);
  }
);

/**
 * Plan-related API functions
 */
const plans = {
  /**
   * Get a list of plans accessible to the current user
   * @returns {Promise<Array>} - List of plans
   */
  getPlans: async () => {
    const response = await apiClient.get('/plans');
    return response.data;
  },

  /**
   * Get a specific plan by ID
   * @param {string} planId - Plan ID
   * @returns {Promise<Object>} - Plan details
   */
  getPlan: async (planId) => {
    const response = await apiClient.get(`/plans/${planId}`);
    return response.data;
  },

  /**
   * Create a new plan
   * @param {Object} planData - Plan data (title, description, status)
   * @returns {Promise<Object>} - Created plan
   */
  createPlan: async (planData) => {
    const response = await apiClient.post('/plans', planData);
    return response.data;
  },

  /**
   * Update a plan
   * @param {string} planId - Plan ID
   * @param {Object} planData - Updated plan data
   * @returns {Promise<Object>} - Updated plan
   */
  updatePlan: async (planId, planData) => {
    const response = await apiClient.put(`/plans/${planId}`, planData);
    return response.data;
  },

  /**
   * Delete a plan
   * @param {string} planId - Plan ID
   * @returns {Promise<void>}
   */
  deletePlan: async (planId) => {
    await apiClient.delete(`/plans/${planId}`);
  },

  /**
   * Update plan visibility (make public or private)
   * @param {string} planId - Plan ID
   * @param {Object} visibilityData - Visibility settings
   * @param {string} visibilityData.visibility - 'public' or 'private'
   * @param {string} [visibilityData.github_repo_owner] - GitHub repo owner (for public plans)
   * @param {string} [visibilityData.github_repo_name] - GitHub repo name (for public plans)
   * @returns {Promise<Object>} - Updated plan with visibility info
   */
  updateVisibility: async (planId, visibilityData) => {
    const response = await apiClient.put(`/plans/${planId}/visibility`, visibilityData);
    return response.data;
  },

  /**
   * Get a public plan (no authentication required in browser, but API token needed for MCP)
   * @param {string} planId - Plan ID
   * @returns {Promise<Object>} - Public plan details
   */
  getPublicPlan: async (planId) => {
    const response = await apiClient.get(`/plans/${planId}/public`);
    return response.data;
  }
};

/**
 * Node-related API functions
 */
const nodes = {
  /**
   * Get nodes for a plan
   * @param {string} planId - Plan ID
   * @param {Object} options - Optional query parameters
   * @param {boolean} options.include_details - Include full node details (default: false)
   * @returns {Promise<Array>} - List of nodes
   */
  getNodes: async (planId, options = {}) => {
    const params = new URLSearchParams();
    if (options.include_details) {
      params.append('include_details', 'true');
    }

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const response = await apiClient.get(`/plans/${planId}/nodes${queryString}`);
    return response.data;
  },

  /**
   * Get a specific node
   * @param {string} planId - Plan ID
   * @param {string} nodeId - Node ID
   * @returns {Promise<Object>} - Node details
   */
  getNode: async (planId, nodeId) => {
    const response = await apiClient.get(`/plans/${planId}/nodes/${nodeId}`);
    return response.data;
  },

  /**
   * Create a new node
   * @param {string} planId - Plan ID
   * @param {Object} nodeData - Node data
   * @returns {Promise<Object>} - Created node
   */
  createNode: async (planId, nodeData) => {
    const response = await apiClient.post(`/plans/${planId}/nodes`, nodeData);
    return response.data;
  },

  /**
   * Update a node
   * @param {string} planId - Plan ID
   * @param {string} nodeId - Node ID
   * @param {Object} nodeData - Updated node data
   * @returns {Promise<Object>} - Updated node
   */
  updateNode: async (planId, nodeId, nodeData) => {
    const response = await apiClient.put(`/plans/${planId}/nodes/${nodeId}`, nodeData);
    return response.data;
  },

  /**
   * Update node status
   * @param {string} planId - Plan ID
   * @param {string} nodeId - Node ID
   * @param {string} status - New status
   * @returns {Promise<Object>} - Updated node
   */
  updateNodeStatus: async (planId, nodeId, status) => {
    const response = await apiClient.put(`/plans/${planId}/nodes/${nodeId}/status`, { status });
    return response.data;
  },

  /**
   * Delete a node
   * @param {string} planId - Plan ID
   * @param {string} nodeId - Node ID
   * @returns {Promise<void>}
   */
  deleteNode: async (planId, nodeId) => {
    await apiClient.delete(`/plans/${planId}/nodes/${nodeId}`);
  },

  claimTask: async (planId, nodeId, agentId = 'mcp-agent', ttlMinutes = 30) => {
    const response = await apiClient.post(`/plans/${planId}/nodes/${nodeId}/claim`, { agent_id: agentId, ttl_minutes: ttlMinutes });
    return response.data;
  },

  releaseTask: async (planId, nodeId, agentId = 'mcp-agent') => {
    const response = await apiClient.delete(`/plans/${planId}/nodes/${nodeId}/claim`, { data: { agent_id: agentId } });
    return response.data;
  },

  getTaskClaim: async (planId, nodeId) => {
    const response = await apiClient.get(`/plans/${planId}/nodes/${nodeId}/claim`);
    return response.data;
  }
};

/**
 * Comment-related API functions
 */
const comments = {
  /**
   * Get comments for a node
   * @param {string} planId - Plan ID
   * @param {string} nodeId - Node ID
   * @returns {Promise<Array>} - List of comments
   */
  getComments: async (planId, nodeId) => {
    const response = await apiClient.get(`/plans/${planId}/nodes/${nodeId}/comments`);
    return response.data;
  },

  /**
   * Add a comment to a node
   * @param {string} planId - Plan ID
   * @param {string} nodeId - Node ID
   * @param {Object} commentData - Comment data
   * @returns {Promise<Object>} - Created comment
   */
  addComment: async (planId, nodeId, commentData) => {
    const response = await apiClient.post(`/plans/${planId}/nodes/${nodeId}/comments`, commentData);
    return response.data;
  }
};

/**
 * Log-related API functions
 */
const logs = {
  /**
   * Get logs for a node
   * @param {string} planId - Plan ID
   * @param {string} nodeId - Node ID
   * @returns {Promise<Array>} - List of logs
   */
  getLogs: async (planId, nodeId) => {
    const response = await apiClient.get(`/plans/${planId}/nodes/${nodeId}/logs`);
    return response.data;
  },

  /**
   * Add a log entry to a node
   * @param {string} planId - Plan ID
   * @param {string} nodeId - Node ID
   * @param {Object} logData - Log data
   * @returns {Promise<Object>} - Created log entry
   */
  addLogEntry: async (planId, nodeId, logData) => {
    const response = await apiClient.post(`/plans/${planId}/nodes/${nodeId}/log`, logData);
    return response.data;
  }
};

/**
 * Activity-related API functions
 */
const activity = {
  /**
   * Get activity feed for a plan
   * @param {string} planId - Plan ID
   * @returns {Promise<Array>} - Activity feed
   */
  getPlanActivity: async (planId) => {
    const response = await apiClient.get(`/activity/plans/${planId}/activity`);
    return response.data;
  },

  /**
   * Get global activity feed
   * @returns {Promise<Array>} - Activity feed
   */
  getGlobalActivity: async () => {
    const response = await apiClient.get('/activity/feed');
    return response.data;
  }
};

/**
 * Search-related API functions
 */
const search = {
  /**
   * Search within a plan
   * @param {string} planId - Plan ID
   * @param {string} query - Search query
   * @returns {Promise<Object>} - Search results
   */
  searchPlan: async (planId, query) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`Searching plan ${planId} for "${query}"`);
    }
    
    try {
      // Try the documented endpoint first
      const response = await apiClient.get(`/search/plan/${planId}`, {
        params: { query: query } // API expects 'query' parameter
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Search response status:', response.status);
        console.log('Search response type:', typeof response.data);
      }
      
      return response.data;
    } catch (error) {
      // Try alternative endpoint format
      if (error.response && error.response.status === 404) {
        try {
          const altResponse = await apiClient.get(`/plans/${planId}/search`, {
            params: { query: query }
          });
          return altResponse.data;
        } catch (altError) {
          // Fallback to client-side search
          console.error('Search endpoints not found, falling back to client-side search');
          
          // Get all nodes and search client-side
          try {
            const nodes = await apiClient.get(`/plans/${planId}/nodes`);
            const results = [];
            
            const searchLower = query.toLowerCase();
            const searchNodes = (nodeList) => {
              nodeList.forEach(node => {
                if (node.title?.toLowerCase().includes(searchLower) ||
                    node.description?.toLowerCase().includes(searchLower) ||
                    node.context?.toLowerCase().includes(searchLower)) {
                  results.push({
                    id: node.id,
                    type: 'node',
                    title: node.title,
                    content: node.description || node.context || '',
                    created_at: node.created_at,
                    user_id: node.created_by
                  });
                }
                if (node.children && node.children.length > 0) {
                  searchNodes(node.children);
                }
              });
            };
            
            searchNodes(nodes.data);
            
            return {
              query,
              results,
              count: results.length
            };
          } catch (fallbackError) {
            console.error('Fallback search failed:', fallbackError.message);
          }
        }
      }
      
      console.error('Error searching plan:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
      }
      
      // Return empty results on error
      return { results: [], count: 0, query };
    }
  },

  /**
   * Global search across all plans
   * @param {string} query - Search query
   * @returns {Promise<Object>} - Search results
   */
  globalSearch: async (query) => {
    try {
      const response = await apiClient.get('/search', {
        params: { query: query } // API expects 'query' parameter
      });
      return response.data;
    } catch (error) {
      console.error('Global search error:', error.message);
      
      // Fallback: search through all accessible plans
      if (error.response && (error.response.status === 404 || error.response.status === 500)) {
        try {
          const plansResponse = await apiClient.get('/plans');
          const plans = plansResponse.data;
          const results = [];
          
          const searchLower = query.toLowerCase();
          
          // Search in plans
          plans.forEach(plan => {
            if (plan.title?.toLowerCase().includes(searchLower) ||
                plan.description?.toLowerCase().includes(searchLower)) {
              results.push({
                id: plan.id,
                type: 'plan',
                title: plan.title,
                content: plan.description || '',
                created_at: plan.created_at
              });
            }
          });
          
          return {
            query,
            results,
            count: results.length
          };
        } catch (fallbackError) {
          console.error('Fallback global search failed:', fallbackError.message);
        }
      }
      
      // Return empty results on error
      return { results: [], count: 0, query };
    }
  }
};

/**
 * API Token functions
 */
const tokens = {
  /**
   * Get all API tokens
   * @returns {Promise<Array>} - List of API tokens
   */
  getTokens: async () => {
    const response = await apiClient.get('/auth/token');
    return response.data;
  },

  /**
   * Create a new API token
   * @param {Object} tokenData - Token data
   * @returns {Promise<Object>} - Created token
   */
  createToken: async (tokenData) => {
    const response = await apiClient.post('/auth/token', tokenData);
    return response.data;
  },

  /**
   * Revoke an API token
   * @param {string} tokenId - Token ID
   * @returns {Promise<void>}
   */
  revokeToken: async (tokenId) => {
    await apiClient.delete(`/auth/token/${tokenId}`);
  }
};

/**
 * Organization API functions
 */
const organizations = {
  list: async () => {
    const response = await apiClient.get('/organizations');
    return response.data.organizations || response.data;
  },
  
  get: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}`);
    return response.data;
  },
  
  create: async (data) => {
    const response = await apiClient.post('/organizations', data);
    return response.data;
  },
  
  update: async (orgId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}`, data);
    return response.data;
  },
  
  delete: async (orgId) => {
    const response = await apiClient.delete(`/organizations/${orgId}`);
    return response.data;
  },
  
  listMembers: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/members`);
    return response.data.members || response.data;
  },
  
  addMember: async (orgId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/members`, data);
    return response.data;
  },
  
  removeMember: async (orgId, memberId) => {
    const response = await apiClient.delete(`/organizations/${orgId}/members/${memberId}`);
    return response.data;
  }
};

/**
 * Goals API functions
 */
const goals = {
  list: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.organization_id) params.append('organization_id', filters.organization_id);
    if (filters.status) params.append('status', filters.status);
    const response = await apiClient.get(`/goals?${params.toString()}`);
    return response.data.goals || response.data;
  },
  
  get: async (goalId) => {
    const response = await apiClient.get(`/goals/${goalId}`);
    return response.data;
  },
  
  create: async (data) => {
    const response = await apiClient.post('/goals', data);
    return response.data;
  },
  
  update: async (goalId, data) => {
    const response = await apiClient.put(`/goals/${goalId}`, data);
    return response.data;
  },
  
  delete: async (goalId) => {
    const response = await apiClient.delete(`/goals/${goalId}`);
    return response.data;
  },

  linkPlan: async (goalId, planId) => {
    const response = await apiClient.post(`/goals/${goalId}/links`, {
      linkedType: 'plan', linkedId: planId
    });
    return response.data;
  },

  unlinkPlan: async (goalId, planId) => {
    const goal = await apiClient.get(`/goals/${goalId}`);
    const link = (goal.data.links || []).find(
      l => l.linkedType === 'plan' && l.linkedId === planId
    );
    if (!link) return { success: false, message: 'Link not found' };
    const response = await apiClient.delete(`/goals/${goalId}/links/${link.id}`);
    return response.data;
  },

  // v2 goal-dependency endpoints
  getPath: async (goalId, maxDepth) => {
    const params = maxDepth ? `?max_depth=${maxDepth}` : '';
    const response = await apiClient.get(`/goals/${goalId}/path${params}`);
    return response.data;
  },

  getProgress: async (goalId) => {
    const response = await apiClient.get(`/goals/${goalId}/progress`);
    return response.data;
  },

  listAchievers: async (goalId) => {
    const response = await apiClient.get(`/goals/${goalId}/achievers`);
    return response.data;
  },

  addAchiever: async (goalId, sourceNodeId, weight) => {
    const response = await apiClient.post(`/goals/${goalId}/achievers`, {
      source_node_id: sourceNodeId,
      weight: weight ?? 1,
    });
    return response.data;
  },

  removeAchiever: async (goalId, depId) => {
    const response = await apiClient.delete(`/goals/${goalId}/achievers/${depId}`);
    return response.data;
  },

  getKnowledgeGaps: async (goalId) => {
    const response = await apiClient.get(`/goals/${goalId}/knowledge-gaps`);
    return response.data;
  },

  getDashboard: async () => {
    const response = await apiClient.get('/goals/dashboard');
    return response.data;
  },
};

/**
 * Agent Context API functions (leaf-up context loading)
 */
const context = {
  /**
   * Get focused context for a specific node (task/phase)
   * Traverses from node up to root, including goals, org, and knowledge
   * @param {string} nodeId - Node ID
   * @param {Object} options - Options (include_knowledge, include_siblings)
   * @returns {Promise<Object>} - Agent context
   */
  getNodeContext: async (nodeId, options = {}) => {
    const params = new URLSearchParams({ node_id: nodeId });
    if (options.include_knowledge !== undefined) {
      params.append('include_knowledge', options.include_knowledge);
    }
    if (options.include_siblings !== undefined) {
      params.append('include_siblings', options.include_siblings);
    }
    const response = await apiClient.get(`/context?${params.toString()}`);
    return response.data;
  },

  /**
   * Get plan-level context (overview, not full tree)
   * @param {string} planId - Plan ID
   * @param {Object} options - Options (include_knowledge)
   * @returns {Promise<Object>} - Plan context
   */
  getPlanContext: async (planId, options = {}) => {
    const params = new URLSearchParams({ plan_id: planId });
    if (options.include_knowledge !== undefined) {
      params.append('include_knowledge', options.include_knowledge);
    }
    const response = await apiClient.get(`/context/plan?${params.toString()}`);
    return response.data;
  }
};

/**
 * Graphiti Knowledge Graph API functions (proxied through AgentPlanner API)
 */
const graphiti = {
  /**
   * Get Graphiti status
   * GET /knowledge/graphiti/status
   */
  getStatus: async () => {
    const response = await apiClient.get('/knowledge/graphiti/status');
    return response.data;
  },

  /**
   * Add a knowledge episode to Graphiti
   * POST /knowledge/episodes
   */
  addEpisode: async (data) => {
    const response = await apiClient.post('/knowledge/episodes', data);
    return response.data;
  },

  /**
   * Search knowledge in Graphiti temporal graph
   * POST /knowledge/graph-search
   */
  graphSearch: async (data) => {
    const response = await apiClient.post('/knowledge/graph-search', data);
    return response.data;
  },

  /**
   * Search entities in Graphiti
   * POST /knowledge/entities
   */
  searchEntities: async (data) => {
    const response = await apiClient.post('/knowledge/entities', data);
    return response.data;
  },

  /**
   * Detect contradictions in knowledge
   * POST /knowledge/contradictions
   */
  detectContradictions: async (data) => {
    const response = await apiClient.post('/knowledge/contradictions', data);
    return response.data;
  },

  /**
   * Get recent episodes from Graphiti
   * GET /knowledge/episodes
   */
  getEpisodes: async ({ max_episodes = 20 } = {}) => {
    const response = await apiClient.get('/knowledge/episodes', { params: { max_episodes } });
    return response.data;
  },

  /**
   * Delete an episode from Graphiti
   * DELETE /knowledge/episodes/:episodeId
   */
  deleteEpisode: async (episodeId) => {
    const response = await apiClient.delete(`/knowledge/episodes/${episodeId}`);
    return response.data;
  }
};

// ─── Dependencies (cross-plan & external) ─────────────────────
const dependencies = {
  /**
   * Create a cross-plan dependency edge
   * POST /dependencies/cross-plan
   */
  createCrossPlan: async (data) => {
    const response = await apiClient.post('/dependencies/cross-plan', data);
    return response.data;
  },

  /**
   * List cross-plan dependency edges between plans
   * GET /dependencies/cross-plan?plan_ids=id1,id2
   */
  listCrossPlan: async (planIds) => {
    const response = await apiClient.get('/dependencies/cross-plan', {
      params: { plan_ids: planIds.join(',') },
    });
    return response.data;
  },

  /**
   * Create an external dependency node (and optionally a blocking edge)
   * POST /dependencies/external
   */
  createExternal: async (data) => {
    const response = await apiClient.post('/dependencies/external', data);
    return response.data;
  },
};

/**
 * Create an API client bound to a specific token.
 * Used by the HTTP MCP server to create per-session clients.
 * @param {string} token - API token or JWT
 * @returns {Object} - API client modules (plans, nodes, etc.)
 */
function createApiClient(token) {
  const scheme = getAuthScheme(token);
  const client = axios.create({
    baseURL: process.env.API_URL || 'http://localhost:3000',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `${scheme} ${token}` : undefined
    }
  });

  // Reuse the same interceptors
  if (process.env.NODE_ENV === 'development') {
    client.interceptors.request.use(request => {
      console.error(`API Request: ${request.method.toUpperCase()} ${request.url}`);
      return request;
    });
  }
  client.interceptors.response.use(
    response => response,
    error => {
      if (error.response && error.response.status === 401) {
        console.error('API Error: Authentication failed (401).');
      }
      return Promise.reject(error);
    }
  );

  // Build the same module structure using the per-session client
  return {
    plans: {
      getPlans: async () => (await client.get('/plans')).data,
      getPlan: async (planId) => (await client.get(`/plans/${planId}`)).data,
      createPlan: async (planData) => (await client.post('/plans', planData)).data,
      updatePlan: async (planId, planData) => (await client.put(`/plans/${planId}`, planData)).data,
      deletePlan: async (planId) => await client.delete(`/plans/${planId}`),
      updateVisibility: async (planId, data) => (await client.put(`/plans/${planId}/visibility`, data)).data,
      getPublicPlan: async (planId) => (await client.get(`/plans/${planId}/public`)).data,
    },
    nodes: {
      getNodes: async (planId, options = {}) => {
        const params = new URLSearchParams();
        if (options.include_details) params.append('include_details', 'true');
        const qs = params.toString() ? `?${params.toString()}` : '';
        return (await client.get(`/plans/${planId}/nodes${qs}`)).data;
      },
      getNode: async (planId, nodeId) => (await client.get(`/plans/${planId}/nodes/${nodeId}`)).data,
      createNode: async (planId, nodeData) => (await client.post(`/plans/${planId}/nodes`, nodeData)).data,
      updateNode: async (planId, nodeId, nodeData) => (await client.put(`/plans/${planId}/nodes/${nodeId}`, nodeData)).data,
      updateNodeStatus: async (planId, nodeId, status) => (await client.put(`/plans/${planId}/nodes/${nodeId}/status`, { status })).data,
      deleteNode: async (planId, nodeId) => await client.delete(`/plans/${planId}/nodes/${nodeId}`),
      claimTask: async (planId, nodeId, agentId = 'mcp-agent', ttlMinutes = 30) => (await client.post(`/plans/${planId}/nodes/${nodeId}/claim`, { agent_id: agentId, ttl_minutes: ttlMinutes })).data,
      releaseTask: async (planId, nodeId, agentId = 'mcp-agent') => (await client.delete(`/plans/${planId}/nodes/${nodeId}/claim`, { data: { agent_id: agentId } })).data,
      getTaskClaim: async (planId, nodeId) => (await client.get(`/plans/${planId}/nodes/${nodeId}/claim`)).data,
    },
    comments: {
      getComments: async (planId, nodeId) => (await client.get(`/plans/${planId}/nodes/${nodeId}/comments`)).data,
      addComment: async (planId, nodeId, data) => (await client.post(`/plans/${planId}/nodes/${nodeId}/comments`, data)).data,
    },
    logs: {
      getLogs: async (planId, nodeId) => (await client.get(`/plans/${planId}/nodes/${nodeId}/logs`)).data,
      addLogEntry: async (planId, nodeId, data) => (await client.post(`/plans/${planId}/nodes/${nodeId}/log`, data)).data,
    },
    activity: {
      getPlanActivity: async (planId) => (await client.get(`/activity/plans/${planId}/activity`)).data,
      getGlobalActivity: async () => (await client.get('/activity/feed')).data,
    },
    search: {
      searchPlan: async (planId, query) => {
        try {
          return (await client.get(`/search/plan/${planId}`, { params: { query } })).data;
        } catch (error) {
          return { results: [], count: 0, query };
        }
      },
      globalSearch: async (query) => {
        try {
          return (await client.get('/search', { params: { query } })).data;
        } catch (error) {
          return { results: [], count: 0, query };
        }
      },
    },
    tokens: {
      getTokens: async () => (await client.get('/auth/token')).data,
      createToken: async (data) => (await client.post('/auth/token', data)).data,
      revokeToken: async (tokenId) => await client.delete(`/auth/token/${tokenId}`),
    },
    organizations: {
      list: async () => { const r = await client.get('/organizations'); return r.data.organizations || r.data; },
      get: async (orgId) => (await client.get(`/organizations/${orgId}`)).data,
      create: async (data) => (await client.post('/organizations', data)).data,
      update: async (orgId, data) => (await client.put(`/organizations/${orgId}`, data)).data,
      delete: async (orgId) => (await client.delete(`/organizations/${orgId}`)).data,
      listMembers: async (orgId) => { const r = await client.get(`/organizations/${orgId}/members`); return r.data.members || r.data; },
      addMember: async (orgId, data) => (await client.post(`/organizations/${orgId}/members`, data)).data,
      removeMember: async (orgId, memberId) => (await client.delete(`/organizations/${orgId}/members/${memberId}`)).data,
    },
    goals: {
      list: async (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.organization_id) params.append('organization_id', filters.organization_id);
        if (filters.status) params.append('status', filters.status);
        const r = await client.get(`/goals?${params.toString()}`);
        return r.data.goals || r.data;
      },
      get: async (goalId) => (await client.get(`/goals/${goalId}`)).data,
      create: async (data) => (await client.post('/goals', data)).data,
      update: async (goalId, data) => (await client.put(`/goals/${goalId}`, data)).data,
      delete: async (goalId) => (await client.delete(`/goals/${goalId}`)).data,
      linkPlan: async (goalId, planId) => (await client.post(`/goals/${goalId}/links`, { linkedType: 'plan', linkedId: planId })).data,
      unlinkPlan: async (goalId, planId) => {
        const goal = await client.get(`/goals/${goalId}`);
        const link = (goal.data.links || []).find(l => l.linkedType === 'plan' && l.linkedId === planId);
        if (!link) return { success: false, message: 'Link not found' };
        return (await client.delete(`/goals/${goalId}/links/${link.id}`)).data;
      },
      getPath: async (goalId, maxDepth) => { const p = maxDepth ? `?max_depth=${maxDepth}` : ''; return (await client.get(`/goals/${goalId}/path${p}`)).data; },
      getProgress: async (goalId) => (await client.get(`/goals/${goalId}/progress`)).data,
      listAchievers: async (goalId) => (await client.get(`/goals/${goalId}/achievers`)).data,
      addAchiever: async (goalId, sourceNodeId, weight) => (await client.post(`/goals/${goalId}/achievers`, { source_node_id: sourceNodeId, weight: weight ?? 1 })).data,
      removeAchiever: async (goalId, depId) => (await client.delete(`/goals/${goalId}/achievers/${depId}`)).data,
      getKnowledgeGaps: async (goalId) => (await client.get(`/goals/${goalId}/knowledge-gaps`)).data,
      getDashboard: async () => (await client.get('/goals/dashboard')).data,
    },
    context: {
      getNodeContext: async (nodeId, options = {}) => {
        const params = new URLSearchParams({ node_id: nodeId });
        if (options.include_knowledge !== undefined) params.append('include_knowledge', options.include_knowledge);
        if (options.include_siblings !== undefined) params.append('include_siblings', options.include_siblings);
        return (await client.get(`/context?${params.toString()}`)).data;
      },
      getPlanContext: async (planId, options = {}) => {
        const params = new URLSearchParams({ plan_id: planId });
        if (options.include_knowledge !== undefined) params.append('include_knowledge', options.include_knowledge);
        return (await client.get(`/context/plan?${params.toString()}`)).data;
      },
    },
    graphiti: {
      getStatus: async () => (await client.get('/knowledge/graphiti/status')).data,
      addEpisode: async (data) => (await client.post('/knowledge/episodes', data)).data,
      graphSearch: async (data) => (await client.post('/knowledge/graph-search', data)).data,
      searchEntities: async (data) => (await client.post('/knowledge/entities', data)).data,
      detectContradictions: async (data) => (await client.post('/knowledge/contradictions', data)).data,
      getEpisodes: async ({ max_episodes = 20 } = {}) => (await client.get('/knowledge/episodes', { params: { max_episodes } })).data,
      deleteEpisode: async (episodeId) => (await client.delete(`/knowledge/episodes/${episodeId}`)).data,
    },
    dependencies: {
      createCrossPlan: async (data) => (await client.post('/dependencies/cross-plan', data)).data,
      listCrossPlan: async (planIds) => (await client.get('/dependencies/cross-plan', { params: { plan_ids: planIds.join(',') } })).data,
      createExternal: async (data) => (await client.post('/dependencies/external', data)).data,
    },
    axiosInstance: client,
  };
}

// Export API client functions
// Export the axios instance for direct use
const axiosInstance = apiClient;

module.exports = {
  plans,
  nodes,
  comments,
  logs,
  activity,
  search,
  tokens,
  organizations,
  goals,
  context,
  graphiti,
  dependencies,
  axiosInstance,  // Export for direct API calls
  createApiClient  // Factory for per-session clients (HTTP mode)
};
