# MCP Registry Registration Guide

This guide explains how to register the planning-tools MCP server in the MCP Registry for discovery and use with Anthropic's MCP Connector.

## Overview

Once registered, the planning-tools server will be discoverable as:
- **Server Name**: `io.github.talkingagents/planning-tools`
- **Namespace**: `io.github.talkingagents`
- **Short Name**: `planning-tools`

## Prerequisites

1. **Deployed Server**: Planning-tools MCP server running on Cloud Run
2. **MCP Registry**: Access to MCP Registry (local or production)
3. **GitHub OAuth** (optional): For production registry authentication

## Option 1: Local MCP Registry (Development)

### Start Local Registry

```bash
cd agent-planner-devops/mcp-registry
docker-compose up -d
```

Verify it's running:
```bash
curl http://localhost:8090/v0/health
# Expected: {"status":"ok","github_client_id":"..."}
```

### Register the Server

**Method A: Using the Registry API**

```bash
# Get your deployed server URL
PLANNING_TOOLS_URL="https://planning-tools-mcp-xxxxx-ez.a.run.app"

# Register the server
curl -X POST http://localhost:8090/v0/servers \
  -H "Content-Type: application/json" \
  -d '{
    "namespace": "io.github.talkingagents",
    "name": "planning-tools",
    "description": "MCP server for planning and task management with hierarchical project structure",
    "version": "0.3.1",
    "homepage": "https://agentplanner.io",
    "repository": {
      "type": "git",
      "url": "https://github.com/TAgents/agent-planner-mcp"
    },
    "remotes": [{
      "url": "'"$PLANNING_TOOLS_URL"'/mcp",
      "transport": "http"
    }],
    "capabilities": {
      "tools": [
        "search",
        "list_plans",
        "create_plan",
        "update_plan",
        "delete_plan",
        "create_node",
        "update_node",
        "delete_node",
        "move_node",
        "get_node_context",
        "get_node_ancestry",
        "add_log",
        "get_logs",
        "manage_artifact",
        "batch_update_nodes",
        "batch_get_artifacts",
        "get_plan_structure",
        "get_plan_summary"
      ]
    },
    "auth": {
      "type": "none"
    },
    "metadata": {
      "category": "productivity",
      "tags": ["planning", "project-management", "task-tracking", "collaboration"],
      "license": "MIT"
    }
  }'
```

**Method B: Using a Registration Script**

Create `register-server.sh`:

```bash
#!/bin/bash
set -e

REGISTRY_URL="${MCP_REGISTRY_URL:-http://localhost:8090}"
SERVER_URL="${PLANNING_TOOLS_URL:?Environment variable PLANNING_TOOLS_URL is required}"

echo "Registering planning-tools server..."
echo "Registry: $REGISTRY_URL"
echo "Server URL: $SERVER_URL"

curl -X POST "$REGISTRY_URL/v0/servers" \
  -H "Content-Type: application/json" \
  -d '{
    "namespace": "io.github.talkingagents",
    "name": "planning-tools",
    "description": "MCP server for planning and task management",
    "version": "0.3.1",
    "remotes": [{"url": "'"$SERVER_URL"'/mcp", "transport": "http"}],
    "capabilities": {
      "tools": ["search", "list_plans", "create_plan", "update_plan", "delete_plan", "create_node", "update_node", "delete_node", "move_node", "get_node_context", "get_node_ancestry", "add_log", "get_logs", "manage_artifact", "batch_update_nodes", "batch_get_artifacts", "get_plan_structure", "get_plan_summary"]
    },
    "auth": {"type": "none"}
  }' | jq '.'

echo "✅ Server registered successfully!"
```

Usage:
```bash
export PLANNING_TOOLS_URL="https://planning-tools-mcp-xxxxx-ez.a.run.app"
chmod +x register-server.sh
./register-server.sh
```

### Verify Registration

```bash
# List all servers
curl http://localhost:8090/v0/servers | jq '.servers[] | select(.name=="planning-tools")'

# Get specific server
curl http://localhost:8090/v0/servers/io.github.talkingagents/planning-tools | jq '.'
```

## Option 2: Production MCP Registry

For production registration (when available):

1. **Authenticate with GitHub OAuth**:
   - Navigate to the registry UI
   - Authenticate with your GitHub account
   - Authorize the registry application

2. **Submit Server Registration**:
   - Use the registry web interface
   - Or use the API with authentication token

3. **OAuth Configuration** (if required):
   - Configure OAuth for your server
   - Set token in environment: `MCP_TOKEN_IO_GITHUB_TALKINGAGENTS_PLANNING_TOOLS`

## Using the Registered Server

### With MCPRegistryClient (agent-runtime)

```javascript
import { MCPRegistryClient } from './agents/base/MCPRegistryClient.js';

const registryClient = new MCPRegistryClient('http://localhost:8090');

// Discover the server
const server = await registryClient.getServer('io.github.talkingagents/planning-tools');
console.log(server);
// {
//   name: 'io.github.talkingagents/planning-tools',
//   namespace: 'io.github.talkingagents',
//   shortName: 'planning-tools',
//   remotes: [{ url: 'https://...', transport: 'http' }],
//   tools: ['search', 'create_plan', ...]
// }

// Build MCP config for Anthropic
const mcpServers = await registryClient.buildMCPServersConfig([
  'io.github.talkingagents/planning-tools'
]);

// Use with Anthropic Messages API
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4.5-20250929',
  max_tokens: 4096,
  mcp_servers: mcpServers,
  messages: [{ role: 'user', content: 'Create a development plan' }]
});
```

### Direct Configuration (Without Registry)

If you want to use the server without registry lookup:

```javascript
const mcpServers = [{
  type: 'url',
  url: 'https://planning-tools-mcp-xxxxx-ez.a.run.app/mcp',
  name: 'planning-tools',
  tool_configuration: {
    enabled: true,
    allowed_tools: ['create_plan', 'create_node', 'update_node']  // optional
  }
}];
```

## Server Metadata

The planning-tools server provides:

**Capabilities:**
- **tools**: 18 planning and task management tools
- **transport**: HTTP/SSE (Streamable HTTP)
- **protocol**: MCP 2025-03-26

**Tools Categories:**
- **Plan Management**: list_plans, create_plan, update_plan, delete_plan
- **Node Management**: create_node, update_node, delete_node, move_node
- **Context & Navigation**: get_node_context, get_node_ancestry, get_plan_structure
- **Activity Tracking**: add_log, get_logs
- **Artifacts**: manage_artifact, batch_get_artifacts
- **Batch Operations**: batch_update_nodes
- **Analytics**: get_plan_summary
- **Search**: Universal search across plans and nodes

**Authentication:**
- Public endpoint (no authentication required for MCP protocol)
- Backend API requires API token (handled internally by server)

## Updating Registration

To update server metadata:

```bash
curl -X PUT http://localhost:8090/v0/servers/io.github.talkingagents/planning-tools \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description",
    "version": "0.3.2",
    "remotes": [{"url": "https://new-url.run.app/mcp", "transport": "http"}]
  }'
```

## Deregistering

To remove the server from registry:

```bash
curl -X DELETE http://localhost:8090/v0/servers/io.github.talkingagents/planning-tools
```

## Troubleshooting

### Server not appearing in registry

1. **Check registration**:
   ```bash
   curl http://localhost:8090/v0/servers | jq '.servers[] | .name'
   ```

2. **Verify registry is running**:
   ```bash
   curl http://localhost:8090/v0/health
   ```

3. **Check server accessibility**:
   ```bash
   curl https://your-server.run.app/health
   ```

### MCPRegistryClient can't find server

1. **Verify server name format**: Must be `namespace/name`
2. **Check registry URL**: Default is `http://localhost:8090`
3. **Clear cache**: `registryClient.clearCache()`

### Tools not working

1. **Check API token**: Server needs valid `USER_API_TOKEN` to access agent-planner API
2. **Verify backend API**: Ensure agent-planner API is accessible
3. **Check logs**: `gcloud run logs read planning-tools-mcp --region=europe-north1`

## Environment Variables

For the deployed server:

```bash
# Required (set as Cloud Run secrets)
API_URL=https://agent-planner-api-xxxxx-ez.a.run.app
USER_API_TOKEN=<api-token-from-agent-planner>

# Server configuration
MCP_TRANSPORT=http
MCP_SERVER_NAME=planning-tools
MCP_SERVER_VERSION=0.3.1
NODE_ENV=production
```

## Next Steps

After registration:

1. **Test Discovery**: Use MCPRegistryClient to discover the server
2. **Integration Testing**: Test with Anthropic Messages API
3. **Documentation**: Update agent-runtime examples
4. **Monitoring**: Set up Cloud Run monitoring and alerts

## Resources

- [MCP Specification](https://modelcontextprotocol.io/specification)
- [Anthropic MCP Connector](https://docs.anthropic.com/claude/docs/mcp)
- [Agent Planner API Docs](https://agentplanner.io/api-docs)
- [MCPRegistryClient Documentation](../agent-runtime/docs/MCP_REGISTRY_CLIENT.md)
