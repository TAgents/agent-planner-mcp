#!/usr/bin/env node
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { MCPHTTPServer } = require('./server-http');
const { setupTools } = require('./tools');
require('dotenv').config();

/**
 * Initialize the Planning System MCP Server
 *
 * Supports two transport modes:
 * - stdio: For local use with Claude Desktop, Claude Code, etc.
 * - http: For remote access via Anthropic's MCP Connector
 *
 * Set MCP_TRANSPORT=http to use HTTP mode
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
  const transport = process.env.MCP_TRANSPORT || 'stdio';

  if (isDev) {
    console.error('Initializing Planning System MCP Server...');
    console.error(`Transport mode: ${transport}`);
  }

  try {
    // Log environment settings
    console.error(`API URL: ${process.env.API_URL || 'http://localhost:3000'}`);

    // Check for token
    const userApiToken = process.env.USER_API_TOKEN || process.env.API_TOKEN;
    console.error(`User API Token: ${userApiToken ? '***' + userApiToken.slice(-4) : 'NOT SET'}`);
    console.error(`MCP Server Name: ${process.env.MCP_SERVER_NAME || 'planning-system-mcp'}`);
    console.error(`MCP Server Version: ${process.env.MCP_SERVER_VERSION || '0.3.1'}`);

    // Validate required environment variables
    if (!userApiToken) {
      throw new Error('USER_API_TOKEN environment variable is required. Please generate one from the Agent Planner UI and set it in .env file.');
    }

    if (transport === 'http') {
      // HTTP/SSE transport mode
      const httpServer = new MCPHTTPServer({
        port: process.env.PORT || 3100,
        host: process.env.HOST || '127.0.0.1'
      });

      await httpServer.start();

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.error('\nShutting down MCP HTTP Server...');
        await httpServer.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.error('\nShutting down MCP HTTP Server...');
        await httpServer.stop();
        process.exit(0);
      });
    } else {
      // Stdio transport mode (default)
      const server = new Server({
        name: process.env.MCP_SERVER_NAME || "planning-system-mcp",
        version: process.env.MCP_SERVER_VERSION || "0.3.1"
      }, {
        capabilities: {
          tools: {}
        }
      });

      console.error('MCP Server created');

      // Setup tools
      setupTools(server);

      // Connect transport
      const stdioTransport = new StdioServerTransport();
      await server.connect(stdioTransport);

      console.error('MCP Server running on stdio transport');
      console.error('Ready to accept connections from agents');
    }
  } catch (error) {
    console.error('Failed to initialize MCP server:', error);
    process.exit(1);
  }
}

// Run the server
main();
