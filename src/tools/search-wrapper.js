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
    
    // Extract and return just the results array
    if (response && response.results && Array.isArray(response.results)) {
      return response.results;
    } else {
      console.error('Unexpected search response format:', JSON.stringify(response));
      return [];
    }
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
    
    // For global search, the results might be categorized by type
    if (response && response.results) {
      // If results is already an array, return it
      if (Array.isArray(response.results)) {
        return response.results;
      }
      
      // Otherwise, collect all results from all categories
      const allResults = [];
      
      // Collect results from each category (plans, nodes, comments, etc.)
      Object.keys(response.results).forEach(category => {
        if (Array.isArray(response.results[category])) {
          // Add category type to each result
          const categoryResults = response.results[category].map(item => ({
            ...item,
            category
          }));
          allResults.push(...categoryResults);
        }
      });
      
      return allResults;
    }
    
    return [];
  } catch (error) {
    console.error('Error in globalSearch wrapper:', error.message);
    return [];
  }
}

// Export the wrapper functions
module.exports = {
  searchPlan,
  globalSearch
};
