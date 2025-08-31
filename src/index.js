const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { setupTools } = require('./tools');
require('dotenv').config();

/**
 * Initialize the Planning System MCP Server
 * 
 * Features:
 * - Simplified architecture with tools-only interface
 * - Full CRUD operations on all entities
 * - Unified search across all scopes
 * - Batch operations for efficiency
 * - Structured JSON responses
 * - Comprehensive logging system
 */
async function main() {
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    console.error('Initializing Planning System MCP Server...');
  }
  
  try {
    // Log environment settings
    console.error(`API URL: ${process.env.API_URL || 'http://localhost:3000'}`);
    
    // Check for token
    const userApiToken = process.env.USER_API_TOKEN || process.env.API_TOKEN;
    console.error(`User API Token: ${userApiToken ? '***' + userApiToken.slice(-4) : 'NOT SET'}`);
    console.error(`MCP Server Name: ${process.env.MCP_SERVER_NAME || 'planning-system-mcp'}`);
    console.error(`MCP Server Version: ${process.env.MCP_SERVER_VERSION || '0.2.0'}`);
    
    // Validate required environment variables
    if (!userApiToken) {
      throw new Error('USER_API_TOKEN environment variable is required. Please generate one from the Agent Planner UI and set it in .env file.');
    }
    
    // Create MCP server instance
    const server = new Server({
      name: process.env.MCP_SERVER_NAME || "planning-system-mcp",
      version: process.env.MCP_SERVER_VERSION || "0.2.0"
    }, {
      capabilities: {
        tools: {}
      }
    });

    console.error('MCP Server created');
    
    // Setup tools
    setupTools(server);
    
    // Connect transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('MCP Server running on stdio transport');
    console.error('Ready to accept connections from agents');
  } catch (error) {
    console.error('Failed to initialize MCP server:', error);
    process.exit(1);
  }
}

// Run the server
main();
