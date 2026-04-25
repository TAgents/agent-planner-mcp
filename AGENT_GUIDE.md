# AgentPlanner Quick Reference (v0.9.0)

Tight cheat sheet for AI agents. Full docs: [SKILL.md](SKILL.md). Migration from 0.8.x: [docs/MIGRATION_v0.9.md](docs/MIGRATION_v0.9.md).

## Start here

```
get_started()
// → Returns the BDI tool surface map and recommended workflows
```

## The 15 tools

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

### Intentions (act)
| Tool | When |
|---|---|
| `claim_next_task` | Pick + claim + load context (one call) |
| `update_task` | Atomic status+log+release+learning |
| `release_task` | Explicit handoff |
| `queue_decision` | Escalate to human |
| `resolve_decision` | Pick up human's answer |
| `add_learning` | Write to knowledge graph |

## Three workflow templates

### A) Mission control (Cowork autopilot)
```
briefing → check goal_health.summary
        → top_recommendation? act
        → at_risk goals? goal_state(goal_id), then update_task or queue_decision
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

## Decision rule

When in doubt between act and queue:
- Reversible local action (status, log, learning) → **act** via `update_task` / `add_learning`
- External cost, public publish, strategy change, customer comm → **queue** via `queue_decision`

Never use `add_learning(entry_type='decision')` to fake a decision queue. `queue_decision` is a real tool now.

## Atomic patterns to remember

- `update_task` does status + log + claim release + learning in one call. Don't decompose.
- `claim_next_task` does suggest + claim + context. Don't decompose.
- `briefing` does goals + decisions + tasks + activity + recommendation. Don't decompose.

## Output discipline

- Every response carries `as_of` — surface this on live artifacts to indicate freshness.
- Every tool degrades gracefully on partial upstream failure — check `meta.failures` if present.
- Keep follow-up calls minimal — these tools are designed to bundle.
