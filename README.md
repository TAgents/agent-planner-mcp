# AgentPlanner MCP Server

[![npm](https://img.shields.io/npm/v/agent-planner-mcp)](https://www.npmjs.com/package/agent-planner-mcp)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

MCP server for [AgentPlanner](https://agentplanner.io) — AI agent orchestration with planning, dependencies, knowledge graphs, and human oversight. Works with Claude Desktop, Claude Code, ChatGPT, Cursor, Windsurf, Cline, and any MCP-compatible client.

## Prerequisites

- An AgentPlanner account at [agentplanner.io](https://agentplanner.io)
- An API token (Settings > API Tokens in the AgentPlanner UI)

## Setup

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agent-planner": {
      "command": "npx",
      "args": ["-y", "agent-planner-mcp"],
      "env": {
        "USER_API_TOKEN": "your-token",
        "API_URL": "https://agentplanner.io/api"
      }
    }
  }
}
```

Config location: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) | `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

### Claude Code

```bash
claude mcp add agent-planner -- npx -y agent-planner-mcp
```

Then set the env vars `USER_API_TOKEN` and `API_URL=https://agentplanner.io/api`.

### ChatGPT

1. Settings > Apps > Advanced > Developer mode
2. Add MCP Server > URL: `https://agentplanner.io/mcp`
3. Auth type: API Key > enter your token from agentplanner.io Settings

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "agent-planner": {
      "command": "npx",
      "args": ["-y", "agent-planner-mcp"],
      "env": {
        "USER_API_TOKEN": "your-token",
        "API_URL": "https://agentplanner.io/api"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "agent-planner": {
      "command": "npx",
      "args": ["-y", "agent-planner-mcp"],
      "env": {
        "USER_API_TOKEN": "your-token",
        "API_URL": "https://agentplanner.io/api"
      }
    }
  }
}
```

### Cline (VS Code)

Add the same JSON config to your Cline MCP settings in VS Code.

### Any HTTP MCP Client

- Endpoint: `https://agentplanner.io/mcp`
- Discovery: `https://agentplanner.io/.well-known/mcp.json`
- Auth header: `Authorization: ApiKey <your-token>`
- Transport: Streamable HTTP (MCP 2025-03-26)

## Key Features

- **60+ tools** for planning, task management, dependencies, and knowledge
- **Dependency graph** with cycle detection, impact analysis, and critical path
- **Progressive context** — 4-layer context assembly with token budgeting
- **Knowledge graph** — temporal knowledge via Graphiti (entities, facts, contradictions)
- **RPI chains** — Research > Plan > Implement task decomposition
- **Goal tracking** — health dashboard, briefings, bottleneck detection
- **Task claims** — TTL-based locking for multi-agent coordination
- **Organizations** — multi-tenant isolation

## Available Tools

### Planning & Search
- `search` - Universal search across all scopes with filters
- `create_plan` / `update_plan` / `delete_plan` - Plan CRUD
- `get_plan_structure` - Hierarchical plan tree
- `get_plan_summary` - Statistics and summary

### Node Management
- `create_node` / `update_node` / `delete_node` - Node CRUD
- `move_node` - Reorder or reparent nodes
- `batch_update_nodes` - Update multiple nodes at once
- `get_node_context` / `get_node_ancestry` - Rich context

### Dependencies & Analysis
- `create_dependency` / `delete_dependency` - Manage edges
- `list_dependencies` / `get_node_dependencies` - Query graph
- `analyze_impact` - Delay/block/remove scenario analysis
- `get_critical_path` - Longest blocking chain
- `create_rpi_chain` - Research > Plan > Implement chain

### Progressive Context
- `get_task_context` - Primary context tool (depth 1-4, token budget)
- `suggest_next_tasks` - Dependency-aware suggestions
- `get_agent_context` / `get_plan_context` - Focused views

### Knowledge Graph
- `add_learning` / `recall_knowledge` - Learn and retrieve
- `find_entities` / `check_contradictions` - Graph queries
- `get_recent_episodes` - Temporal episodes

### Goals & Organizations
- `create_goal` / `update_goal` / `list_goals` / `get_goal` - Goal management
- `check_goals_health` - Health dashboard
- `create_organization` / `get_organization` / `list_organizations` / `update_organization`

### Collaboration
- `add_log` / `get_logs` - Log entries (comments, progress, reasoning)
- `claim_task` / `release_task` - Task locking
- `share_plan` - Collaboration management

### Alignment & Review
- `check_coherence_pending` - See which plans/goals need alignment review (staleness check)
- `run_coherence_check` - Evaluate plan quality and stamp as reviewed

## LLM Skill Reference

See **[SKILL.md](./SKILL.md)** for a complete reference designed to be consumed by LLMs. Include it in system prompts or agent configurations to give any LLM full knowledge of how to use AgentPlanner tools effectively.

See **[AGENT_GUIDE.md](./AGENT_GUIDE.md)** for a quick reference card.

## Transport Modes

### stdio (default)
For local use with Claude Desktop, Claude Code, Cursor, Windsurf, Cline:
```bash
npx agent-planner-mcp
```

### HTTP/SSE
For remote access (ChatGPT, cloud deployments, multi-agent systems):
```bash
MCP_TRANSPORT=http npx agent-planner-mcp
# Listens on http://127.0.0.1:3100
```

Production endpoint: `https://agentplanner.io/mcp`

See [HTTP_MODE.md](./HTTP_MODE.md) for details.

## Local Development

```bash
git clone https://github.com/TAgents/agent-planner-mcp.git
cd agent-planner-mcp
npm install
npm run setup    # Interactive setup wizard
npm run dev      # Dev server with hot reload
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_URL` | AgentPlanner API URL | `http://localhost:3000` |
| `USER_API_TOKEN` | API token (required) | — |
| `MCP_TRANSPORT` | `stdio` or `http` | `stdio` |
| `PORT` | HTTP mode port | `3100` |
| `NODE_ENV` | Environment | `production` |

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Support

- [GitHub Issues](https://github.com/TAgents/agent-planner-mcp/issues)
- [CHANGELOG.md](./CHANGELOG.md) for version history
- [PDR.md](./PDR.md) for technical design
