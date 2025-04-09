/**
 * Wrapper module for the search_plan functionality
 * 
 * This wrapper extracts the results array from the API response format
 * which is an object with { query, results, count } structure
 */
const apiClient = require('./api-client');

/**
 * Search a plan and return the results array directly
 * @param {string} planId - The ID of the plan to search
 * @param {string} query - The search query
 * @returns {Promise<Array>} - Array of search results
 */
async function searchPlan(planId, query) {
  try {
    // Call the API through the client
    const response = await apiClient.search.searchPlan(planId, query);
    
    // Extract just the results array
    if (response && response.results && Array.isArray(response.results)) {
      return response.results;
    } else {
      console.error('Unexpected search response format:', response);
      return [];
    }
  } catch (error) {
    console.error('Error in search_plan wrapper:', error.message);
    return [];
  }
}

module.exports = { searchPlan };
