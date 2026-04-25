# AgentPlanner MCP Server

[![npm](https://img.shields.io/npm/v/agent-planner-mcp)](https://www.npmjs.com/package/agent-planner-mcp)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

MCP server for [AgentPlanner](https://agentplanner.io) — AI agent orchestration with planning, dependencies, knowledge graphs, and human oversight. Works with Claude Desktop, Claude Code, ChatGPT, Cursor, Windsurf, Cline, and any MCP-compatible client.

## Prerequisites

- An AgentPlanner account at [agentplanner.io](https://agentplanner.io)
- An API token (Settings > API Tokens in the AgentPlanner UI)

## Setup

## Thin local client (v1)

A lightweight CLI loop for task-driven workflows. No MCP client required — useful when an agent (Claude Code, OpenClaw, a script) just needs to read its current task as files and write status back.

### Mental model

- AgentPlanner (the API) is the source of truth.
- `.agentplanner/` files are a regeneratable cache, written by the CLI for the agent to read.
- The agent works in the real repo. Status changes flow back via explicit writeback commands. There is no live sync.

### The loop

```bash
# 1. Login — saves credentials and auto-selects a default plan
#    (pass --plan-id to pick one, or it auto-selects if you have exactly one plan)
npx agent-planner-mcp login --token <token> --api-url https://agentplanner.io/api [--plan-id <id>]

# 2. See your task queue
npx agent-planner-mcp tasks [--plan-id <id>]

# 3. Pick the next task and pull context (claims it for 30 minutes)
npx agent-planner-mcp next [--plan-id <id>]
#    Force a fresh recommendation even if you have active work:
npx agent-planner-mcp next --fresh

# 4. Or pull context for a specific plan/node (no claim, no status change)
npx agent-planner-mcp context --plan-id <plan-id> --node-id <node-id>
#    If a default plan is set, --plan-id can be omitted:
npx agent-planner-mcp context --node-id <node-id>

# 5. Explicit writeback. No live sync.
npx agent-planner-mcp start                          # claim + mark in_progress
npx agent-planner-mcp blocked --message "Waiting on API decision"
npx agent-planner-mcp done    --message "Implemented and verified"
```

### `next` resolution order

`next` is a smart picker. It resolves in this order:

1. **Resume** — if any task in scope is `in_progress`, pick it. (Source: `resume_in_progress`.)
2. **Recommend** — call `suggest_next_tasks` (dependency- and RPI-aware) for a fresh pick. (Source: `suggest_next_tasks`.)
3. **Fallback** — first `not_started` task in your queue. (Source: `my_tasks_fallback`.)

`tasks` is the queue view; `next` is the smart picker; `next --fresh` skips step 1 and forces a fresh recommendation even when active work exists.

### What `start`, `blocked`, `done` actually do

| Command | Status | Claim | Log entry | Learning written to Graphiti |
|---|---|---|---|---|
| `start` | `in_progress` | claim (30m TTL) | — | — |
| `blocked --message ...` | `blocked` | release | `challenge` | — |
| `done --message ...` | `completed` | release | `progress` | yes (entry_type: `learning`) |

All hooks are best-effort: claim/release/learning failures do not block the status update. Claim collisions (another agent already holds the lease) are reported but not fatal.

### What `current-task.md` surfaces

Beyond title, description, agent_instructions, and acceptance criteria, the generated `current-task.md` includes BDI signals from the API responses already being fetched:

- **Plan health** — `quality_score`, rationale, `coherence_checked_at` (or "never")
- **Coherence warning** — flagged when `node.coherence_status` is `contradiction_detected` or `stale_beliefs`, with concrete next-step pointers (`check_contradictions`, `recall_knowledge`)
- **Detected contradictions** — listed when present in the node context
- **Task mode** — shown when not `free` (RPI awareness for `research`/`plan`/`implement`)
- **Linked goals**, **relevant knowledge** (top 5), **plan progress snapshot**

### When to use CLI vs MCP vs API skill

| You want… | Use |
|---|---|
| Zero-setup local task context for any coding agent (Claude Code, OpenClaw, scripts) | **CLI** (this thin client) |
| Rich, structured tool access from inside an MCP-aware agent (Claude Desktop, Cursor, etc.) | **MCP** (run `npx agent-planner-mcp` as an MCP server) |
| Direct programmatic integration from your own service | **API** (REST endpoints; same routes the MCP and CLI use) |

The CLI is intentionally thin: it covers the read context + writeback loop and nothing else. For decomposition, dependency creation, knowledge graph queries, RPI chains, coherence runs, and goal management, use the MCP server (or the API directly).


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
