# AgentPlanner Quick Reference (v1.0.0)

Tight cheat sheet for AI agents. Full docs: [SKILL.md](SKILL.md). Migration history: [docs/MIGRATION_v0.9.md](docs/MIGRATION_v0.9.md), [docs/MIGRATION_v1.0.md](docs/MIGRATION_v1.0.md).

## Start here

```
get_started()
// → Returns the BDI tool surface map and recommended workflows
```

## The 24 tools

### Beliefs (read state)
| Tool | When |
|---|---|
| `briefing` | Mission control loops, dashboard refresh, daily check-in |
| `task_context` | Loading context for a specific task; depth 1-4 |
| `goal_state` | Single goal deep-dive |
| `recall_knowledge` | Search facts, entities, episodes, contradictions |
| `search` | Text search across plans/nodes |
| `plan_analysis` | Impact, critical path, bottlenecks, coherence |

### Desires (goals)
| Tool | When |
|---|---|
| `list_goals` | Goal list with health summary |
| `update_goal` | Atomic goal change (subsumes link/unlink/achievers) |
| `derive_subgoal` | Propose a sub-goal under an existing parent (top-level goals stay UI-only) |

### Intentions — execution
| Tool | When |
|---|---|
| `claim_next_task` | Pick + claim + load context (one call) |
| `update_task` | Atomic status+log+release+learning |
| `release_task` | Explicit handoff |
| `queue_decision` | Escalate to human (real decision queue) |
| `resolve_decision` | Pick up human's answer |
| `add_learning` | Write to knowledge graph |

### Intentions — creation (v1.0)
| Tool | When |
|---|---|
| `form_intention` | Create plan + initial tree under a goal, atomically |
| `extend_intention` | Add children under existing parent (lightweight, no queue) |
| `propose_research_chain` | RPI triple with 2 blocking edges in one call |

### Intentions — structural mutation (v1.0)
| Tool | When |
|---|---|
| `update_plan` | Edit plan title/description/status/visibility/metadata |
| `update_node` | Edit any node property except status |
| `move_node` | Reparent within plan; cycle-safe |
| `link_intentions` | Create dependency edge between two tasks |
| `unlink_intentions` | Remove a dependency edge |
| `delete_plan` | Soft-delete via status='archived' |
| `delete_node` | Soft-delete via status='archived' |

### Intentions — sharing & collaboration (v1.0)
| Tool | When |
|---|---|
| `share_plan` | Atomic visibility change + add/remove collaborators |
| `invite_member` | Add user to organization |
| `update_member_role` | Owner-only role change |
| `remove_member` | Owner/admin removes non-owner member |

## status='active' vs status='draft' (v1.0)

The single most important decision when calling a creation tool.

| Origin | Default | Why |
|---|---|---|
| **Human said so in chat** | `status='active'` (omit) | User already approved by asking. Don't bury their request in drafts. |
| **You're acting autonomously** | `status='draft'` (pass explicitly) | Let the human review before it activates. Drafts surface in the dashboard pending queue. |
| **You're uncertain** | use `queue_decision` instead | Drafts are for "I'm proposing structure"; the queue is for "I need an answer." |

Drafts auto-promote to active when work begins on any node (transitions to `in_progress`, `completed`, `blocked`, `plan_ready`). Promote explicitly via `update_plan({status: 'active'})` or `update_goal({status: 'active'})`.

## Workflow templates

### A) Mission control (Cowork autopilot)
```
briefing → check goal_health.summary
        → top_recommendation? act
        → at_risk goals? goal_state(goal_id)
            → if you can plan it: derive_subgoal + form_intention (status='draft')
            → if reversible: update_task or update_goal
            → if uncertain: queue_decision
        → add_learning to record
```

### B) Single task (Claude Code, ap CLI)
```
claim_next_task(scope={plan_id})
update_task(status='in_progress')
... work ...
update_task(status='completed', log_message=..., add_learning=...)
```

### C) Multi-agent (OpenClaw)
```
claim_next_task(ttl_minutes=30)
task_context(depth=4) for refreshes
update_task(...) for transitions
release_task(message='handoff') for explicit handover
```

### D) Human-directed restructure (v1.0)
User: "Rename the launch plan to 'Public Beta', mark it active, and add me as editor on the auth plan."
```
update_plan({plan_id: '<launch>', title: 'Public Beta', status: 'active'})
share_plan({plan_id: '<auth>', add_collaborators: [{user_id: '<user>', role: 'editor'}]})
```
No UI required.

### E) Autonomous proposal (v1.0)
You spotted a gap during a scheduled tick.
```
derive_subgoal({parent_goal_id, title, rationale, status: 'draft'})
form_intention({goal_id: <new>, title, rationale, status: 'draft', tree: [...]})
// Both surface in the dashboard pending queue. Human reviews and either:
//   - tells you "approve them" → update_goal/update_plan({status: 'active'}) for each
//   - tells you "archive" → update_plan({status: 'archived'}) for each
```

## Decision rule

When in doubt between act and queue:
- Reversible local action (status, log, learning, edit, decompose) → **act** via `update_task`, `update_node`, `extend_intention`, `add_learning`
- External cost, public publish, strategy change, customer comm → **queue** via `queue_decision`
- Whole new direction or sub-goal you weren't asked for → propose as **draft** via `form_intention` / `derive_subgoal` with `status='draft'`

Never use `add_learning(entry_type='decision')` to fake a decision queue. `queue_decision` is the real tool.

## Atomic patterns to remember

- `update_task` does status + log + claim release + learning in one call. Don't decompose.
- `claim_next_task` does suggest + claim + context. Don't decompose.
- `briefing` does goals + decisions + tasks + activity + recommendation. Don't decompose.
- `form_intention` creates plan + tree atomically. Don't trickle node-by-node.
- `share_plan` does visibility + add + remove in one call. Don't fan out.

## Output discipline

- Every response carries `as_of` — surface this on live artifacts to indicate freshness.
- Every tool degrades gracefully on partial upstream failure — check `failures[]` if present.
- Keep follow-up calls minimal — these tools are designed to bundle.
