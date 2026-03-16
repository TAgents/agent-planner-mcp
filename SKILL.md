---
name: agentplanner
description: "Agent orchestration skill for AgentPlanner — plan, execute, and track work with dependency management, knowledge graphs, and human oversight"
version: 1.0.0
homepage: https://agentplanner.io
metadata:
  openclaw:
    emoji: "📋"
    requires:
      config:
        - mcp-server-connected
---

# AgentPlanner — LLM Skill Reference

You have access to the AgentPlanner MCP tools. AgentPlanner is a collaborative planning system where you track work, manage dependencies, and coordinate with humans. This document is your complete reference for using it effectively.

> **Prerequisite:** This skill requires the `agent-planner-mcp` MCP server to be connected. You need an AgentPlanner account and an API token (create one at Settings → API Tokens on [agentplanner.io](https://agentplanner.io)).
>
> **Setup by client:**
> - **Claude Code:** `npx agent-planner-mcp setup` (interactive — writes to `.mcp.json`)
> - **Claude Desktop:** Add the MCP server in Settings → Developer → MCP Servers
> - **Cursor / VS Code:** Add to your MCP config with `npx agent-planner-mcp` as the command
> - **ChatGPT:** Use the HTTP endpoint at `https://agentplanner.io/mcp` with your API token
> - **Other MCP clients:** Run `npx agent-planner-mcp` in stdio mode with env vars `API_URL` and `USER_API_TOKEN`

## When to Use AgentPlanner

- You are given a plan ID or task ID to work on
- You need to break down complex work into trackable steps
- You need to coordinate with humans on multi-step projects
- You want to persist findings, decisions, or progress across sessions
- You are asked to plan, research, or implement something as part of a tracked workflow

## Workflow

Follow this sequence when working on a plan:

```
1. ORIENT    → suggest_next_tasks or get_task_context to understand what needs doing
2. CLAIM     → quick_status to mark the task in_progress
3. WORK      → Do the actual work (code, research, analysis, etc.)
4. LOG       → quick_log or add_log to record what you did and found
               ↳ For important findings, also use add_learning to persist to the temporal knowledge graph
5. COMPLETE  → quick_status to mark completed (auto-unblocks downstream tasks)
6. NEXT      → suggest_next_tasks to find the next ready task
```

## Loading Context

Always load context before starting work. Use `get_task_context` — it gives you exactly the right amount of information based on depth level.

```
get_task_context({ node_id: "<task_id>", depth: 2 })
```

Depth levels:
- **1** — Task only: node details + recent logs. Use when you already know the plan well.
- **2** — Neighborhood: adds parent, siblings, direct dependencies (upstream/downstream). **Default and recommended.**
- **3** — Knowledge: adds Graphiti temporal knowledge (entities, facts). Use when the task requires domain context.
- **4** — Extended: adds plan overview, ancestry path, linked goals, transitive dependencies. Use for first-time orientation or cross-cutting tasks.

If your context window is limited, set `token_budget` to cap the response size:
```
get_task_context({ node_id: "<task_id>", depth: 3, token_budget: 4000 })
```

## Finding What to Work On

```
suggest_next_tasks({ plan_id: "<plan_id>" })
```

Returns tasks that are **ready** — all upstream dependencies are completed. Sorted by priority:
1. RPI research tasks (start of a chain)
2. Tasks that unblock the most downstream work
3. Tasks by order index

Each suggestion includes a `reason` field explaining why it's recommended.

## Tool Reference

### Quick Actions (Low Friction)

| Tool | Use When |
|------|----------|
| `quick_plan` | Creating a new plan from a title + task list (provide goal_id to auto-link) |
| `quick_task` | Adding a single task to an existing plan |
| `quick_status` | Updating a task's status (the most common operation) |
| `quick_log` | Logging progress on a task |

### Plans

| Tool | Purpose |
|------|---------|
| `list_plans` | See all accessible plans |
| `create_plan` | Create a plan with full options |
| `update_plan` | Change plan title, description, visibility |
| `delete_plan` | Delete a plan |
| `get_plan_structure` | Get hierarchical tree (minimal fields — fast) |
| `get_plan_summary` | Statistics and overview |
| `share_plan` | Share a plan with another user |

### Nodes (Tasks, Phases, Milestones)

| Tool | Purpose |
|------|---------|
| `create_node` | Create a task, phase, or milestone |
| `update_node` | Change title, description, status, task_mode, etc. |
| `delete_node` | Delete a node and its children |
| `move_node` | Reparent or reorder a node |
| `batch_update_nodes` | Update multiple nodes at once |
| `get_node_ancestry` | Path from root to node |

When creating nodes:
- `node_type`: `phase` (group of tasks), `task` (unit of work), `milestone` (checkpoint)
- `task_mode`: `free` (default), `research`, `plan`, `implement` (for RPI chains)
- `status`: `not_started`, `in_progress`, `completed`, `blocked`, `plan_ready`

### Dependencies

| Tool | Purpose |
|------|---------|
| `create_dependency` | Create a directed edge between two nodes |
| `delete_dependency` | Remove a dependency edge |
| `list_dependencies` | List all edges in a plan |
| `get_node_dependencies` | Get upstream/downstream/both for a node |
| `analyze_impact` | What happens if a node is delayed/blocked/removed |
| `get_critical_path` | Longest blocking chain through incomplete tasks |

Dependency types:
- `blocks` — Source must complete before target can start (hard constraint)
- `requires` — Target needs output from source (softer)
- `relates_to` — Informational link, no execution constraint

Example — "Design API" blocks "Implement API":
```
create_dependency({
  plan_id: "...",
  source_node_id: "<design_api_id>",
  target_node_id: "<implement_api_id>",
  dependency_type: "blocks"
})
```

Cycle detection is automatic — you cannot create a dependency that would form a cycle.

### Context & Analysis

| Tool | Purpose |
|------|---------|
| `get_task_context` | **Primary.** Progressive context at depth 1-4 with token budgeting |
| `get_plan_context` | Plan overview with phase summaries and knowledge |
| `suggest_next_tasks` | Find ready tasks based on dependency analysis |

### Logging

| Tool | Purpose |
|------|---------|
| `add_log` | Add a structured log entry to a node |
| `get_logs` | Retrieve log entries for a node |

Log types and when to use them:
- `progress` — Status updates, milestones reached
- `reasoning` — Analysis, findings, thought process (high value for downstream tasks)
- `decision` — Choices made and why (highest value — persists through compaction)
- `challenge` — Obstacles encountered, workarounds found
- `comment` — General notes

For research and plan tasks, use `reasoning` and `decision` log types — these are preserved when research output is compacted for downstream implement tasks.

### Goals

| Tool | Purpose |
|------|---------|
| `check_goals_health` | Dashboard of all goals with health status, bottlenecks, and gaps |
| `list_goals` | See all goals |
| `create_goal` | Create a goal |
| `update_goal` | Update goal details |
| `get_goal` | Get goal with linked plans |
| `link_plan_to_goal` | Connect a plan to a goal |
| `unlink_plan_from_goal` | Disconnect a plan from a goal |
| `goal_path` | Full dependency path to a goal — all tasks that contribute (direct achievers + upstream blockers) |
| `goal_progress` | Completion percentage calculated from the goal's dependency graph |
| `goal_knowledge_gaps` | Detect tasks on the goal path that lack knowledge — identifies where research is needed |
| `add_achiever` | Link a task to a goal via an "achieves" edge (declares this task contributes to the goal) |
| `remove_achiever` | Remove an achieves edge between a task and a goal |

Goal-task linking creates a dependency graph from tasks up to goals. Use `add_achiever` to declare which tasks contribute to a goal, then `goal_path` and `goal_progress` to track completion through the full dependency chain. `goal_knowledge_gaps` checks which tasks on the path lack relevant knowledge in the temporal graph — useful for identifying where research is needed before implementation.

### Cross-Plan Dependencies

| Tool | Purpose |
|------|---------|
| `create_cross_plan_dependency` | Create a dependency edge between nodes in different plans |
| `list_cross_plan_dependencies` | List all edges that cross plan boundaries between specified plans |
| `create_external_dependency` | Create an external blocker (vendor API, legal approval, etc.) that optionally blocks a task |

Cross-plan dependencies work the same as regular dependencies (`blocks`, `requires`, `relates_to`) but connect nodes across plans. External dependencies represent blockers outside the system.

### Task Claiming

| Tool | Purpose |
|------|---------|
| `claim_task` | Claim exclusive ownership of a task (prevents agent collisions) |
| `release_task` | Release a previously claimed task |

### Knowledge (Temporal Knowledge Graph)

All knowledge is stored in the Graphiti temporal knowledge graph, which automatically extracts entities and relationships and enables cross-plan knowledge retrieval. The temporal graph is **cross-plan** and **persists across sessions** — anything recorded is available to all future agents and conversations within the organization.

| Tool | Purpose |
|------|---------|
| `add_learning` | Record knowledge to the temporal graph with automatic entity extraction |
| `recall_knowledge` | Search the temporal knowledge graph across ALL plans in the org |
| `find_entities` | Search for entities (technologies, people, patterns, etc.) |
| `check_contradictions` | Check if knowledge about a topic has changed; returns current and superseded (outdated) facts |
| `get_recent_episodes` | Get recent knowledge episodes from the temporal graph (work session history) |

`add_learning` params:
- `content` (required) — The knowledge to record
- `title` — Short title for the entry
- `entry_type` — `decision`, `learning`, `context`, or `constraint`
- `plan_id` — Associate with a specific plan
- `node_id` — Associate with a specific node

`recall_knowledge` params:
- `query` (required) — Natural language search query
- `max_results` — Number of results (default 10)

`find_entities` params:
- `query` (required) — Entity name or description to search for
- `max_results` — Number of results (default 10)

`check_contradictions` params:
- `query` (required) — Topic to check for contradictions
- `max_results` — Number of results (default 10)

Use `check_contradictions` before making decisions based on past knowledge. It returns two sets of facts: **current** (valid) and **superseded** (outdated). If superseded facts exist, review them — the situation may have changed since you last encountered this topic.

`get_recent_episodes` params:
- `max_episodes` — Maximum episodes to return (default 20)

Use `get_recent_episodes` to review what has been learned recently across all plans. Useful for session start-up (understanding recent activity) or auditing what knowledge has been captured.

### Organizations

| Tool | Purpose |
|------|---------|
| `list_organizations` | List your organizations |
| `get_organization` | Organization details |
| `create_organization` | Create an org |
| `update_organization` | Update org details |

### Orientation

| Tool | Purpose |
|------|---------|
| `get_started` | Guidance on how to use AgentPlanner — call when new or unsure how to approach a task |

`get_started` accepts an optional `topic`: `overview`, `planning`, `execution`, `knowledge`, or `collaboration`.

To understand a plan before starting, use `get_plan_context({ plan_id })` for the overview, then `get_task_context({ node_id, depth: 4 })` for deep context on a specific task.

### Other

| Tool | Purpose |
|------|---------|
| `search` | Global search across plans and nodes |
| `get_my_tasks` | Tasks assigned to you across all plans |
| `import_plan_markdown` | Create a plan from markdown |
| `export_plan_markdown` | Export a plan as markdown |

## RPI Chains (Research → Plan → Implement)

For complex tasks that need investigation before implementation, decompose into an RPI chain:

```
create_rpi_chain({
  plan_id: "<plan_id>",
  parent_id: "<phase_id>",
  title: "Auth Service",
  research_description: "Research auth patterns for microservices"
})
```

This creates 3 tasks with blocking dependencies wired automatically:

```
Research (task_mode=research)
  │ Investigate the problem. Log findings as reasoning/decision entries.
  │ Mark completed when done → research output is auto-compacted.
  ▼
Plan (task_mode=plan)
  │ Gets compacted research automatically.
  │ Design the solution. Mark plan_ready for human review.
  ▼ Human approves → mark completed.
Implement (task_mode=implement)
  │ Gets compacted research + plan context automatically.
  │ Build the solution.
  ▼ Mark completed when done.
```

When to use RPI vs. a single task:
- **Single task**: Simple, well-understood work. You know how to do it.
- **RPI chain**: Complex or novel work. Needs investigation. Multiple approaches possible. Risk of rework.

## Status Values

| Status | Meaning | When to Set |
|--------|---------|-------------|
| `not_started` | No work begun | Default. Also set automatically when all blockers complete. |
| `in_progress` | Actively being worked on | When you start working on a task. |
| `completed` | Done and verified | When the work is finished. Triggers auto-unblock of downstream tasks. |
| `blocked` | Cannot proceed | When waiting on a dependency, decision, or external input. Always log the reason. |
| `plan_ready` | Awaiting human review | When a plan/research task is done and needs human approval before the next step. |

## Patterns

### Starting a New Session
```
1. get_my_tasks({}) → see what's in progress or blocked across all plans
2. get_recent_episodes({ max_episodes: 10 }) → review recent knowledge across all plans
3. If resuming a task: get_task_context({ node_id: "...", depth: 2 })
4. If orienting on a plan: get_plan_context({ plan_id: "..." })
5. If starting fresh: suggest_next_tasks({ plan_id: "..." })
```

### Breaking Down a Large Task
```
1. Identify the task is too complex for one pass
2. create_rpi_chain to decompose it
3. Start with the Research task
4. Log findings as reasoning/decision entries
5. Let the chain guide you through plan → implement
```

### Handling Blockers
```
1. quick_status({ task_id: "...", status: "blocked" })
2. add_log({ node_id: "...", content: "Blocked on: <reason>", log_type: "challenge" })
3. suggest_next_tasks({ plan_id: "..." }) → find another task to work on
```

### After Research or Investigation
```
1. Log findings to the task: add_log({ node_id: "...", content: "...", log_type: "reasoning" })
2. Persist important findings to the temporal knowledge graph:
   add_learning({ content: "Found that X works best because Y", title: "...", entry_type: "learning", plan_id: "..." })
3. This makes the knowledge discoverable across ALL plans and future sessions via recall_knowledge
4. Always use add_learning for findings you'd want to remember next session — the temporal graph is cross-plan and persistent
```

### Before Making an Important Decision
```
1. recall_knowledge({ query: "relevant topic" }) → check temporal graph for cross-plan knowledge
2. check_contradictions({ query: "relevant topic" }) → verify nothing has been superseded since you last checked
3. Make the decision (using current, non-superseded facts)
4. add_log({ node_id: "...", content: "Decision: <what and why>", log_type: "decision" })
5. add_learning({ content: "Decision: <what and why>", title: "...", entry_type: "decision", plan_id: "..." })
```

### Understanding Plan Structure
```
1. get_plan_structure({ plan_id: "..." }) → hierarchical tree (minimal, fast)
2. get_plan_summary({ plan_id: "..." }) → statistics and phase progress
3. get_task_context({ node_id: "...", depth: 4 }) → deep context for a specific task
```

### Impact Analysis Before Changes
```
1. analyze_impact({ plan_id: "...", node_id: "...", scenario: "block" })
   → See which tasks would be affected if this task is blocked
2. get_critical_path({ plan_id: "..." })
   → See the longest dependency chain (what determines overall completion time)
```

## Autonomous Goal-Driven Loop

For agents that run periodically (e.g., via cron or event triggers), this is the recommended execution pattern:

### Phase 1: Orient
```
check_goals_health()
```
Identify which goals are stale, at risk, or need attention. Prioritize goals by health status: stale first, then at_risk, then on_track.

### Phase 2: Plan
For each goal needing attention:
```
get_goal({goal_id})           # Understand the objective
recall_knowledge({query})     # What do we already know?
quick_plan({title, tasks, goal_id})  # Create/update plan linked to goal
```

### Phase 3: Decompose
For complex tasks, use RPI chains:
```
create_rpi_chain({plan_id, parent_id, topic})  # Research → Plan → Implement
```

### Phase 4: Execute
```
suggest_next_tasks({plan_id})     # What's unblocked?
claim_task({task_id, plan_id})    # Claim exclusive ownership
get_task_context({node_id, depth: 3})  # Load context
# ... do the work ...
quick_log({task_id, plan_id, message})  # Document progress
add_learning({content, plan_id})  # Capture knowledge
quick_status({task_id, plan_id, status: "completed"})  # Triggers propagation
```

### Phase 5: Report
```
quick_log({task_id, plan_id, message: "Summary of work done", log_type: "completion"})
```

### Key Principles
- **Always claim before working** — prevents collisions with other agents
- **Always link plans to goals** — enables health tracking and progress reporting
- **Log decisions and learnings** — future agents and humans need your reasoning
- **Check for contradictions** — `check_contradictions()` before acting on old knowledge
- **Let propagation work** — completing blockers auto-unblocks downstream tasks

## Rules

1. **Always load context before working** — never guess what a task requires.
2. **Log as you work** — not just at the end. Frequent logs help humans and future agents.
3. **Use `decision` log type for important choices** — these survive research compaction.
4. **Check dependencies** — don't start a task if its blockers aren't completed. Use `suggest_next_tasks`.
5. **Mark status transitions promptly** — `in_progress` when starting, `completed` when done, `blocked` when stuck.
6. **Search knowledge before deciding** — use `recall_knowledge` to check the temporal graph and `check_contradictions` to verify nothing is outdated. Prior decisions may already exist across other plans.
7. **Use RPI for complex work** — if you're uncertain about the approach, decompose first.
8. **Don't modify tasks you haven't claimed** — mark `in_progress` before making changes.
