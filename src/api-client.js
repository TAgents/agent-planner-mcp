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

// Log API requests in debug mode
apiClient.interceptors.request.use(request => {
  console.error(`API Request: ${request.method.toUpperCase()} ${request.url}`);
  return request;
});

// Log API responses in debug mode
apiClient.interceptors.response.use(
  response => {
    console.error(`API Response: ${response.status} ${response.statusText}`);
    return response;
  },
  error => {
    if (error.response && error.response.status === 401) {
      console.error('API Error: Authentication failed (401). Please check that your USER_API_TOKEN is correct, valid, and not revoked.');
      console.error('If you are still using the old API_TOKEN, please generate a USER_API_TOKEN from the agent-planner UI.');
    } else {
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
   * @returns {Promise<Array>} - List of nodes
   */
  getNodes: async (planId) => {
    const response = await apiClient.get(`/plans/${planId}/nodes`);
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
 * Artifact-related API functions
 */
const artifacts = {
  /**
   * Get artifacts for a node
   * @param {string} planId - Plan ID
   * @param {string} nodeId - Node ID
   * @returns {Promise<Array>} - List of artifacts
   */
  getArtifacts: async (planId, nodeId) => {
    const response = await apiClient.get(`/plans/${planId}/nodes/${nodeId}/artifacts`);
    return response.data;
  },

  /**
   * Get a specific artifact by ID
   * @param {string} planId - Plan ID
   * @param {string} nodeId - Node ID
   * @param {string} artifactId - Artifact ID
   * @returns {Promise<Object>} - Artifact details
   */
  getArtifact: async (planId, nodeId, artifactId) => {
    const response = await apiClient.get(`/plans/${planId}/nodes/${nodeId}/artifacts/${artifactId}`);
    return response.data;
  },

  /**
   * Get the content of an artifact
   * @param {string} planId - Plan ID
   * @param {string} nodeId - Node ID
   * @param {string} artifactId - Artifact ID
   * @returns {Promise<string>} - Artifact content
   */
  getArtifactContent: async (planId, nodeId, artifactId) => {
    try {
      // First, get artifact details to check the URL
      const artifact = await artifacts.getArtifact(planId, nodeId, artifactId);
      
      // If the artifact has a URL, fetch the content
      if (artifact.url) {
        try {
          // For local file paths, use fs instead of HTTP request
          if (artifact.url.startsWith('/') && !artifact.url.startsWith('/api/')) {
            const fs = require('fs').promises;
            try {
              // Read the file directly from the filesystem
              const content = await fs.readFile(artifact.url, 'utf8');
              return content;
            } catch (fsError) {
              console.error('Error reading artifact file:', fsError);
              throw new Error(`Cannot read file at ${artifact.url}: ${fsError.message}`);
            }
          } else {
            // For internal URLs (API routes), append to base URL
            const contentUrl = artifact.url.startsWith('/api/') 
              ? `${apiClient.defaults.baseURL}${artifact.url}`
              : artifact.url;
            
            const contentResponse = await axios.get(contentUrl, {
              headers: {
                'Authorization': apiClient.defaults.headers['Authorization'],
                'Accept': artifact.content_type || 'text/plain'
              },
              responseType: 'text'
            });
            
            return contentResponse.data;
          }
        } catch (fetchError) {
          console.error('Error fetching artifact content:', fetchError);
          throw new Error(`Failed to fetch artifact content: ${fetchError.message}`);
        }
      } else {
        throw new Error('Artifact does not have a content URL');
      }
    } catch (error) {
      console.error('Error fetching artifact content:', error);
      throw error;
    }
  },

  /**
   * Add an artifact to a node
   * @param {string} planId - Plan ID
   * @param {string} nodeId - Node ID
   * @param {Object} artifactData - Artifact data
   * @returns {Promise<Object>} - Created artifact
   */
  addArtifact: async (planId, nodeId, artifactData) => {
    const response = await apiClient.post(`/plans/${planId}/nodes/${nodeId}/artifacts`, artifactData);
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
    const response = await apiClient.get(`/activity/plan/${planId}`);
    return response.data;
  },

  /**
   * Get global activity feed
   * @returns {Promise<Array>} - Activity feed
   */
  getGlobalActivity: async () => {
    const response = await apiClient.get('/activity');
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
    const response = await apiClient.get('/tokens');
    return response.data;
  },

  /**
   * Create a new API token
   * @param {Object} tokenData - Token data
   * @returns {Promise<Object>} - Created token
   */
  createToken: async (tokenData) => {
    const response = await apiClient.post('/tokens', tokenData);
    return response.data;
  },

  /**
   * Revoke an API token
   * @param {string} tokenId - Token ID
   * @returns {Promise<void>}
   */
  revokeToken: async (tokenId) => {
    await apiClient.delete(`/tokens/${tokenId}`);
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
  artifacts,
  activity,
  search,
  tokens,
  context,
  axiosInstance  // Export for direct API calls
};
