# MCP v1.0.0 — Full BDI Mutation Surface

**Status:** Spec, ready for implementation
**Target release:** v1.0.0 (additive — no breaks to v0.9 read/update tools)
**Owner:** TBD

## Why

The v0.9.0 release shipped a clean 8-tool BDI read/update surface but punted **all creation, structural mutation, deletion, and sharing** to a future `ap_admin_*` namespace, with the guidance "call REST directly if you need them now."

This contradicts the AgentPlanner positioning: **agents drive, humans steer.** The "humans steer" part is supposed to happen *through agents* — a user tells their agent "mark this plan completed" or "create a plan to ship the redesign," and the agent executes via MCP. If MCP can only read and update tasks, every steering action requires the human to leave the conversation and use the UI. **The UI should be optional inspection, not the source of truth for actions.**

v1.0.0 closes the gap by exposing the full mutation surface in BDI-shaped tools. Together with v0.9's read/update tools, an agent can do everything a human can do in the UI.

## Design principles

1. **MCP-UI parity for all non-identity operations.** Anything a human does in the UI to manage their own plans/goals/tasks must be callable via MCP. Identity (signup, login, password reset) and billing stay UI-only.
2. **Default to acting, not gating.** Agents called by humans-in-conversation should produce active state immediately. Drafts and decision-queue gating are opt-in for *autonomous* loops, not the default for human-directed work.
3. **Atomic where possible.** Composite operations (create plan + initial tree, decompose task into N subtasks) ship as one tool call. Round-trip count matters for autonomous loops.
4. **No new approval infrastructure.** Existing `queue_decision`/`resolve_decision` covers cases where the agent wants human input. Drafts surface in the same queue.

## What v0.9.0 already covers (don't rebuild)

| Operation | Tool |
|---|---|
| Read mission state | `briefing` |
| Read task with neighborhood + knowledge | `task_context` |
| Read goal | `goal_state` |
| Read plan analytics (impact, critical path, bottlenecks, coherence) | `plan_analysis` |
| List goals with health | `list_goals` |
| Update task state + log + release claim | `update_task` |
| Update goal (link plans, achievers, etc.) | `update_goal` |
| Claim next task | `claim_next_task` |
| Release task claim | `release_task` |
| Queue a decision for human | `queue_decision` (incl. `proposed_subtasks` for atomic creation on approval) |
| Resolve a decision | `resolve_decision` |
| Add knowledge episode | `add_learning` |
| Recall knowledge | `recall_knowledge` |
| Free-text search | `search` |
| Onboarding helper | `get_started` |

Use these as-is. v1.0 adds creation and structural mutation on top.

## New tools in v1.0.0

### Goal management

#### `derive_subgoal`
Create an intermediate desired state under an existing parent goal.

```
parent_goal_id*       sub-goals only — top-level goals stay UI/admin
title*
description
type                  outcome | milestone | objective (default: outcome)
success_criteria      array of strings
rationale*            why this sub-goal serves the parent (surfaces in queue if status=draft)
status                draft | active (default: active)
```

(Top-level goals are not creatable via MCP. Strategic direction is human-set; agents derive sub-goals to achieve direction.)

### Plan management

#### `form_intention`
Create a plan + initial tree atomically.

```
goal_id*              plan must serve a goal (or sub-goal)
title*
description
rationale*
status                draft | active (default: active)
visibility            private | unlisted | public (default: private)
tree                  recursive { node_type, title, description, task_mode, agent_instructions, acceptance_criteria, children[] }
```

No depth or node-count cap. Agents pre-plan as much as they can; humans inspect via the UI or via subsequent agent dialogue.

#### `update_plan`
Edit any plan property. Atomic.

```
plan_id*
title
description
status                draft | active | completed | archived
visibility            private | unlisted | public
github_repo_url
metadata              partial-merge into existing
```

#### `delete_plan`
Soft delete (sets `status='archived'`). Hard delete only via REST + admin permission.

```
plan_id*
reason                surfaces in audit log
```

#### `share_plan`
Manage plan visibility and per-user collaborators in one call.

```
plan_id*
visibility            private | unlisted | public — toggle plan-level visibility
add_collaborators     [{ user_email, role: 'viewer' | 'editor' | 'admin' }]
remove_collaborators  [user_email]
```

### Node (phase / task / milestone) management

#### `extend_intention`
Add children under an existing phase or task. Lightweight — does not go through the decision queue.

```
parent_id*
rationale*
status                draft | active (default: active)
children              [{ node_type, title, description, task_mode, agent_instructions, acceptance_criteria }]
```

#### `update_node`
Edit any node property. Atomic. Use for renames, description edits, type changes, agent instructions.

```
node_id*
title
description
node_type             phase | task | milestone
task_mode             free | research | plan | implement
agent_instructions
acceptance_criteria
metadata              partial-merge
```

(Status transitions remain on `update_task` since they trigger claim/log side effects.)

#### `move_node`
Reparent a node within the same plan. Cycle-safe.

```
node_id*
new_parent_id*
position              optional — order index among siblings
```

#### `delete_node`
Soft delete (sets `status='archived'`). Cascades to children.

```
node_id*
reason
cascade_children      default: true
```

### Dependencies

#### `link_intentions`
Create a dependency edge between two existing tasks. Cycle detection rejects circular edges.

```
from_task_id*
to_task_id*
relation              blocks | requires | relates_to (default: blocks)
rationale*
```

#### `unlink_intentions`
Remove a dependency edge.

```
dependency_id*
reason
```

### RPI shortcut

#### `propose_research_chain`
Create Research → Plan → Implement triple with the two blocking edges, all under one parent.

```
parent_id*
research_question*
implementation_target*
rationale*
status                draft | active (default: active)
```

### Collaboration / organization

#### `invite_member`
Invite a user to an organization.

```
organization_id*
email*
role                  member | admin (default: member)
message               personalized invite text
```

#### `update_member_role`
Change a member's role within an organization.

```
organization_id*
user_id*
new_role              member | admin
```

#### `remove_member`
Remove a member from an organization.

```
organization_id*
user_id*
reason
```

### What stays UI/REST-only (not exposed in v1.0)

- **Identity:** signup, login, password reset, MFA enrollment
- **Billing:** subscription changes, payment methods, invoices
- **Top-level goal creation:** strategic direction is human-set
- **Organization creation:** rare, identity-shaped
- **Hard delete:** soft delete (`status='archived'`) is reversible; hard delete requires REST + admin token

Everything else: parity with the UI.

## The status semantics

Plans, goals, and nodes use a unified status enum:

| Status | Meaning |
|---|---|
| `draft` | Created but not committed. Surfaces in Decision Queue alongside `queue_decision` items. Agents acting autonomously default here. |
| `active` | Live. Agents acting on human direction default here. |
| `in_progress` | (Tasks only) Currently being worked. Auto-set when claimed. |
| `completed` | Done. |
| `blocked` | Cannot proceed. Surfaces as bottleneck. |
| `archived` | Soft-deleted. Hidden from default lists. Recoverable via `update_*({status: 'active'})`. |

**Auto-promotion:** `update_task(status='in_progress')` and `update_goal(status='active')` promote `draft` → that status as a side effect. No special tool needed.

## How the human-steering loop works (the key flow)

### Scenario A: Human directs agent in conversation

```
User: "Mark the BSL Open Source Launch plan as completed."
Agent: 
  1. search({query: "BSL Open Source Launch"}) → finds plan_id
  2. update_plan({plan_id, status: 'completed'}) — defaults active, promotes through completed
  3. "Done. Plan marked completed."
```

No UI required. No decision queue. The human steered through the agent.

### Scenario B: Agent acts autonomously (e.g., scheduled loop)

```
Cowork autopilot tick:
  1. briefing() → notices "10 paying customers" goal is at_risk
  2. derive_subgoal({parent_goal_id, title: "First 3 paying customers", status: 'draft', rationale: "..."})
  3. form_intention({goal_id: <new sub-goal>, status: 'draft', tree: [...]})
```

Both land as drafts. They surface in Decision Queue. Human reviews and either:
- Tells the agent in chat: "approve those drafts" → agent calls `update_*({status: 'active'})`
- Promotes via UI directly (still works, optional)
- Tells the agent: "archive that sub-goal, it's premature" → agent calls `update_goal({status: 'archived', ...})`

### Scenario C: Agent unsure, wants explicit human input

```
Agent encounters genuine ambiguity:
  queue_decision({
    title: "Two conflicting facts about pricing model",
    context: "...",
    options: [...],
    smallest_input_needed: "Pick one"
  })
```

Same as v0.9. The decision queue is reserved for genuine uncertainty, not as a default gate.

## Sequencing (~3 weeks)

### Week 1 — Schema + creation tools

| Day | Track |
|---|---|
| 1 | Backend: extend status enums on `plans`, `goals`, `plan_nodes` to include `draft` and `archived` (if missing). Drizzle migration. |
| 2 | Backend: ensure all REST creation endpoints accept `status` parameter, default `active` for direct calls (preserves UI behavior), `draft` only when MCP passes it. |
| 2 | Backend: `update_task`/`update_goal` auto-promote `draft` → target status. |
| 3-4 | MCP: implement `derive_subgoal`, `form_intention`, `extend_intention`, `link_intentions`, `unlink_intentions`, `propose_research_chain`. |
| 5 | Integration tests for creation tools. |

### Week 2 — Mutation + collaboration tools

| Day | Track |
|---|---|
| 6-7 | MCP: implement `update_plan`, `update_node`, `move_node`, `delete_plan`, `delete_node`. |
| 8 | MCP: implement `share_plan`, `invite_member`, `update_member_role`, `remove_member`. |
| 9 | Backend: extend Decision Queue API to surface drafts as queue items with `kind: 'draft' \| 'decision'`. |
| 10 | Integration tests for mutation tools. End-to-end smoke: agent bootstraps a workspace from empty. |

### Week 3 — Docs, dogfood, ship

| Day | Track |
|---|---|
| 11 | Update `SKILL.md`, `AGENT_GUIDE.md` with all new tools + the human-steering flow scenarios above. |
| 12 | Rewrite `MIGRATION_v0.9.md` → `MIGRATION_v1.0.md`: removes the "call REST directly" guidance, documents the full surface, notes status defaults. |
| 13-14 | Dogfood: drive the AgentPlanner UI redesign work itself entirely through agent conversation. No clicks except inspection. Find the gaps. |
| 15 | Bug fixes from dogfood. Tag v1.0.0. Ship `.mcpb` and npm. Update Cowork integration. |

## Acceptance criteria

- [ ] Agent can create a goal hierarchy, plan, tasks, dependencies, and RPI chains via MCP
- [ ] Agent can rename, edit, move, archive, and share any plan/node via MCP
- [ ] Agent can manage organization members via MCP
- [ ] User can complete one full workday managing AgentPlanner *only* through agent conversation (no UI clicks except for inspection)
- [ ] Drafts surface in Decision Queue
- [ ] `MIGRATION_v1.0.md`, `SKILL.md`, `AGENT_GUIDE.md` reflect the full surface
- [ ] `.mcpb` and npm published, Cowork integration verified

## Open implementation questions (resolve during week 1)

1. **Hard vs soft delete defaults** — `delete_plan`/`delete_node` set `status='archived'` (soft). Is there ever an agent-callable need for hard delete? Recommendation: no — hard delete stays REST-only with admin auth.
2. **Authority checks** — every mutation tool must verify the token's user has `editor` or higher on the target. Reuse existing `planAccess.middleware.js`.
3. **Cross-org operations** — should an agent with tokens in two orgs be able to copy a plan between them? Recommendation: out of scope for v1.0; ships as `migrate_plan` in v1.1 if demand emerges.
4. **`update_node` and node_type changes** — changing a `phase` to a `task` is structurally weird. Should we reject it? Recommendation: reject `node_type` changes if the node has children.
5. **Audit trail** — every mutation should log to `event_log` with the agent's token_id and tool_name. Reuse the `tool_calls` instrumentation from the UI redesign Phase 0 (now a hard prereq).
