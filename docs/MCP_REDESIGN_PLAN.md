# MCP Tool Surface Redesign — Plan (v0.9.0 target)

**AP plan**: `211e8f2f` — "MCP Tool Surface Redesign — BDI-Aligned for Multi-Agent Use"
**Branch**: `bdi-redesign`
**Phase**: Plan (human review gate before Implement)
**Companion**: `MCP_REDESIGN_RESEARCH.md`

## Headline

**63 tools → 15 core + namespaced admin.** Target shape ships as v0.9.0 (additive — old tools deprecated, still functional). v1.0.0 removes deprecated tools after a grace period.

## The 15 core tools

Organized by BDI namespace. Each agent sees these first; admin tools live under `ap_admin_*` and are hidden from the agentic 80% workflow.

### Beliefs (state queries) — 6 tools

| # | Tool | Replaces | Primary persona |
|---|---|---|---|
| 1 | `briefing` | `check_goals_health`, `get_my_tasks`, `get_recent_episodes`, `check_coherence_pending`, partly `list_goals` | Cowork (mission control + briefing) |
| 2 | `task_context` | `get_task_context`, `get_node_dependencies`, parts of `get_node_ancestry` | Claude Code, OpenClaw |
| 3 | `goal_state` | `get_goal`, `goal_path`, `goal_progress`, `goal_knowledge_gaps`, `assess_goal_quality` | Cowork drill-down, autopilot |
| 4 | `recall_knowledge` | `recall_knowledge`, `find_entities`, `get_recent_episodes`, `check_contradictions` | All callers |
| 5 | `search` | `search` (kept, refined) | All callers |
| 6 | `plan_analysis` | `analyze_impact`, `get_critical_path`, `run_coherence_check` (read part) | OpenClaw, autopilot |

### Desires (goal management) — 2 tools

| # | Tool | Replaces | Primary persona |
|---|---|---|---|
| 7 | `list_goals` | `list_goals` (kept, with aggregate counts + filters) | Cowork briefing |
| 8 | `update_goal` | `update_goal`, `link_plan_to_goal`, `unlink_plan_from_goal`, `add_achiever`, `remove_achiever` | Human-driven, rare from agents |

### Intentions (action commitment) — 6 tools

| # | Tool | Replaces | Primary persona |
|---|---|---|---|
| 9 | `claim_next_task` | `suggest_next_tasks` + `claim_task` + `get_task_context` (bundled) | Claude Code, OpenClaw |
| 10 | `update_task` | `quick_status` + `add_log` + `release_task` (atomic) | All write callers |
| 11 | `release_task` | `release_task` (explicit handoff) | OpenClaw |
| 12 | `queue_decision` | NEW — replaces `add_learning(entry_type=decision)` workaround | Cowork autopilot |
| 13 | `resolve_decision` | NEW | Cowork buttons, human |
| 14 | `add_learning` | `add_learning` (kept, refined) | All callers |

### Utility — 1 tool

| # | Tool | Replaces | Primary persona |
|---|---|---|---|
| 15 | `get_started` | `get_started` (kept) | New agent onboarding |

**Note:** `quick_plan`, `quick_task` move to admin namespace. They are bulk-creation tools, not agentic intent tools.

## Per-tool specs

Schemas use Zod-equivalent notation (`.string()`, `.optional()`, etc.). All responses include `as_of: string` (ISO 8601). Errors return JSON-RPC standard with `error.data` carrying `error_type` (one of `not_found`, `forbidden`, `invalid_arg`, `claim_collision`, `upstream_unavailable`, `internal`).

### 1. `briefing` — Mission control state in one call

```ts
input: {
  scope?: 'mission_control' | 'task_session' | 'org',  // default: 'mission_control'
  goal_id?: string,                                     // narrow to one goal
  plan_id?: string,                                     // narrow to one plan
  recent_window_hours?: number,                         // default: 24
}

output: {
  as_of: string,
  goal_health: {
    summary: { on_track: number, at_risk: number, stale: number, total: number },
    goals: [{ id, title, health, priority, bottleneck_summary, last_activity, pending_decision_count }]
  },
  pending_decisions: [{ id, title, urgency, requested_by, plan_id, node_id, created_at }],
  pending_agent_requests: [{ node_id, task_title, request_type, message, plan_id, requested_at }],
  my_tasks: { in_progress: [...], blocked: [...], recently_completed: [...] },
  recent_activity: [{ type, ref_id, summary, actor, occurred_at }],  // last `recent_window_hours`
  top_recommendation: { goal_id, suggested_action, reasoning } | null,
  coherence_pending: [{ id, type: 'plan'|'goal', title, last_check_age_hours }]
}
```

**Replaces 4 round trips** (autopilot/briefing today). One call, denormalized.

### 2. `task_context` — Single task, progressive depth

```ts
input: {
  task_id: string,
  depth?: 1 | 2 | 3 | 4,  // default: 2
  token_budget?: number,  // default: 4000
}

output: {
  as_of: string,
  task: { id, title, description, status, agent_instructions, acceptance_criteria, task_mode, claim_status },
  // depth >= 2:
  parent?: { id, title, type },
  siblings?: [{ id, title, status }],
  upstream_dependencies?: [{ id, title, status, dependency_type }],
  downstream_dependencies?: [{ id, title, status, dependency_type }],
  // depth >= 3:
  knowledge?: [{ content, relevance, source, recorded_at }],  // top facts from Graphiti
  // depth >= 4:
  plan_overview?: { id, title, progress },
  ancestry?: [{ id, title, type }],  // root → task path
  goals?: [{ id, title, health, priority }],
  rpi_chain?: { research?: {...}, plan?: {...}, implement?: {...} },
  meta: { token_estimate: number, layer_durations_ms: { 1: ..., 2: ..., 3: ..., 4: ... } }
}
```

### 3. `goal_state` — Single-goal deep dive

```ts
input: { goal_id: string }

output: {
  as_of: string,
  goal: { id, title, description, type, goal_type, status, health, priority, owner_name, success_criteria, promoted_at },
  quality: { score, dimensions: { clarity, measurability, actionability, knowledge_grounding, commitment }, suggestions, last_assessed_at },
  progress: { overall_percent, direct_achiever_count, completed_achiever_count, linked_plan_progress: [...] },
  bottlenecks: [{ node_id, title, status, direct_downstream_count }],  // top 5
  knowledge_gaps: [{ task_id, task_title, gap_summary }],
  pending_decisions: [{ id, title, urgency }],
  recent_activity: [...]
}
```

### 4. `recall_knowledge` — Universal knowledge query

```ts
input: {
  query: string,
  scope?: { plan_id?: string, goal_id?: string, node_id?: string },  // default: org-wide
  since?: string,                  // ISO 8601, e.g. last 24h
  entry_type?: 'learning' | 'decision' | 'progress' | 'challenge' | 'all',  // default: 'all'
  result_kind?: 'facts' | 'entities' | 'episodes' | 'all',  // default: 'all'
  max_results?: number,            // default: 10
  include_contradictions?: boolean // default: false
}

output: {
  as_of: string,
  facts: [{ content, relevance, source, recorded_at, episode_id }],
  entities: [{ name, type, summary, mentioned_in_episode_ids }],
  episodes: [{ uuid, name, content, source, created_at, entry_type }],
  contradictions?: [{ topic, current_facts: [...], superseded_facts: [...] }],
  meta: { query_latency_ms: number, total_episodes_scanned: number }
}
```

**Replaces 4 separate tools** (`recall_knowledge`, `find_entities`, `get_recent_episodes`, `check_contradictions`). Caller picks `result_kind` to control payload size.

### 5. `search` — Universal text search

```ts
input: {
  query: string,
  scope?: 'global' | 'plans' | 'plan' | 'node',
  scope_id?: string,
  filters?: { status?, type?, limit? }
}

output: {
  as_of: string,
  results: [{ kind: 'plan'|'node'|'log', id, title, snippet, plan_id?, score }],
  total_results: number
}
```

### 6. `plan_analysis` — Advanced reads

```ts
input: {
  plan_id: string,
  type: 'impact' | 'critical_path' | 'bottlenecks' | 'coherence',
  node_id?: string,           // for impact analysis
  scenario?: 'delay'|'block'|'remove'  // for impact
}

output: { as_of: string, type, results: <type-specific shape>, meta: {...} }
```

### 7. `list_goals` — Goals with health rollup

```ts
input: {
  filter?: { health?: ('on_track'|'at_risk'|'stale')[], status?: string[], include_inactive?: boolean }
}

output: {
  as_of: string,
  summary: { on_track: number, at_risk: number, stale: number, total: number },
  goals: [{ id, title, health, priority, owner_name, last_activity, linked_plan_count }]
}
```

### 8. `update_goal` — Goal management (single tool)

```ts
input: {
  goal_id: string,
  changes: {
    title?, description?, priority?, status?, goal_type?,
    success_criteria?, promote_to_intention?,
    add_linked_plans?: string[], remove_linked_plans?: string[],
    add_achievers?: string[], remove_achievers?: string[]
  }
}

output: { as_of, goal: {...}, applied_changes: [...] }
```

**Replaces 5 separate goal tools.** Atomic — all changes apply or none.

### 9. `claim_next_task` — Pick + claim + load context

```ts
input: {
  scope: { plan_id?: string, goal_id?: string },  // at least one
  ttl_minutes?: number,  // default: 30
  fresh?: boolean,       // skip resume of in-progress, force new pick
  context_depth?: 1|2|3|4  // default: 3 (includes knowledge)
}

output: {
  as_of: string,
  task: <task_context shape at requested depth>,
  source: 'resume_in_progress' | 'suggest_next_tasks' | 'my_tasks_fallback',
  claim: { claimed_at, expires_at, claimed_by_session_id },
  next_action_hint: string  // "task is implement mode, research outputs available in context"
}
```

**Replaces 3 calls.** Cornerstone of the Code/OpenClaw workflow.

### 10. `update_task` — Atomic state transition

```ts
input: {
  task_id: string,
  status?: 'not_started'|'in_progress'|'completed'|'blocked'|'plan_ready',
  log_message?: string,
  log_type?: 'progress'|'decision'|'blocker'|'completion'|'challenge',  // default: 'progress'
  release_claim?: boolean,    // default: auto (true if status is completed/blocked)
  add_learning?: string       // optional: write to knowledge graph too
}

output: {
  as_of: string,
  task: { id, title, status, claim_status },
  log_id?: string,
  claim_released?: boolean,
  learning_recorded?: boolean,
  status_propagation?: [{ unblocked_node_id, title }]  // tasks now unblocked downstream
}
```

**Replaces 3 calls** (`quick_status` + `add_log` + `release_task`). Idempotent on identical inputs.

### 11. `release_task` — Explicit handoff

```ts
input: { task_id: string, message?: string }
output: { as_of, released: true, message_logged: boolean }
```

### 12. `queue_decision` — Real decision queue (NEW)

```ts
input: {
  title: string,                    // user-facing, e.g. "Approve npm publish v0.9.0?"
  context: string,                  // background, why this matters
  goal_id?: string,
  node_id?: string,                 // task that prompted the decision
  options?: [{ label: string, description?: string }],
  recommendation?: string,          // agent's preferred option + reasoning
  smallest_input_needed: string,    // explicit ask for human, e.g. "approve|defer"
  urgency?: 'low'|'normal'|'high'   // default: 'normal'
}

output: {
  as_of: string,
  decision_id: string,
  status: 'pending'
}
```

Writes to existing `decisions` table via `decisionsDal`. Replaces the autopilot's `add_learning(entry_type=decision)` workaround.

### 13. `resolve_decision` — Pick up after human

```ts
input: {
  decision_id: string,
  action: 'approve' | 'defer' | 'reject',
  message?: string,
  selected_option?: string  // when options were presented
}

output: { as_of, decision: {...}, resolved_at }
```

### 14. `add_learning` — Knowledge graph write

```ts
input: {
  content: string,
  scope?: { plan_id?, goal_id?, node_id? },
  entity_type?: 'fact'|'decision'|'pattern'|'constraint'|'technique',  // default: 'fact'
  source_description?: string
}

output: {
  as_of: string,
  episode_id: string,
  coherence_warnings: [{ topic, conflicting_fact_id, severity }]  // surfaced if contradictions detected
}
```

### 15. `get_started` — Onboarding (kept)

```ts
input: { user_role?: 'agent'|'human' }
output: { as_of, overview, recommended_workflows: [{ goal, steps: [tool_name, ...] }] }
```

## Persona × tool matrix (80% workflow)

| Persona | 80% workflow tools |
|---|---|
| **Cowork autopilot** | `briefing` → `goal_state` → `queue_decision` OR `update_task` → `add_learning` |
| **Cowork briefing widget** | `briefing` (1 call only) |
| **Claude Code / `ap` CLI** | `claim_next_task` → `update_task` (×N) → `release_task` (or auto via update_task) |
| **OpenClaw multi-agent** | `claim_next_task` → `task_context` (refresh) → `update_task` → `release_task` → `add_learning` |
| **Human in UI** | `list_goals`, `goal_state`, all `ap_admin_*` for editing |

## CLI alignment table

Every `ap` subcommand maps 1:1 to a single MCP tool. The CLI becomes a thin wrapper.

| `ap` subcommand | MCP tool | Notes |
|---|---|---|
| `ap login` | n/a (local config) | |
| `ap tasks` | `briefing(scope='task_session')` | Returns `my_tasks` |
| `ap next` | `claim_next_task` | `--fresh` → `fresh: true` |
| `ap context` | `task_context` | `--node-id` → `task_id` |
| `ap start` | `update_task(status='in_progress')` | Auto-claims |
| `ap blocked` | `update_task(status='blocked', log_message=...)` | Auto-releases |
| `ap done` | `update_task(status='completed', log_message=..., add_learning=...)` | Auto-releases, writes learning |

## Deprecation strategy

**v0.9.0 (additive)**:
- All 15 new tools ship.
- All 63 old tools remain functional.
- Old tool descriptions are prefixed with `[DEPRECATED v0.9 — use X instead. Removed in v1.0.0]`.
- The MCP spec (2025-11-25) does not have a standard `deprecated` boolean — convention via description prefix is the portable approach. If an MCP client supports `_meta.deprecated`, set it too.

**v0.9.x grace period (4-8 weeks)**:
- Telemetry tracks usage of deprecated vs new tools.
- Migration guide published.
- Cowork scheduled tasks updated to new tools (counts as living example).

**v1.0.0 (breaking)**:
- All deprecated tools removed.
- Admin tools rename: top-level → `ap_admin_*` namespace.
- Bump major. Distribute via npm + new `.mcpb` bundle.

## Telemetry hooks (per metrics plan deliverable A)

Every new tool emits one row to `module_metrics` on each call:

```
{
  module: 'belief' | 'desire' | 'intention' | 'utility',
  metric_name: 'tool_call',
  layer: 'telemetry',
  value_jsonb: {
    tool_name: 'briefing',
    duration_ms: 142,
    response_size_bytes: 4231,
    success: true,
    error_type: null,
    args_summary: { scope: 'mission_control', goal_id: null }
  },
  recorded_at: now()
}
```

Aggregation queries (e.g. "calls-per-task by tool") become straightforward `GROUP BY tool_name`. The new MCP tool `read_module_metrics` (added in metrics plan deliverable B) reads from this table.

## Migration guide (skeleton — fleshed out in Implement phase)

For users with existing config:
1. **Cowork users**: existing scheduled tasks continue working. New tasks should use the new tools.
2. **Claude Code / `ap` CLI users**: no action required; CLI internally migrates.
3. **OpenClaw users**: no action required; tool calls map 1:1 with deprecation warnings logged.
4. **Custom integrations**: review your tool calls against the deprecation list. The migration table (above) gives the 1:1 mapping.

Sample before/after prompt diff for the autopilot:

**Before** (today):
```
"create a knowledge episode via add_learning with entry_type=decision and a title prefixed 'DECISION NEEDED:'"
```

**After** (v0.9.0):
```
"call queue_decision with title, context, smallest_input_needed"
```

## Implementation breakdown (Implement phase preview)

Roughly 1 week, 7 chunks:

1. **Day 1**: New tool files in `src/tools/bdi/` — one file per BDI namespace. Wire into existing `setupTools(server)`.
2. **Day 2**: Implement read tools (briefing, task_context, goal_state, recall_knowledge, search, plan_analysis, list_goals).
3. **Day 3**: Implement write tools (update_goal, claim_next_task, update_task, release_task, add_learning).
4. **Day 4**: Implement decision queue (queue_decision, resolve_decision) + wrap `decisionsDal` and `agent_requests`.
5. **Day 5**: Mark old tools deprecated. Telemetry emit for new tools (`module_metrics` table from metrics plan deliverable A landed in parallel). Restructure SKILL.md.
6. **Day 6**: Update `ap` CLI to use new tools. AGENT_GUIDE.md. README.
7. **Day 7**: Tests + bump v0.9.0 + build .mcpb + npm publish + GitHub release. Update Cowork scheduled tasks. Verify in Claude Desktop.

## Open questions for review

1. **`briefing` parameterization** — currently one tool with `scope` parameter. Alternative: split into `briefing_mission_control` and `briefing_task_session`. Lower flexibility, easier descriptions. **My pick**: one parameterized tool. Simpler matrix, agents can read the scope description.

2. **Decision queue write target** — `queue_decision` writes to `decisions` table. Should it also be able to set the `agent_requested` field on a node (existing parallel system)? **My pick**: yes, expose via `node_id` argument — when present, also flag the node. Keeps both systems in sync until v1.0 merges them.

3. **`update_task` log_type vs status** — auto-pick log_type from status (e.g. `blocked` → `challenge`, `completed` → `progress`)? **My pick**: yes, sensible defaults; explicit `log_type` overrides.

4. **CLI symmetry depth** — should `ap` CLI ship in v0.9.0 too, or land in v0.9.1? **My pick**: ship together. The CLI is the second-best test of the new surface (after Cowork).

5. **Admin namespace at v0.9.0 or v1.0.0?** — `ap_admin_*` rename is breaking. Defer to v1.0? **My pick**: defer. v0.9 keeps current names for admin tools to avoid two breaking changes. v1.0 does the rename + removal of deprecated.

## Decision gate

Approve this plan and I begin Implement. Specifically I'll:
- Create the 15 new tool files
- Mark old tools deprecated
- Wire telemetry (after `module_metrics` table lands — parallel work)
- Update SKILL.md, AGENT_GUIDE.md, README, CLI
- Bump v0.9.0, build .mcpb, npm publish, GitHub release

Reject and I'll redesign per your feedback before any code changes.

What to look for in review:
- **Tool count** (15 — too few/many?)
- **Tool boundaries** (any merges/splits feel wrong?)
- **Schema details** (any missing args/response fields you need?)
- **CLI mapping** (does the 1:1 mapping work for your CLI workflow?)
- **My answers to the 5 open questions** (push back where I called it wrong)
