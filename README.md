# Planning System MCP Server

A Model Context Protocol (MCP) server interface for the Planning System API, enabling AI agents to interact with planning data through powerful, efficient tools.

## Overview

This MCP server connects to the Planning System API, providing AI agents with comprehensive planning capabilities through a clean, structured interface. All interactions use JSON responses for easy parsing and processing.

## ✨ Key Features

### Core Capabilities
- **Full CRUD Operations**: Create, read, update, and delete plans, nodes, and artifacts
- **Unified Search**: Single powerful search tool for all contexts (global, plans, nodes)
- **Batch Operations**: Update multiple nodes or retrieve multiple artifacts efficiently
- **Rich Context**: Get comprehensive node context including ancestry, children, logs, and artifacts
- **Structured Responses**: Clean JSON data for easy agent processing

### Available Tools

#### Planning & Search
- `search` - Universal search across all scopes with filters
- `create_plan` - Create new plans
- `update_plan` - Update plan properties
- `delete_plan` - Delete entire plans
- `get_plan_structure` - Get hierarchical plan structure
- `get_plan_summary` - Get comprehensive statistics and summary

#### Node Management
- `create_node` - Create phases, tasks, or milestones
- `update_node` - Update any node properties
- `delete_node` - Delete nodes and their children
- `move_node` - Reorder or reparent nodes
- `get_node_context` - Get rich contextual information
- `get_node_ancestry` - Get path from root to node
- `batch_update_nodes` - Update multiple nodes at once

#### Collaboration & Tracking
- `add_log` - Add log entries (including comments, progress, reasoning, etc.)
- `get_logs` - Retrieve filtered log entries
- `manage_artifact` - Add, get, search, or list artifacts
- `batch_get_artifacts` - Retrieve multiple artifacts efficiently

## Getting Started

### Prerequisites

- Node.js 16+
- npm or yarn
- Access to a running Planning System API
- API token for authentication

### Quick Setup (Recommended)

1. Install dependencies
```bash
npm install
```

2. Run the automated setup wizard
```bash
npm run setup
```

The wizard will:
- Check API server connectivity
- Guide you through creating an API token in the UI
- Create your `.env` file
- Detect and update your Claude Desktop config
- Test the connection

That's it! Restart Claude Desktop and you're ready to go.

### Manual Installation (Advanced)

If you prefer manual setup or the wizard doesn't work for your setup:

1. Clone the repository
```bash
git clone https://github.com/talkingagents/agent-planner-mcp.git
cd agent-planner-mcp
```

2. Install dependencies
```bash
npm install
```

3. Create an API token:
   - Open http://localhost:3001/app/settings in your browser
   - Navigate to "API Tokens" section
   - Click "Create MCP Token"
   - Copy the generated token

4. Create `.env` file:
```bash
cp .env.example .env
```

Edit the `.env` file:
```
API_URL=http://localhost:3000
USER_API_TOKEN=your_api_token_here
MCP_SERVER_NAME=planning-system
MCP_SERVER_VERSION=0.2.0
NODE_ENV=production
```

5. Configure Claude Desktop manually (see "Using with Claude Desktop" section below)

6. Start the server
```bash
npm start
```

## Transport Modes

The Planning System MCP Server supports two transport modes:

### 🖥️ stdio Mode (Default)
For **local use** with Claude Desktop, Claude Code, and other local MCP clients:
- Default transport when running `npm start`
- Communication via stdin/stdout
- Best for development and personal use
- See sections below for Claude Desktop configuration

### 🌐 HTTP/SSE Mode
For **remote access** via Anthropic's MCP Connector and cloud deployments:
- Implements MCP Streamable HTTP specification (2025-06-18)
- RESTful JSON-RPC API over HTTP
- Production-ready for Cloud Run deployment
- Supports session management and concurrent connections
- **Documentation**: See [HTTP_MODE.md](./HTTP_MODE.md)
- **Deployment**: See [MCP_REGISTRY.md](./MCP_REGISTRY.md)

**Quick Start (HTTP Mode):**
```bash
# Local development
npm run start:http
# Server runs on http://127.0.0.1:3100

# Production deployment
./deploy.sh
# Deploys to Google Cloud Run (europe-north1)
```

**Use Cases:**
- ✅ **Anthropic Messages API**: Use with Claude via MCP Connector
- ✅ **Multi-Agent Systems**: agent-runtime integration
- ✅ **Cloud Deployment**: Scalable, always-available service
- ✅ **MCP Registry**: Discoverable via registry lookup

For detailed HTTP mode documentation, see [HTTP_MODE.md](./HTTP_MODE.md).

## Using with Claude Desktop

### Option 1: Using npx (Recommended - Simplest Setup)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "planning-system": {
      "command": "npx",
      "args": [
        "-y",
        "agent-planner-mcp"
      ],
      "env": {
        "API_URL": "https://api.agentplanner.io",
        "USER_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

**Benefits:**
- No need to clone the repository
- Always uses the latest published version
- Simplest configuration

**For local development**, use `http://localhost:3000` instead:
```json
"API_URL": "http://localhost:3000"
```

### Option 2: Using Local Installation

If you prefer to run from a local clone:

```json
{
  "mcpServers": {
    "planning-system": {
      "command": "node",
      "args": [
        "/path/to/agent-planner-mcp/src/index.js"
      ],
      "env": {
        "API_URL": "https://api.agentplanner.io",
        "USER_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

Then restart Claude Desktop to load the planning tools.

## Example Usage

### Search Examples

```javascript
// Global search
search({ 
  scope: "global", 
  query: "API integration",
  filters: { type: "task", status: "in_progress" }
})

// Search within a specific plan
search({ 
  scope: "plan", 
  scope_id: "plan-123",
  query: "testing"
})
```

### Plan Management

```javascript
// Create a plan with initial structure
create_plan({ 
  title: "Product Launch Q1 2025",
  description: "Complete product launch plan",
  status: "active"
})

// Add nodes to the plan
create_node({
  plan_id: "plan-123",
  node_type: "phase",
  title: "Market Research",
  description: "Initial market analysis and competitor research"
})
```

### Batch Operations

```javascript
// Update multiple nodes efficiently
batch_update_nodes({
  plan_id: "plan-123",
  updates: [
    { node_id: "node-1", status: "completed" },
    { node_id: "node-2", status: "in_progress" },
    { node_id: "node-3", description: "Updated requirements" }
  ]
})

// Get multiple artifacts at once
batch_get_artifacts({
  plan_id: "plan-123",
  artifact_requests: [
    { node_id: "node-1", artifact_id: "art-1" },
    { node_id: "node-2", artifact_id: "art-2" }
  ]
})
```

### Rich Context

```javascript
// Get comprehensive node information
get_node_context({
  plan_id: "plan-123",
  node_id: "node-456"
})
// Returns: node details, children, logs, artifacts, plan info

// Track node ancestry
get_node_ancestry({
  plan_id: "plan-123",
  node_id: "node-456"
})
// Returns: path from root to node
```

## Project Structure

```
src/
├── index.js              # Main entry point
├── tools.js              # Tool implementations
├── api-client.js         # API client with axios
└── tools/
    └── search-wrapper.js # Search functionality wrapper
```

## Development

### Running in Development Mode

```bash
npm run dev  # Auto-restart on changes
```

### Environment Variables

- `API_URL` - Planning System API URL
- `USER_API_TOKEN` - Authentication token
- `MCP_SERVER_NAME` - Server name (default: planning-system-mcp)
- `MCP_SERVER_VERSION` - Server version (default: 0.2.0)
- `NODE_ENV` - Environment (development/production)

### Testing Tools

```javascript
// Test search functionality
search({ scope: "global", query: "test" })

// Test node operations
create_node({ plan_id: "...", node_type: "task", title: "Test" })
update_node({ plan_id: "...", node_id: "...", status: "completed" })
delete_node({ plan_id: "...", node_id: "..." })

// Test batch operations
batch_update_nodes({ plan_id: "...", updates: [...] })
```

## Troubleshooting

### Common Issues

- **Connection errors**: Ensure the Planning System API is running
- **Authentication errors**: Verify your USER_API_TOKEN is valid
- **Tool errors**: Check error messages in console output

### Debug Mode

Enable verbose logging:
```bash
NODE_ENV=development npm start
```

## Performance Tips

1. Use batch operations when updating multiple items
2. Use appropriate search scopes to minimize API calls
3. Cache plan structures when making multiple operations
4. Apply filters to limit result sets

## License

MIT License - see LICENSE file for details.

## Support

- Report bugs via GitHub Issues
- See [PDR.md](./PDR.md) for technical design details
- Check [CHANGELOG.md](./CHANGELOG.md) for version history
