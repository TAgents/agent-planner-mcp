# AgentPlanner MCP Server

[![npm](https://img.shields.io/npm/v/agent-planner-mcp)](https://www.npmjs.com/package/agent-planner-mcp)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

MCP server for [AgentPlanner](https://agentplanner.io) — AI agent orchestration with planning, dependencies, knowledge graphs, and human oversight. Works with Claude Desktop, Claude Code, ChatGPT, Cursor, Windsurf, Cline, and any MCP-compatible client.

## Prerequisites

- An AgentPlanner account at [agentplanner.io](https://agentplanner.io)
- An API token (Settings > API Tokens in the AgentPlanner UI)

## Setup

### Claude Desktop — one-click install (`.mcpb`)

The fastest path. Download `agent-planner.mcpb` from the [latest release](https://github.com/TAgents/agent-planner-mcp/releases), double-click it, and Claude Desktop will install the extension and prompt for your AgentPlanner API token. No Node.js setup, no JSON editing.

To build the bundle yourself:

```bash
npm run build:mcpb        # produces agent-planner.mcpb
npm run validate:mcpb     # schema-check manifest.json
```

### Manual config (Claude Desktop, Claude Code, Cursor, etc.)

Add to your MCP client config (`claude_desktop_config.json`, `.cursor/mcp.json`, etc.):

```json
{
  "mcpServers": {
    "agentplanner": {
      "command": "npx",
      "args": ["-y", "agent-planner-mcp"],
      "env": {
        "API_URL": "https://agentplanner.io/api",
        "USER_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Thin local client (v1)

A lightweight CLI loop for task-driven workflows. No MCP client required — useful when an agent (Claude Code, OpenClaw, a script) just needs to read its current task as files and write status back.

### Mental model

- AgentPlanner (the API) is the source of truth.
- `.agentplanner/` files are a regeneratable cache, written by the CLI for the agent to read.
- The agent works in the real repo. Status changes flow back via explicit writeback commands. There is no live sync.

> **Running locally?** See [agent-planner/LOCAL_QUICKSTART.md](https://github.com/TAgents/agent-planner/blob/main/LOCAL_QUICKSTART.md) for the 5-minute path to a full local stack you can point this CLI at. Use `--api-url http://localhost:3000` in the `login` step below.

### The loop

```bash
# 1. Login — saves credentials and auto-selects a default plan
#    (pass --plan-id to pick one, or it auto-selects if you have exactly one plan)
npx agent-planner-mcp login --token <token> --api-url https://agentplanner.io/api [--plan-id <id>]
#    Localhost variant (after `docker compose -f docker-compose.local.yml up`):
npx agent-planner-mcp login --token <token> --api-url http://localhost:3000

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

## Agent Loop Facade

AgentPlanner API now exposes a narrow `/agent/*` facade for the main autonomous loop. MCP uses this facade when available and falls back to older domain endpoints for self-hosted older APIs.

Primary mappings:

| MCP tool | Preferred API endpoint |
|---|---|
| `briefing` | `GET /agent/briefing` |
| `claim_next_task` | `POST /agent/work-sessions` |
| `update_task` with `session_id` + `completed` | `POST /agent/work-sessions/:id/complete` |
| `update_task` with `session_id` + `blocked` | `POST /agent/work-sessions/:id/block` |
| `form_intention` | `POST /agent/intentions` when available, with domain-endpoint fallback |

Validation:

```bash
npm run validate:mcp-loop
```

This checks that the MCP tools route through the facade for briefing, task claim/start, and session completion/blocking.


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

- **24 BDI-aligned tools** for state, goals, and committed actions — no CRUD shapes, every tool answers a whole agentic question
- **Full mutation surface (v1.0)** — agents and humans-via-agents can manage every plan/node/org property without leaving the conversation; UI is optional inspection
- **Draft-status seam** — autonomous agent creation lands as drafts surfacing in the dashboard pending queue; human-directed creation defaults to active
- **Dependency graph** — cycle detection, impact analysis, critical path
- **Progressive context** — 4-layer context assembly with token budgeting
- **Knowledge graph** — temporal knowledge via Graphiti (entities, facts, contradictions)
- **RPI chains** — Research → Plan → Implement task decomposition (one-call shortcut)
- **Task claims** — TTL-based locking for multi-agent coordination
- **Organizations** — multi-tenant isolation with member management

## Available Tools (v1.0.0)

### Beliefs (read state)
- `briefing` — bundled mission control state in one call
- `task_context` — single task at progressive depth 1-4
- `goal_state` — single goal deep-dive (details + quality + progress + bottlenecks + gaps)
- `recall_knowledge` — knowledge graph query (facts, entities, episodes, contradictions)
- `search` — text search across plans/nodes
- `plan_analysis` — impact, critical path, bottlenecks, coherence

### Desires (goals)
- `list_goals` — goals with health rollup
- `update_goal` — atomic goal update (subsumes link/unlink/achievers)
- `derive_subgoal` *(v1.0)* — propose a sub-goal under an existing parent

### Intentions — execution
- `claim_next_task` — pick + claim + load context (one call)
- `update_task` — atomic status + log + claim release + learning
- `release_task` — explicit handoff
- `queue_decision` — escalate to human (real decision queue)
- `resolve_decision` — pick up human's answer (atomically materializes any `proposed_subtasks`)
- `add_learning` — record knowledge episode

### Intentions — creation *(v1.0)*
- `form_intention` — create plan + initial tree under a goal, atomically
- `extend_intention` — add children under an existing parent (lightweight)
- `propose_research_chain` — RPI triple with 2 blocking edges, in one call

### Intentions — structural mutation *(v1.0)*
- `update_plan` — edit any plan property
- `update_node` — edit any node property except status
- `move_node` — reparent within plan; cycle-safe
- `link_intentions` / `unlink_intentions` — manage dependency edges
- `delete_plan` / `delete_node` — soft-delete via `status='archived'` (recoverable)

### Intentions — sharing & collaboration *(v1.0)*
- `share_plan` — atomic visibility + add/remove collaborators
- `invite_member` — add user to org (by user_id or email)
- `update_member_role` — owner-only role change
- `remove_member` — owner/admin removes non-owner member

### Utility
- `get_started` — dynamic reference for new agents

See [SKILL.md](./SKILL.md) for full descriptions, the human-steering scenarios (A/B/C), and `status='draft'` vs `status='active'` guidance.

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
