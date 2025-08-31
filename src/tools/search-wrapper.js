/**
 * Search wrapper for the agent-planner-mcp
 * 
 * This module provides wrapper functions for the search API calls
 * that properly handle the response format (extracting the results array
 * from the {query, results, count} response structure).
 */
const apiClient = require('../api-client');

/**
 * Search within a plan and return only the results array
 * 
 * @param {string} planId - ID of the plan to search
 * @param {string} query - Search query text
 * @returns {Promise<Array>} - Array of search results
 */
async function searchPlan(planId, query) {
  try {
    // Call the original search function from the API client
    const response = await apiClient.search.searchPlan(planId, query);
    
    // Log the actual response for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('Search plan response:', typeof response, Object.keys(response || {}));
    }
    
    // Handle different response formats
    if (!response) {
      return [];
    }
    
    // If response is already an array, return it
    if (Array.isArray(response)) {
      return response;
    }
    
    // If response has results array
    if (response.results && Array.isArray(response.results)) {
      return response.results;
    }
    
    // If response has other properties that are arrays
    const results = [];
    Object.keys(response).forEach(key => {
      if (Array.isArray(response[key])) {
        response[key].forEach(item => {
          results.push({
            ...item,
            type: item.type || key,
            source: 'plan_search'
          });
        });
      }
    });
    
    if (results.length > 0) {
      return results;
    }
    
    // Try to parse response as a search result object
    if (response.query !== undefined && response.count !== undefined) {
      return response.results || [];
    }
    
    console.error('Unexpected search response format:', JSON.stringify(response).substring(0, 200));
    return [];
  } catch (error) {
    console.error('Error in searchPlan wrapper:', error.message);
    return [];
  }
}

/**
 * Global search across all plans and return only the results
 * 
 * @param {string} query - Search query text
 * @returns {Promise<Array>} - Flattened array of all search results
 */
async function globalSearch(query) {
  try {
    // Call the original global search function
    const response = await apiClient.search.globalSearch(query);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Global search response type:', typeof response);
      if (response) {
        console.log('Response keys:', Object.keys(response));
      }
    }
    
    // Handle different response formats
    if (!response) {
      return [];
    }
    
    // If response is already an array of results
    if (Array.isArray(response)) {
      return response.map(item => ({
        ...item,
        type: item.type || 'unknown',
        source: 'global_search'
      }));
    }
    
    // If response has a results property
    if (response.results !== undefined) {
      // If results is already an array, return it
      if (Array.isArray(response.results)) {
        return response.results.map(item => ({
          ...item,
          type: item.type || 'unknown',
          source: 'global_search'
        }));
      }
      
      // If results is an object with categories
      if (typeof response.results === 'object') {
        const allResults = [];
        
        // Collect results from each category (plans, nodes, comments, etc.)
        Object.keys(response.results).forEach(category => {
          if (Array.isArray(response.results[category])) {
            // Add category type to each result
            const categoryResults = response.results[category].map(item => ({
              ...item,
              type: item.type || category,
              category,
              source: 'global_search'
            }));
            allResults.push(...categoryResults);
          }
        });
        
        return allResults;
      }
    }
    
    // Check if response has categorized results (plans, nodes, etc.)
    const categories = ['plans', 'nodes', 'comments', 'logs', 'artifacts'];
    const allResults = [];
    
    categories.forEach(category => {
      if (response[category] && Array.isArray(response[category])) {
        response[category].forEach(item => {
          allResults.push({
            ...item,
            type: item.type || category.slice(0, -1), // Remove 's' from category
            category,
            source: 'global_search'
          });
        });
      }
    });
    
    if (allResults.length > 0) {
      return allResults;
    }
    
    // Generic handler for any object with arrays
    Object.keys(response).forEach(key => {
      if (Array.isArray(response[key]) && key !== 'results') {
        response[key].forEach(item => {
          allResults.push({
            ...item,
            type: item.type || key,
            category: key,
            source: 'global_search'
          });
        });
      }
    });
    
    return allResults;
  } catch (error) {
    console.error('Error in globalSearch wrapper:', error.message);
    if (error.response) {
      console.error('API error status:', error.response.status);
      console.error('API error data:', error.response.data);
    }
    return [];
  }
}

// Export the wrapper functions
module.exports = {
  searchPlan,
  globalSearch
};
