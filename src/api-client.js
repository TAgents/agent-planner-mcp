/**
 * Client for interacting with the Planning System API
 */
const axios = require('axios');
require('dotenv').config();

// Define authentication scheme for API tokens
const API_KEY_SCHEME = 'ApiKey';
const userApiToken = process.env.USER_API_TOKEN || process.env.API_TOKEN; // Support both new and old env var names

// Create API client instance
const apiClient = axios.create({
  baseURL: process.env.API_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': userApiToken ? `${API_KEY_SCHEME} ${userApiToken}` : undefined
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
   * @returns {Promise<Array>} - Search results
   */
  searchPlan: async (planId, query) => {
    const response = await apiClient.get(`/search/plan/${planId}?q=${encodeURIComponent(query)}`);
    return response.data;
  },

  /**
   * Global search across all plans
   * @param {string} query - Search query
   * @returns {Promise<Array>} - Search results
   */
  globalSearch: async (query) => {
    const response = await apiClient.get(`/search?q=${encodeURIComponent(query)}`);
    return response.data;
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

// Export API client functions
module.exports = {
  plans,
  nodes,
  comments,
  logs,
  artifacts,
  activity,
  search,
  tokens
};
