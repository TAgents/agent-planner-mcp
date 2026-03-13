# HTTP/SSE Mode Documentation

The planning-tools MCP server supports two transport modes:

1. **stdio** (default) - For local use with Claude Desktop, Claude Code, etc.
2. **http** - For remote access via Anthropic's MCP Connector

This document covers the HTTP/SSE mode for remote deployment and usage.

## Table of Contents

- [Architecture](#architecture)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Integration Examples](#integration-examples)
- [Troubleshooting](#troubleshooting)

## Architecture

### HTTP/SSE Transport

The server implements the **MCP Streamable HTTP** specification (2025-06-18):

- **Single Endpoint**: `/mcp` handles both POST and GET requests
- **POST Requests**: Client-to-server JSON-RPC messages
- **GET Requests**: Server-to-client SSE streams (optional)
- **Session Management**: Tracked via `Mcp-Session-Id` header
- **Protocol Version**: MCP 2025-03-26

### Components

```
┌─────────────────────────────────────────────┐
│  Anthropic Messages API (Claude)            │
│  - MCP Connector Beta                       │
│  - mcp_servers parameter                    │
└──────────────────┬──────────────────────────┘
                   │ HTTP/SSE
                   │
┌──────────────────▼──────────────────────────┐
│  Planning Tools MCP Server                  │
│  - Express HTTP Server (port 8080)          │
│  - Session Manager                          │
│  - 18 Planning Tools                        │
└──────────────────┬──────────────────────────┘
                   │ HTTP + API Token
                   │
┌──────────────────▼──────────────────────────┐
│  Agent Planner API                          │
│  - PostgreSQL Database                      │
│  - Plans, Nodes, Logs, Artifacts            │
└─────────────────────────────────────────────┘
```

## Local Development

### 1. Setup Environment

Create `.env` file:

```bash
# API Connection
API_URL=http://localhost:3000
USER_API_TOKEN=<your-api-token-from-ui>

# HTTP Server Configuration
MCP_TRANSPORT=http
PORT=3100
HOST=127.0.0.1

# Server Metadata
MCP_SERVER_NAME=planning-tools
MCP_SERVER_VERSION=0.3.1
NODE_ENV=development
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start HTTP Server

```bash
# Using npm script
npm run start:http

# Or with environment variable
MCP_TRANSPORT=http npm start

# Development mode with auto-reload
npm run dev:http
```

Server will start on `http://127.0.0.1:3100`

### 4. Verify Server

```bash
# Health check
curl http://127.0.0.1:3100/health

# Expected response:
{
  "status": "ok",
  "version": "2025-03-26",
  "server": {
    "name": "planning-tools",
    "version": "0.3.1"
  },
  "sessions": {
    "total": 0,
    "initialized": 0
  }
}
```

### 5. Run Integration Tests

```bash
node test-http-integration.js
```

This tests:
- Health endpoint
- Session initialization
- Tools listing
- Tool invocation

## Production Deployment

### Deploy to Google Cloud Run

#### Prerequisites

1. **GCP Project**: Set up with billing enabled
2. **gcloud CLI**: Installed and configured
3. **Secrets**: API_URL and USER_API_TOKEN configured in Secret Manager

#### Quick Deploy

```bash
# Set project
export GCP_PROJECT_ID="ta-agent-planner"

# Run deployment script
./deploy.sh
```

The script will:
1. Create Artifact Registry repository (if needed)
2. Check/create required secrets
3. Build Docker image
4. Deploy to Cloud Run (europe-north1)
5. Configure IAM policy for unauthenticated access
6. Display service URL and endpoints

#### Manual Deploy

```bash
# Build and deploy
gcloud builds submit --config cloudbuild.yaml .

# Get service URL
gcloud run services describe planning-tools-mcp \
  --region=europe-north1 \
  --format='value(status.url)'
```

### Environment Configuration

Production environment variables (set in cloudbuild.yaml):

```yaml
--set-env-vars:
  NODE_ENV=production
  MCP_TRANSPORT=http
  MCP_SERVER_NAME=planning-tools
  MCP_SERVER_VERSION=0.3.1

--set-secrets:
  API_URL=AGENT_PLANNER_API_URL:latest
  USER_API_TOKEN=AGENT_PLANNER_API_TOKEN:latest
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT` | `stdio` | Transport mode: `stdio` or `http` |
| `PORT` | `3100` | HTTP server port |
| `HOST` | `127.0.0.1` | HTTP server host |
| `API_URL` | `http://localhost:3000` | Agent Planner API URL |
| `USER_API_TOKEN` | *required* | API token for authentication |
| `MCP_SERVER_NAME` | `planning-tools` | Server identifier |
| `MCP_SERVER_VERSION` | `0.3.1` | Server version |
| `NODE_ENV` | `development` | Environment mode |

### Security Settings

**Origin Validation**: Automatically validates Origin header for localhost:
- `http://localhost`
- `http://127.0.0.1`
- `http://localhost:<port>`

**HTTPS**: Production deployments should use HTTPS (handled by Cloud Run)

**Authentication**:
- MCP endpoint: No authentication required (public)
- Backend API: Requires USER_API_TOKEN (internal)

**IAM Policy** (Cloud Run):
- Configured automatically via `cloudbuild.yaml`
- Allows `allUsers` with `roles/run.invoker` role
- Enables unauthenticated access for MCP Connector

## API Reference

### Endpoints

#### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "version": "2025-03-26",
  "server": {
    "name": "planning-tools",
    "version": "0.3.1"
  },
  "sessions": {
    "total": 2,
    "initialized": 2
  }
}
```

#### `POST /mcp`

Main MCP endpoint for JSON-RPC requests.

**Headers:**
- `Content-Type: application/json`
- `Accept: application/json` or `text/event-stream`
- `MCP-Protocol-Version: 2025-03-26`
- `Mcp-Session-Id: <session-id>` (after initialization)

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [...]
  }
}
```

#### `GET /mcp`

SSE stream for server-to-client messages (optional).

**Headers:**
- `Accept: text/event-stream`
- `Mcp-Session-Id: <session-id>`

#### `DELETE /mcp`

Terminate a session.

**Headers:**
- `Mcp-Session-Id: <session-id>`

**Response:** 204 No Content

### Session Management

Sessions are automatically created during initialization:

1. Client sends `initialize` request (no session ID)
2. Server creates session and returns `Mcp-Session-Id` header
3. Client includes session ID in subsequent requests
4. Sessions expire after 30 minutes of inactivity

### Available Tools

All 18 planning tools are available via HTTP:

**Plan Management:**
- `list_plans` - List all plans
- `create_plan` - Create a new plan
- `update_plan` - Update plan details
- `delete_plan` - Delete a plan

**Node Management:**
- `create_node` - Create plan node (phase/task/milestone)
- `update_node` - Update node properties
- `delete_node` - Delete node and children
- `move_node` - Move node to different parent

**Context & Navigation:**
- `get_node_context` - Get node with children, logs, artifacts
- `get_node_ancestry` - Get path from root to node
- `get_plan_structure` - Get full hierarchical structure

**Activity:**
- `add_log` - Add log entry to node
- `get_logs` - Get node log entries

**Artifacts:**
- `manage_artifact` - Add, get, or search artifacts
- `batch_get_artifacts` - Get multiple artifacts

**Batch Operations:**
- `batch_update_nodes` - Update multiple nodes

**Analytics:**
- `get_plan_summary` - Get statistics and summary

**Search:**
- `search` - Universal search across plans/nodes

## Integration Examples

### Example 1: Direct HTTP Usage

```javascript
const axios = require('axios');

const MCP_URL = 'http://127.0.0.1:3100/mcp';
let sessionId = null;

// Initialize
const initResponse = await axios.post(MCP_URL, {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: { tools: {} }
  }
}, {
  headers: {
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': '2025-03-26'
  }
});

sessionId = initResponse.headers['mcp-session-id'];

// List tools
const toolsResponse = await axios.post(MCP_URL, {
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
  params: {}
}, {
  headers: {
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': '2025-03-26',
    'Mcp-Session-Id': sessionId
  }
});

console.log(toolsResponse.data.result.tools);

// Call a tool
const callResponse = await axios.post(MCP_URL, {
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: {
    name: 'create_plan',
    arguments: {
      title: 'My New Plan',
      description: 'Plan description'
    }
  }
}, {
  headers: {
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': '2025-03-26',
    'Mcp-Session-Id': sessionId
  }
});
```

### Example 2: Anthropic Messages API

```javascript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: {
    'anthropic-beta': 'mcp-client-2025-04-04'
  }
});

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4.5-20250929',
  max_tokens: 4096,
  mcp_servers: [{
    type: 'url',
    url: 'https://planning-tools-mcp-xxxxx-ez.a.run.app/mcp',
    name: 'planning-tools',
    tool_configuration: {
      enabled: true,
      // Optional: limit to specific tools
      allowed_tools: ['create_plan', 'create_node', 'update_node']
    }
  }],
  messages: [{
    role: 'user',
    content: 'Create a development plan for a web application with authentication and user management'
  }]
});

console.log(response.content);
```

### Example 3: With MCPRegistryClient

```javascript
import { MCPRegistryClient } from './agents/base/MCPRegistryClient.js';
import Anthropic from '@anthropic-ai/sdk';

const registryClient = new MCPRegistryClient('http://localhost:8090');
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: {
    'anthropic-beta': 'mcp-client-2025-04-04'
  }
});

// Build MCP config from registry
const mcpServers = await registryClient.buildMCPServersConfig([
  'io.github.talkingagents/planning-tools'
]);

// Use with Claude
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4.5-20250929',
  max_tokens: 4096,
  mcp_servers: mcpServers,
  messages: [{
    role: 'user',
    content: 'Help me plan the migration of a monolithic app to microservices'
  }]
});
```

## Troubleshooting

### Server won't start

**Error**: `EADDRINUSE: address already in use`

**Solution**: Port is already in use. Change port in `.env`:
```bash
PORT=3101  # or any available port
```

### Connection refused

**Error**: `ECONNREFUSED`

**Solution**:
1. Verify server is running: `curl http://localhost:3100/health`
2. Check firewall settings
3. Verify HOST setting (use `0.0.0.0` for external access)

### 401 Unauthorized errors

**Error**: Tool calls return 401

**Solution**:
1. Check `USER_API_TOKEN` in `.env`
2. Generate new token from Agent Planner UI
3. Verify Agent Planner API is accessible

### Session expired

**Error**: `Session not found`

**Solution**: Sessions expire after 30 minutes. Re-initialize:
```javascript
// Send initialize request again to get new session
```

### Tools not returning data

**Issues**: Empty responses or errors

**Debugging**:
```bash
# Check server logs
docker logs <container-id>

# Or for Cloud Run
gcloud run logs read planning-tools-mcp --region=europe-north1

# Test API connection directly
curl -H "Authorization: ApiKey $USER_API_TOKEN" \
  http://localhost:3000/plans
```

## Performance

### Benchmarks

Local development (MacBook Pro M1):
- Initialize: ~50ms
- List tools: ~30ms
- Tool call (list_plans): ~150ms (includes API call)
- Session overhead: ~5ms

Cloud Run (512MB, 1 CPU):
- Cold start: ~2-3s
- Warm request: ~100-200ms
- Concurrent sessions: 100+ (tested)

### Optimization

**Caching**: Not implemented (tools are stateless)

**Connection Pooling**: HTTP keep-alive enabled

**Scaling**: Cloud Run auto-scales 0-10 instances

## Monitoring

### Cloud Run Metrics

View in GCP Console:
- Request count
- Request latency
- Error rate
- Container instances
- CPU/Memory usage

### Custom Logging

Server logs to stderr (captured by Cloud Run):
```
MCP Server listening on 0.0.0.0:8080
POST /mcp - 2025-03-26
Session initialized: 16e3d95e-16ec-41a9-a74a-89f697a94ebf
```

### Health Checks

Monitor `/health` endpoint:
```bash
curl https://planning-tools-mcp-xxxxx-ez.a.run.app/health
```

Set up Cloud Monitoring alerts for:
- Health check failures
- High error rates
- Elevated latency

## Next Steps

1. **Deploy to Production**: Run `./deploy.sh`
2. **Register in MCP Registry**: Follow [MCP_REGISTRY.md](./MCP_REGISTRY.md)
3. **Test with Anthropic**: Use Messages API examples
4. **Monitor Performance**: Set up Cloud Monitoring
5. **Scale as Needed**: Adjust Cloud Run settings

## Resources

- [MCP Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [Anthropic MCP Connector](https://docs.anthropic.com/claude/docs/mcp)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Integration Test Script](./test-http-integration.js)
