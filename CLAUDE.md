# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The repository root (`../CLAUDE.md`) describes the broader Talking Agents monorepo. This file is the MCP-server-specific guide.

## What this is

`agent-planner-mcp` is the **Model Context Protocol server** for AgentPlanner, plus a thin local CLI (`agent-planner-mcp <command>`) for task-driven workflows. Node.js + `@modelcontextprotocol/sdk` + Express + axios. License MIT (more permissive than the backend/UI). Published to npm; also packaged as a `.mcpb` bundle for one-click Claude Desktop install.

**Agent-facing documentation lives in `SKILL.md` (complete reference for LLMs) and `AGENT_GUIDE.md` (quick reference).** Keep these in sync when tool shapes change.

## Commands

```bash
npm start                       # stdio transport (for Claude Desktop / Code / Cursor)
npm run start:http              # HTTP/SSE transport on PORT (default 3100)
npm run dev                     # nodemon stdio
npm run dev:http                # nodemon HTTP
npm test                        # Jest
npm run validate:mcp-loop       # __tests__/agent-loop-facade.test.js (--runInBand)
node test-tools.js              # ad-hoc tool exerciser
npm run setup                   # interactive wizard (Claude Desktop)
npm run setup-claude-code       # interactive wizard (Claude Code)

# .mcpb bundle (Claude Desktop one-click install)
npm run build:mcpb              # install --omit=dev + pack → agent-planner.mcpb
npm run validate:mcpb           # schema-check manifest.json
```

### Local CLI (thin client, not MCP)

```bash
npx agent-planner-mcp login --token <t> --api-url <url> [--plan-id <id>]
npx agent-planner-mcp tasks [--plan-id <id>]
npx agent-planner-mcp next [--plan-id <id>] [--fresh]
npx agent-planner-mcp context --plan-id <id> --node-id <id>
# … plus explicit writeback commands. README.md has the full loop.
```

Mental model: the AP API is the source of truth; `.agentplanner/` files are a regeneratable cache the agent reads. Status changes are explicit writebacks — **no live sync**.

## Architecture

### Dual transport

- **stdio** (`src/index.js`) — for Claude Desktop, Claude Code, Cursor, Windsurf, Cline. Default.
- **HTTP/SSE** (`src/server-http.js`) — for remote/container deployment behind nginx. Selected by `MCP_TRANSPORT=http`. Session lifecycle in `src/session-manager.js`.

Both transports register the **same tool set** from `src/tools.js`. Adding a tool should not require touching either transport file — only `tools.js` and (if it's a complex flow) `src/tools/`.

### Tool categories — what they map to in the API

- **Structure** — plans, nodes, organizations, goals
- **Dependencies** — create/analyze/traverse/suggest
- **Context** — progressive depth (4 layers), RPI chain assembly
- **Knowledge** — `add_learning`, `recall_knowledge`, `find_entities`, `check_contradictions`, `get_recent_episodes`. All flow through the backend's `graphitiBridge`; the old `add_knowledge_entry`/`search_knowledge` tools have been removed.
- **Agent operations** — `claim_task`, `release_task`, `check_goals_health`
- **Helpers** — `get_started` (entry point an agent hits to bootstrap)

`src/tools/bdi/` holds the goal-state / intention / decision tools (Belief-Desire-Intention vocabulary). `src/tools/search-wrapper.js` and `src/search-plan-wrapper.js` are call-site facades.

### API client (`src/api-client.js`)

Thin axios wrapper around the AgentPlanner REST API. Authenticates with a user API token (`USER_API_TOKEN`) using `Authorization: ApiKey <token>`. Hosted API URL is `https://agentplanner.io/api` (nginx prefix); local is `http://localhost:3000`. All API calls flow through here — don't sprinkle axios elsewhere.

### Local CLI (`src/cli.js`, `src/cli/`)

`src/cli.js` is the npm `bin`. `src/cli/config.js` reads/writes `~/.agentplanner/` (token + default plan). `src/cli/local-client.js` writes the `.agentplanner/` cache in the agent's working directory. This is intentionally **separate from the MCP server** — agents that don't speak MCP can still drive AP via this CLI loop.

### MCPB bundle (`manifest.json`)

The Desktop Extension format. `npm run build:mcpb` installs production deps and packs the folder. **`.mcpbignore` is a global filter (gitignore semantics) — generic names like `dist` or `build` will strip files from inside `node_modules` and break SDK imports. Anchor patterns with `/dist`, `/build`.** (Saved in user memory; this paragraph is the cheat-sheet.)

Validate the manifest with `npm run validate:mcpb` before shipping. `agent-planner.mcpb` is the built artifact (committed for release convenience).

## Environment

| Var | Purpose |
|---|---|
| `API_URL` | AgentPlanner REST base — `https://agentplanner.io/api` (hosted) or `http://localhost:3000` (local) |
| `USER_API_TOKEN` | API token from AP Settings → API Tokens |
| `MCP_TRANSPORT` | `stdio` (default) or `http` |
| `PORT` | HTTP transport port (default 3100) |

## Patterns that bite if missed

- **Tool descriptions are part of the contract.** LLMs select tools based on their `description`. When editing a tool, edit the description and `SKILL.md` / `AGENT_GUIDE.md` together.
- **Errors must be agent-readable.** Throw structured errors with actionable `message` text — the agent reads them as a tool result. Don't swallow with generic `"failed"`.
- **Backward compat for hosted clients.** `npx agent-planner-mcp` is what hosted MCP clients spawn. Don't break the CLI entry point or the published env-var names.
- **License differs from the rest of the monorepo.** This package is **MIT** (because it's the agent SDK). Backend and UI are BUSL-1.1. Don't paste BUSL headers in here.
