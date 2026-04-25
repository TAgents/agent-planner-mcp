---
name: agentplanner
description: "Agent orchestration skill for AgentPlanner — BDI-aligned tools for state, goals, and committed actions with human oversight"
version: 0.9.0
homepage: https://agentplanner.io
metadata:
  openclaw:
    emoji: "📋"
    requires:
      config:
        - mcp-server-connected
---

# AgentPlanner — LLM Skill Reference

You have access to the AgentPlanner MCP tools. AgentPlanner is a collaborative planning system where you track work, manage dependencies, and coordinate with humans. This document is your complete reference.

> **Prerequisite:** This skill requires the `agent-planner-mcp` MCP server (v0.9.0+) to be connected. Create an API token at Settings → API Tokens on [agentplanner.io](https://agentplanner.io).
>
> **Setup by client:**
> - **Claude Desktop:** Download the [.mcpb](https://github.com/TAgents/agent-planner-mcp/releases/latest), double-click to install
> - **Claude Code:** `npx agent-planner-mcp setup`
> - **Cursor / VS Code:** Add `npx agent-planner-mcp` to your MCP config with env vars `API_URL` and `USER_API_TOKEN`
> - **ChatGPT:** HTTP endpoint at `https://agentplanner.io/mcp`

## The 15 tools, organized by intent

AgentPlanner exposes a **BDI-aligned** surface — Beliefs (state queries), Desires (goal management), Intentions (committed actions). Each tool answers one whole agentic question and returns an `as_of` ISO 8601 timestamp.

### Beliefs — what is the state of the world?

- `briefing` — bundled mission control state (goals + decisions + my tasks + activity + recommendation) in one call
- `task_context` — single task at progressive depth 1-4 (task only → +neighborhood → +knowledge → +extended)
- `goal_state` — single goal deep dive (details + quality + progress + bottlenecks + gaps)
- `recall_knowledge` — universal knowledge graph query (facts, entities, recent episodes, contradictions)
- `search` — text search across plans, nodes, content
- `plan_analysis` — advanced reads: impact analysis, critical path, bottlenecks, coherence

### Desires — what are we pursuing?

- `list_goals` — goals with health rollup (`{ on_track, at_risk, stale, total }`)
- `update_goal` — atomic goal update; subsumes link/unlink + achiever changes

### Intentions — what am I committing to?

- `claim_next_task` — pick + claim + load context in one call (cornerstone for coding agents)
- `update_task` — atomic state transition (status + log + claim release + optional learning)
- `release_task` — explicit handoff
- `queue_decision` — escalate to human (writes to real decisions table — do **not** misuse `add_learning` for this)
- `resolve_decision` — pick up after human approval/deferral
- `add_learning` — record a knowledge episode for future recall

### Utility

- `get_started` — dynamic reference; call this if you're new to AgentPlanner

## Canonical workflows

### Mission control loop (Cowork autopilot, scheduled tasks)

```
1. briefing(scope='mission_control')
   → Returns goal_health.summary, pending_decisions[], my_tasks, recent_activity, top_recommendation

2. If top_recommendation: act on it. Otherwise iterate at_risk goals.

3. For each chosen goal:
   - goal_state(goal_id) for the bottleneck details
   - If action is reversible (logging, status update, knowledge write):
       update_task(...) or update_goal(...)
   - If action needs human approval (publish, payment, strategy):
       queue_decision({ title, context, smallest_input_needed, plan_id or node_id })

4. add_learning(content, scope) to record what you did and why.
```

### Single-task coding session (Claude Code, ap CLI)

```
1. claim_next_task(scope={ plan_id }) → returns task with full context
2. update_task(task_id, status='in_progress') when work begins
3. ... do the work ...
4. update_task(task_id, status='completed', log_message='...', add_learning='key insight')
```

The `update_task` call is atomic — status change, log entry, claim release, and knowledge episode all in one round trip.

### Multi-agent server (OpenClaw)

```
1. claim_next_task(scope={ plan_id }, ttl_minutes=30) → exclusive ownership
2. task_context(task_id, depth=4) periodically to refresh as work progresses
3. update_task(...) for state transitions
4. release_task(task_id, message='handoff to teammate') for explicit handoff
```

## Goal coaching

When a user expresses intent — "I want to launch a feature", "we need better testing" — coach them into a structured goal before creating it.

```
1. Ask 2-3 sharp questions to clarify success criteria
2. list_goals to check if a similar goal already exists
3. Use update_goal({ add_linked_plans, add_achievers }) to wire it up

Goal types:
- desire — aspirational, no firm deadline
- intention — promoted from desire when execution begins
```

Promote desire → intention via `update_goal({ promote_to_intention: true })`.

## Decision queueing

When you need human input, **always** use `queue_decision`. Never write decisions as knowledge episodes via `add_learning(entry_type='decision')` — that pattern was a workaround and is no longer needed.

```
queue_decision({
  plan_id: "<plan>",
  node_id: "<task>" (optional),
  title: "Approve npm publish v0.9.0?",
  context: "Build is green, .mcpb tested in Claude Desktop, migration written. Risk: breaking change for any direct users.",
  options: [
    { label: "approve", description: "Publish now" },
    { label: "defer", description: "Wait for QA round" }
  ],
  recommendation: "approve — small user base, MIGRATION_v0.9.md covers the diff",
  smallest_input_needed: "approve|defer",
  urgency: "normal"
})
```

The decision shows up in Cowork briefings, autopilot loops, and the AgentPlanner UI for the human. Resolve via `resolve_decision({ decision_id, action: 'approve'|'defer'|'reject' })`.

## Knowledge: write decisions, recall context

Use `add_learning` to record:
- A decision and its reasoning
- A discovered constraint or pattern
- Important context for future sessions

```
add_learning({
  content: "Switched to Neo4j Community from FalkorDB because SSPL conflicts with our SaaS license model.",
  scope: { plan_id: "<plan>" },
  entry_type: "decision"
})
```

Use `recall_knowledge` before making decisions to check cross-plan history:

```
recall_knowledge({
  query: "knowledge graph backend choice",
  result_kind: "all",
  include_contradictions: true
})
```

`result_kind` options: `'facts'`, `'entities'`, `'episodes'`, `'all'`. Default is `'all'` — narrow it to control payload size.

## Migrating from v0.8.x

v0.9.0 is a breaking release. The old 63-tool surface is gone. See [MIGRATION_v0.9.md](docs/MIGRATION_v0.9.md) for the full mapping. Highlights:

- `check_goals_health` + `get_my_tasks` + `get_recent_episodes` + `check_coherence_pending` → `briefing`
- `quick_status` + `add_log` + `release_task` → `update_task`
- `suggest_next_tasks` + `claim_task` + `get_task_context` → `claim_next_task`
- `add_learning(entry_type='decision')` → `queue_decision` (real decision queue, not knowledge graph)
- `get_goal` + `goal_path` + `goal_progress` + `assess_goal_quality` → `goal_state`
- `recall_knowledge` + `find_entities` + `get_recent_episodes` + `check_contradictions` → `recall_knowledge`

CRUD-shaped admin tools (`create_node`, `update_plan`, `delete_*`) are removed in v0.9.0. They return as `ap_admin_*` namespace in v1.0.0. Use the AgentPlanner REST API directly if you need them now.

## Principles

- Tools are intent-shaped, not CRUD-shaped — name what you want to accomplish, not which row to mutate
- Reads are bundled — minimize round trips, especially for refresh-loops
- Writes are atomic where possible — `update_task` does status + log + release + learning in one call
- `as_of` on every response — use for stale-data warnings on live artifacts
- Decisions are first-class — never fake them via the knowledge graph
- Knowledge persists across plans and sessions — write learnings, recall liberally

Call `get_started` from any AgentPlanner-aware agent for an up-to-date reference.
