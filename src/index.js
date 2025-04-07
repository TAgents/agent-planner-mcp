const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { setupResources } = require('./resources');
const { setupTools } = require('./tools');
const { setupPrompts } = require('./prompts');
require('dotenv').config();

/**
 * Initialize the MCP server
 */
async function main() {
  console.error('Initializing Planning System MCP Server...');
  
  try {
    // Log environment settings
    console.error(`API URL: ${process.env.API_URL || 'http://localhost:3000'}`);
    
    // Check for both old and new token environment variables
    const userApiToken = process.env.USER_API_TOKEN || process.env.API_TOKEN;
    console.error(`User API Token: ${userApiToken ? '***' + userApiToken.slice(-4) : 'NOT SET'}`);
    console.error(`MCP Server Name: ${process.env.MCP_SERVER_NAME || 'planning-system-mcp'}`);
    console.error(`MCP Server Version: ${process.env.MCP_SERVER_VERSION || '0.1.0'}`);
    
    // Validate required environment variables
  if (!userApiToken) {
    throw new Error('USER_API_TOKEN environment variable is required. Please generate one from the Agent Planner UI and set it in .env file.');
  }
    
    // Create MCP server instance
    const server = new Server({
      name: process.env.MCP_SERVER_NAME || "planning-system-mcp",
      version: process.env.MCP_SERVER_VERSION || "0.1.0"
    }, {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {}
      }
    });

    console.error('MCP Server created');
    
    // Setup resources, tools, and prompts
    setupResources(server);
    setupTools(server);
    setupPrompts(server);
    
    // Connect transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('MCP Server running on stdio transport');
  } catch (error) {
    console.error('Failed to initialize MCP server:', error);
    process.exit(1);
  }
}

// Run the server
main();
