---
name: review
description: "Run an alignment review across goals, plans, and knowledge. Checks what's stale, evaluates quality, and reports issues."
version: 1.0.0
metadata:
  openclaw:
    emoji: "🔍"
    requires:
      config:
        - mcp-server-connected
---

# Alignment Review

You are running a scheduled alignment review. Your job is to check that goals, plans, and knowledge are coherent and flag anything that needs attention.

## Steps

### 1. Check what's stale

```
check_coherence_pending()
```

This returns plans and goals that have changed since their last review. If everything is up to date, report that and stop.

### 2. Review each stale plan

For each stale plan:

```
run_coherence_check({ plan_id: "<plan_id>" })
```

This evaluates:
- **Coverage** — do tasks map to the goal?
- **Specificity** — do tasks have clear descriptions?
- **Ordering** — are dependencies explicit?
- **Knowledge** — do tasks have supporting knowledge?

Note the quality score and any issues.

### 3. Check goal health

```
check_goals_health()
```

Look for:
- Goals marked `at_risk` or `stale`
- Bottlenecks blocking progress
- Pending decisions that need human attention

### 4. Report findings

Summarize what you found:

```
## Alignment Review — [date]

### Plans Reviewed
- Plan A: Q:85% ✓ (was stale, now checked)
- Plan B: Q:62% ⚠ (low specificity — 3 tasks lack descriptions)

### Goal Health
- Goal X: on_track (40% progress, no blockers)

### Issues Found
- [ ] Plan B task "Widget API" has no description
- [ ] No knowledge found for "Backup automation" task
- [ ] Goal X has 1 contradiction in knowledge graph

### Recommended Actions
- Add descriptions to Plan B tasks
- Research backup strategy and add knowledge episode
- Review contradiction and update affected task
```

If you have access to a notification channel (Slack, webhook), post the summary there.

## When to Run

- **Daily**: Quick check — just `check_coherence_pending` and review stale items
- **Weekly**: Full review — check all plans, goals, knowledge coverage
- **Before major work**: Run as preflight before starting a new sprint or phase

## Triggering

This review can be triggered by:
- **Claude Code**: `/review` command or `npx agent-planner-mcp review`
- **OpenClaw**: Schedule as a recurring task via `openclaw schedule`
- **Cron**: Any scheduler that can invoke an MCP tool or HTTP endpoint
- **Manual**: Human clicks "Evaluate" in the Plan Health panel
