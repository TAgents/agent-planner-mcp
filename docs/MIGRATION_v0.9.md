# Migrating to v0.9.0 — BDI Tool Surface

**Breaking release.** v0.9.0 removes the 63-tool legacy surface and ships 15 BDI-aligned tools. No deprecation period — the project is small enough that a clean cut beats a long transition.

If you call AP MCP from Cowork scheduled tasks, Claude Code prompts, custom integrations, or OpenClaw skills, update your tool calls per the mapping below.

## Why

The old surface was CRUD-shaped (create_node, update_node, list_plans). Real callers — agentic loops, autonomous coding agents, multi-agent VMs — think in beliefs (state) / desires (goals) / intentions (committed actions). The new shape mirrors how callers actually use the system. See `MCP_REDESIGN_RESEARCH.md` and `MCP_REDESIGN_PLAN.md`.

## The 15 new tools

**Beliefs** (state queries): `briefing`, `task_context`, `goal_state`, `recall_knowledge`, `search`, `plan_analysis`

**Desires** (goal management): `list_goals`, `update_goal`

**Intentions** (committed actions): `claim_next_task`, `update_task`, `release_task`, `queue_decision`, `resolve_decision`, `add_learning`

**Utility**: `get_started`

Call `get_started` from any agent for the full reference.

## Legacy → BDI mapping

| Legacy tool | New tool | Notes |
|---|---|---|
| `check_goals_health` | `briefing` | Plus pending decisions, my tasks, recent activity in one call |
| `get_my_tasks` | `briefing` (`my_tasks` field) | |
| `get_recent_episodes` | `briefing` (`recent_activity`) or `recall_knowledge(result_kind='episodes')` | |
| `check_coherence_pending` | `briefing` (`coherence_pending`) | |
| `get_task_context` | `task_context` | Same args |
| `get_node_dependencies` | `task_context(depth=2)` | Bundled in |
| `get_node_ancestry` | `task_context(depth=4)` | Bundled in |
| `get_goal` | `goal_state` | |
| `goal_path` | `goal_state` (`bottlenecks` derived from path) | |
| `goal_progress` | `goal_state` (`progress`) | |
| `goal_knowledge_gaps` | `goal_state` (`knowledge_gaps`) | |
| `assess_goal_quality` | `goal_state` (`quality`) | |
| `recall_knowledge` (legacy) | `recall_knowledge(result_kind='facts')` | Same query |
| `find_entities` | `recall_knowledge(result_kind='entities')` | |
| `check_contradictions` | `recall_knowledge(include_contradictions=true)` | |
| `search` (legacy) | `search` | Same shape |
| `analyze_impact` | `plan_analysis(type='impact')` | |
| `get_critical_path` | `plan_analysis(type='critical_path')` | |
| `run_coherence_check` | `plan_analysis(type='coherence')` | |
| `list_goals` (legacy) | `list_goals` | Now includes aggregate health counts |
| `update_goal` (legacy) | `update_goal` | Atomic — subsumes link/unlink/achiever |
| `link_plan_to_goal` | `update_goal({add_linked_plans: [...]})` | |
| `unlink_plan_from_goal` | `update_goal({remove_linked_plans: [...]})` | |
| `add_achiever` | `update_goal({add_achievers: [...]})` | |
| `remove_achiever` | `update_goal({remove_achievers: [...]})` | |
| `claim_task` + `suggest_next_tasks` + `get_task_context` | `claim_next_task` | One call, bundled |
| `quick_status` + `add_log` + `release_task` | `update_task` | Atomic |
| `release_task` (legacy) | `release_task` | Same |
| `add_log` | `update_task(log_message=..., log_type=...)` | |
| `add_learning` (legacy) | `add_learning` | Same shape |
| `add_learning(entry_type='decision')` workaround | `queue_decision` | **Real decision queue.** Stop using add_learning for decisions. |
| `get_started` | `get_started` | Updated for BDI surface |

## Tools removed (no replacement in v0.9.0)

These are admin-shaped and meant for humans editing structure manually. They are scheduled to return as `ap_admin_*` namespace in v1.0.0. If you need them now, call the AgentPlanner REST API directly:

`quick_plan`, `quick_task`, `quick_log`, `create_plan`, `update_plan`, `delete_plan`, `share_plan`, `import_plan_markdown`, `export_plan_markdown`, `create_node`, `update_node`, `delete_node`, `move_node`, `batch_update_nodes`, `create_dependency`, `delete_dependency`, `list_dependencies`, `create_rpi_chain`, `create_cross_plan_dependency`, `list_cross_plan_dependencies`, `create_external_dependency`, `create_organization`, `update_organization`, `list_organizations`, `get_organization`, `create_goal`, `list_plans`, `get_plan_structure`, `get_plan_summary`, `get_plan_context`, `get_logs`.

Most agentic workflows don't need these. If you're tempted to call `create_node` from an agent loop, the question to ask is "should I be calling `update_task` or `claim_next_task` instead?"

## Cowork scheduled task migration

### Mission control autopilot (before)
```
1. Call mcp__AgentPlanner__check_goals_health
2. Pick at_risk goal with highest direct_downstream_count
3. To queue: create knowledge episode via add_learning with entry_type=decision and title prefix "DECISION NEEDED:"
4. mcp__AgentPlanner__quick_log on relevant task
```

### Mission control autopilot (v0.9.0)
```
1. Call mcp__AgentPlanner__briefing — returns goal_health, pending_decisions, my_tasks, recent_activity, top_recommendation
2. Use top_recommendation directly, or pick from goal_health.goals where health=at_risk
3. To queue: queue_decision({title, context, smallest_input_needed, plan_id or node_id})
4. update_task(task_id, status, log_message, log_type) — atomic
```

### Morning briefing (before)
4 separate calls: `check_goals_health` + `get_recent_episodes` + `get_my_tasks` + `list_goals`

### Morning briefing (v0.9.0)
1 call: `briefing(scope='mission_control', recent_window_hours=24)`

The widget renders from a single response. Cowork artifact refresh becomes 1 round trip.

## Install

`.mcpb` (Claude Desktop): https://github.com/TAgents/agent-planner-mcp/releases/latest

`npx`:
```json
{
  "mcpServers": {
    "agentplanner": {
      "command": "npx",
      "args": ["-y", "agent-planner-mcp@0.9.0"],
      "env": { "API_URL": "https://agentplanner.io/api", "USER_API_TOKEN": "..." }
    }
  }
}
```
