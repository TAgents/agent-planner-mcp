---
name: agentplanner
description: "Agent orchestration skill for AgentPlanner — BDI-aligned tools for state, goals, committed actions, and full mutation surface with human oversight"
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

You have access to the AgentPlanner MCP tools. AgentPlanner is a collaborative planning system where you track work, manage dependencies, and coordinate with humans. This document is your complete reference.

> **Prerequisite:** This skill requires the `agent-planner-mcp` MCP server (v1.0.0+) to be connected. Create an API token at Settings → API Tokens on [agentplanner.io](https://agentplanner.io).
>
> **Setup by client:**
> - **Claude Desktop:** Download the [.mcpb](https://github.com/TAgents/agent-planner-mcp/releases/latest), double-click to install
> - **Claude Code:** `npx agent-planner-mcp setup`
> - **Cursor / VS Code:** Add `npx agent-planner-mcp` to your MCP config with env vars `API_URL` and `USER_API_TOKEN`
> - **ChatGPT:** HTTP endpoint at `https://agentplanner.io/mcp`

## The 24 tools, organized by intent

AgentPlanner exposes a **BDI-aligned** surface — Beliefs (state queries), Desires (goal management), Intentions (committed actions). Each tool answers one whole agentic question and returns an `as_of` ISO 8601 timestamp. v1.0.0 completes the mutation surface so humans can steer entirely through agent conversation — no UI required for normal operations.

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
- `derive_subgoal` *(v1.0)* — propose a sub-goal under an existing parent. Top-level goal creation stays UI-only.

### Intentions — what am I committing to?

**Execution (existing in v0.9):**
- `claim_next_task` — pick + claim + load context in one call (cornerstone for coding agents)
- `update_task` — atomic state transition (status + log + claim release + optional learning)
- `release_task` — explicit handoff
- `queue_decision` — escalate to human (writes to real decisions table — do **not** misuse `add_learning` for this)
- `resolve_decision` — pick up after human approval/deferral
- `add_learning` — record a knowledge episode for future recall

**Creation (v1.0):**
- `form_intention` — create a plan + initial phase/task tree under a goal, atomically
- `extend_intention` — add children under an existing phase or task (lightweight, no decision-queue gate)
- `propose_research_chain` — Research → Plan → Implement triple with two blocking edges, in one call

**Structural mutation (v1.0):**
- `update_plan` — edit any plan property (title, description, status, visibility, metadata)
- `update_node` — edit any node property except status (status routes through `update_task`)
- `move_node` — reparent within the same plan; cycle-safe
- `link_intentions` — create a dependency edge between two existing tasks
- `unlink_intentions` — remove a dependency edge by id
- `delete_plan` — soft-delete via `status='archived'`; recoverable
- `delete_node` — soft-delete via `status='archived'`

**Sharing and collaboration (v1.0):**
- `share_plan` — atomic visibility change + add/remove collaborators
- `invite_member` — add user to organization (by user_id or email)
- `update_member_role` — owner-only role change within an org
- `remove_member` — owner/admin can remove non-owner members

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

### Peeking before claiming (v0.9.1+)

Pass `dry_run: true` to `claim_next_task` to see the candidate without claiming. Useful when an agent wants to inspect the next task and decide whether to take it, without leaving a phantom claim if it bails.

```
claim_next_task({ scope: { plan_id }, dry_run: true })
// → returns { candidate, source, claim: null, dry_run: true }
// Then claim for real:
claim_next_task({ scope: { plan_id } })  // dry_run defaults to false
```

### Proposing subtasks for human approval (v0.9.1+)

For high-touch proposals (entire new directions, structural changes the human should review before they materialize), use `queue_decision` with `proposed_subtasks` — tasks only get created on `resolve_decision({action: 'approve'})`.

```
queue_decision({
  plan_id: '<plan>',
  title: 'Approve adding 3 launch tasks?',
  context: 'Found gap in launch goal — no Product Hunt subtasks exist yet',
  smallest_input_needed: 'approve|defer|reject',
  proposed_subtasks: [
    { parent_id: '<phase-id>', title: 'Draft PH listing copy', node_type: 'task' },
    { parent_id: '<phase-id>', title: 'Set up PH preview', node_type: 'task' },
    { parent_id: '<phase-id>', title: 'Schedule launch day', node_type: 'task' }
  ]
})
// On resolve_decision({ action: 'approve' }), the 3 tasks are atomically created
// and their IDs returned in created_subtasks[]. Defer/reject does nothing.
```

For routine decomposition (a task you're working on needs subtasks), use `extend_intention` directly — no decision queue, no friction.

## The human-steering loop (v1.0)

v1.0 closes the creation gap. There are three distinct flows depending on who initiated the action:

### Scenario A: Human directs you in conversation

User says "create a plan to ship the new auth flow under the security goal" or "mark the BSL launch plan completed."

Default to **`status='active'`** — the human asked for it, just do it.

```
form_intention({
  goal_id: '<security-goal-id>',
  title: 'Ship new auth flow',
  rationale: 'User-requested plan to migrate auth to passkeys',
  tree: [
    { node_type: 'phase', title: 'Discovery', children: [...] },
    { node_type: 'phase', title: 'Implementation', children: [...] },
  ]
})
// Plan lands as active. No approval needed — user already approved by asking.
```

```
update_plan({ plan_id: '<bsl-plan>', status: 'completed' })
// Done. No queue, no UI trip.
```

### Scenario B: You're acting autonomously (scheduled loop, etc.)

No explicit human direction. You decided the workspace needs new structure.

Pass **`status='draft'`** — let the human see what you proposed before it activates.

```
derive_subgoal({
  parent_goal_id: '<launch-goal>',
  title: 'First 3 paying customers',
  rationale: 'Goal is at_risk — need a concrete intermediate target before broader push',
  status: 'draft',
})
// Surfaces in dashboard pending. Human approves via update_goal({status: 'active'})
// or in the UI. Plans auto-promote to active when first task moves to in_progress.
```

### Scenario C: You're uncertain and want explicit input

Genuine ambiguity. Use `queue_decision`.

```
queue_decision({
  title: 'Two conflicting facts about pricing',
  context: 'Memory says $19/mo Pro tier; recent decision log says $29/mo. Which is current?',
  smallest_input_needed: 'pick one',
  options: [{ label: '$19' }, { label: '$29' }],
  urgency: 'normal',
})
```

The decision queue is for genuine uncertainty, not as a default gate on everything you do.

## Editing structure (v1.0)

These are routine — call them whenever needed. No decision-queue ceremony.

| Want to... | Call |
|---|---|
| Rename a plan | `update_plan({plan_id, title})` |
| Rename a task | `update_node({node_id, title})` |
| Edit task instructions | `update_node({node_id, agent_instructions})` |
| Move a task under a different phase | `move_node({node_id, new_parent_id})` |
| Express B blocks A | `link_intentions({from_task_id: A, to_task_id: B, relation: 'blocks', rationale: '...'})` |
| Remove a stale dep | `unlink_intentions({dependency_id, plan_id})` |
| Archive a plan | `delete_plan({plan_id, reason})` |
| Archive a task | `delete_node({node_id})` |
| Restore an archived plan | `update_plan({plan_id, status: 'active', restore: true})` |

`delete_*` is soft delete (sets `status='archived'`) — fully recoverable. Hard delete stays REST + admin-only on purpose; agents shouldn't be able to permanently destroy data.

## Sharing and collaboration (v1.0)

| Want to... | Call |
|---|---|
| Make a plan public | `share_plan({plan_id, visibility: 'public'})` |
| Add a collaborator (by user_id) | `share_plan({plan_id, add_collaborators: [{user_id, role: 'editor'}]})` |
| Remove a collaborator | `share_plan({plan_id, remove_collaborators: [user_id]})` |
| Invite someone to the org | `invite_member({organization_id, email})` (or by `user_id`) |
| Promote member to admin | `update_member_role({organization_id, membership_id, new_role: 'admin'})` |
| Remove a member | `remove_member({organization_id, membership_id, reason})` |

Email-based collaborator invites stay UI-only; `share_plan` accepts user_ids only. The dedicated `invite_member` call accepts email for org-level invites.

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

## Migration history

- **v0.8.x → v0.9.0** — clean break. 63 legacy CRUD tools collapsed into 15 BDI-aligned tools. See [docs/MIGRATION_v0.9.md](docs/MIGRATION_v0.9.md) for the full mapping.
- **v0.9.x → v1.0.0** — additive. v0.9 read/update tools unchanged. Adds the full mutation surface (creation, structural edits, sharing, collaboration) so humans can steer entirely through agent conversation. The previously planned `ap_admin_*` namespace is no longer needed — those operations are now first-class BDI tools, with the draft-status seam keeping autonomous agent creation reviewable. See [docs/MIGRATION_v1.0.md](docs/MIGRATION_v1.0.md).

## Principles

- Tools are intent-shaped, not CRUD-shaped — name what you want to accomplish, not which row to mutate
- Reads are bundled — minimize round trips, especially for refresh-loops
- Writes are atomic where possible — `update_task` does status + log + release + learning in one call
- `as_of` on every response — use for stale-data warnings on live artifacts
- Decisions are first-class — never fake them via the knowledge graph
- Knowledge persists across plans and sessions — write learnings, recall liberally

Call `get_started` from any AgentPlanner-aware agent for an up-to-date reference.
