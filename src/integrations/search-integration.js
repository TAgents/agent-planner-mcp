/**
 * Search integration for the MCP system
 * 
 * This module integrates the search wrapper with the MCP system,
 * providing functions that can be called from other parts of the application.
 */
const { searchPlan, globalSearch } = require('../tools/search-wrapper');

/**
 * Perform a search within a plan and process the results
 * 
 * @param {string} planId - ID of the plan to search
 * @param {string} query - Search query
 * @param {Function} [processResult] - Optional callback for each result
 * @returns {Promise<Array>} - Array of processed search results
 */
async function searchPlanAndProcess(planId, query, processResult = null) {
  try {
    console.log(`Searching plan ${planId} for: "${query}"`);
    
    // Get results using the wrapper
    const results = await searchPlan(planId, query);
    
    // If a process function is provided, map over the results
    if (typeof processResult === 'function') {
      return results.map(processResult);
    }
    
    return results;
  } catch (error) {
    console.error('Error in searchPlanAndProcess:', error.message);
    return [];
  }
}

/**
 * Search for content within a plan and extract relevant information
 * 
 * @param {string} planId - ID of the plan to search
 * @param {string} query - Search query
 * @returns {Promise<Object>} - Organized search results
 */
async function findContentInPlan(planId, query) {
  try {
    const results = await searchPlan(planId, query);
    
    // Organize results by type
    const organizedResults = {
      nodes: results.filter(r => r.type === 'node'),
      comments: results.filter(r => r.type === 'comment'),
      logs: results.filter(r => r.type === 'log'),
      other: results.filter(r => !['node', 'comment', 'log'].includes(r.type))
    };
    
    // Add summary information
    return {
      query,
      planId,
      resultCount: results.length,
      typeBreakdown: {
        nodes: organizedResults.nodes.length,
        comments: organizedResults.comments.length,
        logs: organizedResults.logs.length,
        other: organizedResults.other.length
      },
      results: organizedResults
    };
  } catch (error) {
    console.error('Error in findContentInPlan:', error.message);
    return {
      query,
      planId,
      resultCount: 0,
      typeBreakdown: { nodes: 0, comments: 0, logs: 0, other: 0 },
      results: { nodes: [], comments: [], logs: [], other: [] }
    };
  }
}

module.exports = {
  searchPlanAndProcess,
  findContentInPlan,
  // Also export the original wrapper functions
  searchPlan,
  globalSearch
};
