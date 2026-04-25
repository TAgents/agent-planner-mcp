# MCP Tool Surface Audit — Research for BDI Redesign

**AP plan**: `211e8f2f` — "MCP Tool Surface Redesign — BDI-Aligned for Multi-Agent Use"
**Branch**: `bdi-redesign`
**Status**: research in progress
**Audit date**: 2026-04-25

## TL;DR

- **63 tools today**, not 43 as earlier estimates assumed — even stronger case for redesign.
- **Caller mismatch is the root issue**: tools were designed when callers were humans typing in chat. Real callers today are scheduled Cowork agentic loops, single-task coding agents, multi-agent OpenClaw VMs, and the `ap` CLI. Each has different shape needs that the current surface fights against.
- **Top friction (evidence-backed)**: Cowork autopilot fakes decisions via `add_learning` because no `list_pending_decisions` exists. Briefing makes 4 calls per render. No `as_of` timestamps. CRUD tools dominate while agentic intent tools are missing. No bundled "claim and load context" tool.
- **Recommended target**: ~15 tools across 4 namespaces (beliefs, desires, intentions, admin). Keep all 63 working through v0.9.x as deprecated; remove in v1.0.0.

## Caller personas and what they actually need

| Persona | Lifetime | Read shape | Write shape | Concurrency | Token budget |
|---|---|---|---|---|---|
| **Claude Cowork** | scheduled tick or user prompt; auto-refreshing live artifact | aggregate dashboard ("what's the state?") | queue decisions, log outcomes, mark obvious-done | single agent | tight (refreshes often) |
| **Claude Code / Codex** | repo session; one task at a time | single task with deep context | claim → status → release → learning | single agent in session | medium (one expensive load OK) |
| **OpenClaw VM agent** | long-running; Slack-driven; concurrent peers | task with claim awareness | all of Code's writes plus handoff/heartbeat | multi-agent, claims must be enforced | medium |
| **`ap` CLI** | local repo, paired with coding agent | task context, tasks queue | claim, status, log, learning | single | n/a (text output) |

The current 63-tool surface serves none of these well. It serves a UI persona that no one is.

## Tool inventory: all 63 tools, BDI-classified

Roles: **B**=belief (state queries), **D**=desire (goal management), **I**=intention (action commitment), **A**=admin (CRUD for humans editing structure), **U**=utility (meta/onboarding).

### Quick actions / agentic entry points (5)
| Tool | Role | Notes |
|---|---|---|
| `quick_plan` | A | Bulk plan creation. Human/setup tool. |
| `quick_task` | A | Append task. Mostly UI-shaped. |
| `quick_status` | I | Status update. **Belongs in core intention surface.** |
| `quick_log` | I | Log entry. **Core intention.** |
| `check_goals_health` | B | **Cowork autopilot's first call.** Strong belief tool — keep, refine. |

### Task claiming / multi-agent (2)
| Tool | Role | Notes |
|---|---|---|
| `claim_task` | I | **OpenClaw-critical.** Refine to bundle "claim + load context" in v0.9. |
| `release_task` | I | Atomic counterpart to claim. Keep. |

### Coherence (3)
| Tool | Role | Notes |
|---|---|---|
| `check_coherence_pending` | B | Belief — "what needs review?" |
| `run_coherence_check` | I | Triggers a heuristic recompute. Keep but deprioritize. |
| `assess_goal_quality` | B | Read-side belief. **Currently never persists results** — see metrics plan deliverable C. |

### Context loading (1 main + others scattered)
| Tool | Role | Notes |
|---|---|---|
| `get_my_tasks` | B | **Cowork briefing call.** Core belief tool. |
| `get_task_context` | B | **Claude Code's primary read.** 4 progressive depth layers. Keep, expose `as_of`. |
| `suggest_next_tasks` | B | Read-side recommender. Used by `ap next`. |
| `get_plan_context` | B | Plan-level overview. |
| `get_plan_structure` | B | Hierarchical tree, lightweight. |
| `get_plan_summary` | B | Stats-shaped. |

### Markdown export/import (2)
| Tool | Role | Notes |
|---|---|---|
| `export_plan_markdown` | A | Human export. Keep but admin-namespace. |
| `import_plan_markdown` | A | Bulk creation from text. Admin-namespace. |

### Universal search (1)
| Tool | Role | Notes |
|---|---|---|
| `search` | B | **Underused.** Could fold `find_entities` and `recall_knowledge` queries here, but those have different result shapes. Keep separate. |

### Plan management (5)
| Tool | Role | Notes |
|---|---|---|
| `list_plans` | B | Belief query. Keep. |
| `create_plan` | A | Setup. Admin. |
| `update_plan` | A | Admin/setup. |
| `delete_plan` | A | Hard stop — admin only. |
| `share_plan` | A | Visibility toggle. Admin. |

### Node management (5)
| Tool | Role | Notes |
|---|---|---|
| `create_node` | A | CRUD-shaped. **Most overused tool — agents reach for this when they should be using `claim_next_task` or `update_task`.** |
| `update_node` | A/I | Used both for status (intention) and structure (admin). **Split this.** Status path → `update_task`. Structure path → `ap_admin_*`. |
| `delete_node` | A | Admin. |
| `move_node` | A | Tree restructure. Admin. |
| `get_node_ancestry` | B | Path query. Belief. |

### Dependency management (5)
| Tool | Role | Notes |
|---|---|---|
| `create_dependency` | A | Plan structure edit. Admin. |
| `delete_dependency` | A | Admin. |
| `list_dependencies` | B | Read. Belief. |
| `get_node_dependencies` | B | Per-node read. Belief. |
| `create_rpi_chain` | A | Bulk structure creation. Admin. |

### Analytics / planning (3)
| Tool | Role | Notes |
|---|---|---|
| `analyze_impact` | B | What-if read. Belief. |
| `get_critical_path` | B | Belief. |
| `batch_update_nodes` | A | Bulk admin. |

### Logs (2)
| Tool | Role | Notes |
|---|---|---|
| `add_log` | I | Core intention write. **Same surface as `quick_log`** — consolidate. |
| `get_logs` | B | Read. |

### Organizations (4)
| Tool | Role | Notes |
|---|---|---|
| `list_organizations` | B | Setup belief. Rare. |
| `get_organization` | B | Setup. |
| `create_organization` | A | Setup admin. |
| `update_organization` | A | Setup admin. |

**Move all 4 to `ap_admin_*` namespace.** Agents almost never call these.

### Goals (8)
| Tool | Role | Notes |
|---|---|---|
| `list_goals` | B | **Cowork briefing call.** Core belief. |
| `get_goal` | B | Single-goal read. |
| `create_goal` | A/D | Rare, human-driven. |
| `update_goal` | A/D | Rare, human-driven. |
| `link_plan_to_goal` | D | Connects desire to plan. |
| `unlink_plan_from_goal` | D | Reverse. |
| `goal_path` | B | Dependency path read. |
| `goal_progress` | B | Computed progress read. |
| `add_achiever` | D | Link task to goal. |
| `remove_achiever` | D | Reverse. |
| `goal_knowledge_gaps` | B | Gap detection. |

### Cross-plan dependencies (3)
| Tool | Role | Notes |
|---|---|---|
| `create_cross_plan_dependency` | A | Admin. |
| `list_cross_plan_dependencies` | B | Belief. |
| `create_external_dependency` | A | External vendor blocker. Admin. |

### Knowledge graph (5)
| Tool | Role | Notes |
|---|---|---|
| `add_learning` | I | Core intention write. **Cowork autopilot abuses this for fake decisions.** |
| `recall_knowledge` | B | Core belief query. Keep. |
| `find_entities` | B | Entity-shaped query. |
| `check_contradictions` | B | Belief. |
| `get_recent_episodes` | B | Used by Cowork briefing — needs `since` and `entry_type` filters, currently has neither. |

### Onboarding (1)
| Tool | Role | Notes |
|---|---|---|
| `get_started` | U | Bootstrapping for new agents. Keep. |

## Persona × tool heatmap (top tools per caller, 80% workload)

Inferred from autopilot prompt, briefing prompt, this conversation's session, and existing `ap` CLI commands.

| Persona | Top tools today | Token cost | Friction observed |
|---|---|---|---|
| **Cowork autopilot** | `check_goals_health`, `add_learning(entry_type=decision)`, `quick_log`, `quick_status` | medium | Fakes decisions via add_learning. No `queue_decision`. No `resolve_decision`. |
| **Cowork briefing** | `check_goals_health`, `get_recent_episodes`, `get_my_tasks`, `list_goals` | high (4 calls/render) | No bundled briefing. No `as_of`. No `since` filter on episodes. |
| **Claude Code / `ap` CLI** | `get_task_context`, `claim_task`, `add_log`, `quick_status`, `release_task` | medium | 3 calls per status update (status + log + release). No `update_task` atomic. |
| **OpenClaw multi-agent** | `claim_task`, `get_task_context`, `update_node`, `add_log`, `release_task` | medium | Same as Code plus no claim heartbeat, no peer-aware `claim_next_task`. |

## Evidence from real callers

### From the autopilot prompt (mission-control-autopilot, scheduled 07:00 weekdays)

> "To queue, create a knowledge episode via `add_learning` with entry_type=decision and a title prefixed 'DECISION NEEDED:'."

**This is a workaround.** AP already has a real decisions table — `dashboard.routes.js:88` calls `decisionsDal.listByPlan(planId, { status: 'pending' })`. Not exposed in MCP. Autopilot is forced to misuse the knowledge graph.

> "Pick the single most leveraged unblocking action available right now — prefer the bottleneck with the highest direct_downstream_count"

**Direct_downstream_count is in the response of `check_goals_health`** — but autopilot has to sort the goals and bottlenecks itself. Could be pre-sorted server-side.

### From the briefing prompt (mission-control-briefing, scheduled weekday morning)

> Steps: fetch state in parallel: `check_goals_health`, `get_recent_episodes(max_episodes 15)`, `get_my_tasks`, `list_goals`.

**Four MCP round trips per artifact render.** Cowork artifact refreshes auto-trigger this on open. Bundling these into one `briefing()` call saves ~75% of round trips.

> "look for entries from the last 24h, especially any title starting with 'DECISION NEEDED:'"

**Title-prefix scan.** Brittle — if the autopilot prompt drifts on the prefix, decisions get lost. `get_recent_episodes` has no `since` filter, no `entry_type` filter, no `title_prefix` filter.

### From this session's MCP usage

- `update_node` returned 400 errors on existing tasks 3 times across this session. Schema is permissive (most fields optional) but server-side validation is opaque — agents have no way to know which combinations are rejected.
- `add_achiever` failed with the wrong arg name (`plan_id` vs `node_id`) — schema discoverability is poor when calling without ToolSearch.
- `quick_plan` requires `tasks` non-empty — no way to create an empty plan with a description-only seed via this entry point. Forces fallback to `create_plan`.

### From the `ap` CLI

`ap` commands map to **3 underlying calls** for `start`/`blocked`/`done`:
1. `quick_status` (or `update_node`)
2. `add_log`
3. `claim_task` / `release_task`

A single atomic `update_task(id, status, log_message?, release_claim?)` would collapse this. Idempotent, one round trip.

## Top 10 friction points (evidence-ranked)

1. **No decisions surface.** Autopilot fakes decisions in knowledge graph. Briefing pattern-matches title prefixes. Real `decisionsDal` exists but no MCP wrapper.
2. **No bundled briefing.** Cowork makes 4 calls per artifact refresh. `briefing()` would replace.
3. **No `as_of` timestamps.** Cowork can't render stale-data warnings. No cache freshness signaling.
4. **No `since` / `entry_type` filters on `get_recent_episodes`.** Forces wasteful 15-episode pulls + client-side filtering.
5. **No atomic `update_task`.** Status + log + release is 3 calls today.
6. **No `claim_next_task` bundle.** Today: `suggest_next_tasks` → `claim_task` → `get_task_context` is 3 calls. Bundle into one.
7. **No aggregate counts on `check_goals_health`.** Autopilot has to tally on_track/at_risk/stale itself.
8. **CRUD tools dominate.** `create_node`, `update_node`, `delete_node`, `move_node`, `batch_update_nodes` — agents reach for these instead of intention-shaped tools.
9. **63 tools is too many to discover.** Tool description quality is uneven. Some are 1 line ("Update an existing plan") with no agent guidance.
10. **No deprecation signaling.** Old shapes coexist with new (`quick_status` and `update_node` both update status). Agents pick inconsistently.

## Reference MCP patterns worth borrowing

(Light treatment — full refs in Plan phase.)

- **Linear MCP**: bundles "what's assigned to me + recent activity" into a single `getMyIssues` shape. Decisions surface as first-class objects with stable IDs.
- **GitHub MCP**: tools are intent-named (`create_issue`, `add_comment`) not CRUD-named. Read tools return rich denormalized payloads (issue + comments + reactions in one).
- **Asana MCP**: explicit `getMyTasks(due_within_days)` shape. Task context bundles project + section + dependencies in one call.

**Common pattern**: the best MCPs ship ~10-25 tools, each answering one whole workflow question. AP at 63 is roughly 3x too many.

**Common anti-pattern**: avoid AP's split between `get_plan_context`, `get_plan_summary`, `get_plan_structure`. Three nearly-identical reads with different fields. Pick one, parameterize depth.

## Proposed target surface (input to Plan phase)

~15 tools across 4 namespaces. Final list deferred to Plan phase, but the shape:

### Beliefs (state queries) — 5-6 tools
- `briefing(scope?)` — bundled mission control state with `as_of`
- `task_context(task_id, depth?)` — successor of `get_task_context`, depth=1..4
- `goal_state(goal_id)` — single-goal deep dive
- `recall_knowledge(query, scope?, since?, entry_type?)` — successor of `recall_knowledge` + `get_recent_episodes` + `find_entities`
- `search(query, scope?)` — universal search, kept

### Desires (goal management) — 2-3 tools
- `list_goals(filter?)` — kept
- `update_goal(id, ...)` — kept; create/update/link/unlink subsumed
- `add_achiever(goal_id, node_id, weight?)` — kept

### Intentions (action commitment) — 5-6 tools
- `claim_next_task(scope, ttl?)` — bundles suggest + claim + load context
- `update_task(id, status, log_message?, release_claim?)` — atomic; replaces `quick_status` + `add_log` + `release_task` for the common case
- `release_task(id)` — kept atomic for explicit handoff
- `queue_decision(title, context, options, recommendation, smallest_input_needed)` — **new**, real decision queue
- `resolve_decision(id, action, message?)` — **new**
- `add_learning(content, scope?)` — kept

### Admin (humans editing structure) — namespaced `ap_admin_*`
- `ap_admin_plan_create`, `ap_admin_plan_update`, `ap_admin_plan_delete`, `ap_admin_plan_share`
- `ap_admin_node_create`, `ap_admin_node_update_structure`, `ap_admin_node_delete`, `ap_admin_node_move`
- `ap_admin_dependency_create`, `ap_admin_dependency_delete`
- `ap_admin_rpi_chain_create`
- `ap_admin_org_*`

### Utility — 1 tool
- `get_started` — kept

## Open questions for Plan phase

1. Should `briefing()` be parameterized by audience (`cowork_morning` vs `code_session_start`) or always return a superset and let callers pick fields?
2. Decision queue — wrap existing `decisionsDal` (PostgreSQL `decisions` table) or also surface `agent_requests` from node fields? Two systems exist today; should they merge in v0.9?
3. CLI alignment — does every `ap` subcommand map 1:1 to a single new MCP tool? If yes, the CLI becomes a thin wrapper — confirm with commands list.
4. Deprecation signaling — use `deprecated: true` field in MCP tool schema (if supported by spec), or just prefix description with `[DEPRECATED]`? Check 2025-11-25 protocol version.
5. Telemetry hooks — every new tool should emit `module_metrics` rows (per the metrics plan). Standardize the emit shape now or per-tool?

## Next phase

Move to Plan task `0fb523a3` — design the final tool specs, response shapes (with `as_of`), error contracts, deprecation strategy, and CLI alignment table. **Plan phase ends in human review gate** — Michael approves before Implement begins.
