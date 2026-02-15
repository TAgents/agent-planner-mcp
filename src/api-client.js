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
  
  updateMetrics: async (goalId, metrics) => {
    const response = await apiClient.put(`/goals/${goalId}/metrics`, { metrics });
    return response.data;
  },
  
  delete: async (goalId) => {
    const response = await apiClient.delete(`/goals/${goalId}`);
    return response.data;
  },
  
  linkPlan: async (goalId, planId) => {
    const response = await apiClient.post(`/goals/${goalId}/plans/${planId}`);
    return response.data;
  },
  
  unlinkPlan: async (goalId, planId) => {
    const response = await apiClient.delete(`/goals/${goalId}/plans/${planId}`);
    return response.data;
  }
};

/**
 * Knowledge Store API functions
 */
const knowledge = {
  /**
   * List knowledge entries with optional filters
   * GET /knowledge
   */
  listEntries: async (storeIdOrFilters, filters = {}) => {
    const params = new URLSearchParams();
    // Support both (storeId, filters) and (filters) calling patterns
    if (typeof storeIdOrFilters === 'string') {
      params.append('scopeId', storeIdOrFilters);
      if (filters.entry_type) params.append('entryType', filters.entry_type);
      if (filters.tags) params.append('tags', filters.tags);
      if (filters.limit) params.append('limit', filters.limit);
      if (filters.offset) params.append('offset', filters.offset);
    } else if (typeof storeIdOrFilters === 'object') {
      const f = storeIdOrFilters;
      if (f.scope) params.append('scope', f.scope);
      if (f.scope_id) params.append('scopeId', f.scope_id);
      if (f.entry_type) params.append('entryType', f.entry_type);
      if (f.limit) params.append('limit', f.limit);
      if (f.offset) params.append('offset', f.offset);
    }
    const response = await apiClient.get(`/knowledge?${params.toString()}`);
    return response.data;
  },

  /**
   * Alias for listEntries — used by get_context and understand_context tools
   */
  getEntries: async (filters = {}) => {
    return knowledge.listEntries(filters);
  },

  /**
   * Get a single knowledge entry
   * GET /knowledge/:id
   */
  getEntry: async (entryId) => {
    const response = await apiClient.get(`/knowledge/${entryId}`);
    return response.data;
  },

  /**
   * Create a knowledge entry
   * POST /knowledge
   */
  createEntry: async (data) => {
    const response = await apiClient.post('/knowledge', data);
    return response.data;
  },

  /**
   * Update a knowledge entry
   * PUT /knowledge/:id
   */
  updateEntry: async (entryId, data) => {
    const response = await apiClient.put(`/knowledge/${entryId}`, data);
    return response.data;
  },

  /**
   * Delete a knowledge entry
   * DELETE /knowledge/:id
   */
  deleteEntry: async (entryId) => {
    const response = await apiClient.delete(`/knowledge/${entryId}`);
    return response.data;
  },

  /**
   * Semantic search across knowledge entries
   * POST /knowledge/search
   */
  search: async (data) => {
    const response = await apiClient.post('/knowledge/search', data);
    return response.data;
  }
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
  knowledge,
  context,
  axiosInstance  // Export for direct API calls
};
