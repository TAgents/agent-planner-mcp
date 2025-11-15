#!/usr/bin/env node

/**
 * CLI Entry Point for agent-planner-mcp
 * Routes to different commands or starts the MCP server
 */

const path = require('path');

const args = process.argv.slice(2);
const command = args[0];

// Route to different commands
switch (command) {
  case 'setup-claude-code':
    // Run the setup-claude-code script
    const setupClaudeCode = require('./setup-claude-code.js');
    setupClaudeCode.main();
    break;

  case 'setup':
    // Run the interactive setup wizard
    require('./setup.js');
    break;

  case '--help':
  case '-h':
  case 'help':
    console.log(`
Agent Planner MCP - Model Context Protocol Server

Usage:
  npx agent-planner-mcp                    Start MCP server (requires USER_API_TOKEN)
  npx agent-planner-mcp setup-claude-code  Install orchestration commands to .claude/
  npx agent-planner-mcp setup              Interactive setup wizard
  npx agent-planner-mcp --help             Show this help message

Environment Variables:
  API_URL          - Agent Planner API URL (default: http://localhost:3000)
  USER_API_TOKEN   - API token from Agent Planner UI (required for server)
  MCP_SERVER_NAME  - Server name (default: planning-system-mcp)
  NODE_ENV         - Environment (development/production)

Documentation:
  https://github.com/talkingagents/agent-planner-mcp
`);
    break;

  case '--version':
  case '-v':
    const pkg = require('../package.json');
    console.log(`agent-planner-mcp v${pkg.version}`);
    break;

  default:
    // No command or unknown command - start MCP server
    if (command && !command.startsWith('-')) {
      console.error(`Unknown command: ${command}`);
      console.error('Run "npx agent-planner-mcp --help" for usage information.');
      process.exit(1);
    }
    // Start the MCP server
    require('./index.js');
}
