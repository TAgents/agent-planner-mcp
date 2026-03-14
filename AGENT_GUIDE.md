# AgentPlanner Quick Reference for AI Agents

This guide is optimized for AI agents using AgentPlanner MCP tools.

## Core Workflow

```
1. suggest_next_tasks(plan_id) → Find ready tasks (dependency-aware)
2. get_task_context(node_id, depth=2) → Load progressive context
3. Work on tasks (quick_status to track)
4. quick_log your progress
5. add_learning when you discover something important
6. recall_knowledge before making decisions (check cross-plan history)
```

## Essential Tools

### Before Starting Work
```javascript
get_context({ plan_id: "..." })
```
Returns: statistics, blocked tasks, in-progress tasks, ready tasks, knowledge

### Update Task Status
```javascript
quick_status({
  task_id: "...",
  plan_id: "...",
  status: "in_progress"  // or "completed" or "blocked"
})
```

### Log Progress
```javascript
quick_log({
  task_id: "...",
  plan_id: "...",
  message: "What I did or learned"
})
```

### Check What Needs Attention
```javascript
get_my_tasks({})  // Gets blocked and in-progress across all plans
check_goals_health({})  // Health dashboard for all goals
```

### Claim a Task Before Working
```javascript
claim_task({ task_id: "...", plan_id: "...", ttl_minutes: 30 })
// When done or abandoning:
release_task({ task_id: "...", plan_id: "..." })
```

## Temporal Knowledge Graph

AgentPlanner includes a temporal knowledge graph for persistent, cross-plan knowledge. Five tools for reading and writing knowledge:

### add_learning - Record Knowledge
Writes to the temporal knowledge graph. Use after research, decisions, and discoveries.
```javascript
add_learning({
  content: "Detailed description of what you learned or decided",  // required
  title: "Short title",
  entry_type: "decision",  // decision | learning | context | constraint
  plan_id: "...",           // optional: link to plan
  node_id: "..."            // optional: link to task
})
```

### recall_knowledge - Search Cross-Plan Knowledge
Searches temporal knowledge graph across ALL plans.
```javascript
recall_knowledge({
  query: "what auth pattern did we choose?",  // required
  max_results: 10
})
```

### find_entities - Search Entity Nodes
Returns entities (technologies, people, patterns) with their relationships from the knowledge graph.
```javascript
find_entities({
  query: "FalkorDB",  // required
  max_results: 10
})
```

### check_contradictions - Detect Outdated Facts
Returns current and superseded facts. Use before making decisions to avoid acting on stale information.
```javascript
check_contradictions({
  query: "deployment strategy",  // required
  max_results: 10
})
```

### get_recent_episodes - Temporal History
Returns recent knowledge episodes in chronological order. Useful for understanding what happened recently.
```javascript
get_recent_episodes({
  max_episodes: 10
})
```

### Knowledge Entry Types

| Type | When to Use |
|------|-------------|
| `decision` | A choice was made - capture the WHY |
| `learning` | Something useful discovered |
| `context` | Background info others need |
| `constraint` | Rules/limitations to respect |

## Dependencies & Impact Analysis

### suggest_next_tasks - Find Ready Work
Returns tasks where all upstream blockers are completed, prioritized by RPI chain position and downstream impact.
```javascript
suggest_next_tasks({ plan_id: "..." })
```

### get_task_context - Progressive Context Loading
```javascript
get_task_context({
  node_id: "...",
  depth: 2,        // 1=task only, 2=+siblings+deps, 3=+knowledge, 4=+plan+goals
  token_budget: 0  // 0=unlimited, or max tokens to stay within context window
})
```

### create_dependency - Link Tasks
```javascript
create_dependency({
  plan_id: "...",
  source_node_id: "...",  // this node...
  target_node_id: "...",  // ...blocks this node
  dependency_type: "blocks"  // blocks | requires | relates_to
})
```

### analyze_impact - What-If Analysis
```javascript
analyze_impact({
  plan_id: "...",
  node_id: "...",
  scenario: "block"  // delay | block | remove
})
```

## RPI Chains (Research -> Plan -> Implement)

For complex tasks, decompose into a 3-step chain with blocking dependencies:

```javascript
create_rpi_chain({
  plan_id: "...",
  parent_id: "...",  // phase to add chain under
  title: "Auth Service",
  research_description: "Research auth patterns for microservices"
})
```

Creates 3 tasks:
- **Research** (R) - Investigate, log findings
- **Plan** (P) - Design approach, mark `plan_ready` for human review
- **Implement** (I) - Build it (automatically gets compacted research context)

Task modes: `research`, `plan`, `implement`, `free`

## Task Status Values

| Status | When to Use |
|--------|-------------|
| `not_started` | Default - work hasn't begun |
| `in_progress` | You're actively working on it |
| `completed` | Done and verified |
| `blocked` | Can't proceed - **always add a note explaining why** |
| `plan_ready` | Plan phase complete - waiting for human review |

## Creating Plans

### Quick (Most Common)
```javascript
quick_plan({
  title: "Plan Name",
  tasks: ["Task 1", "Task 2", "Task 3"]
})
```

### From Markdown
```javascript
import_plan_markdown({
  markdown: `
# Plan Title

## Phase 1
- Task A
- Task B

## Phase 2
- Task C
`
})
```

## Linking Plans to Goals

```javascript
list_goals({})
link_plan_to_goal({ goal_id: "...", plan_id: "..." })
```

## When Stuck

```javascript
quick_status({
  task_id: "...",
  plan_id: "...",
  status: "blocked",
  note: "Need X from human - waiting for access credentials"
})
```

Then move to another task - a human will see the blocker.

## Autonomous Goal-Driven Loop (Quick Reference)

For periodic/cron-driven agents, follow this 5-phase pattern:

```
Phase 1: ORIENT   → check_goals_health()
Phase 2: PLAN     → get_goal() → recall_knowledge() → quick_plan({..., goal_id})
Phase 3: DECOMPOSE→ create_rpi_chain() for complex tasks
Phase 4: EXECUTE  → suggest_next_tasks() → claim_task() → work → quick_log() → quick_status("completed")
Phase 5: REPORT   → quick_log({..., log_type: "completion"})
```

Key rules:
- **Always claim before working** — `claim_task()` prevents agent collisions
- **Always link plans to goals** — enables health tracking
- **Log decisions and learnings** — `add_learning()` persists cross-plan
- **Check contradictions first** — `check_contradictions()` before acting on old knowledge

## Best Practices

1. **Use `get_task_context` instead of `get_context`** - progressive depth gives you exactly what you need
2. **Check dependencies before starting** - use `suggest_next_tasks` to find what's ready
3. **Log as you work** - helps humans and future agents follow
4. **Record important findings** - use `add_learning` after research, decisions, and discoveries
5. **Search before deciding** - check `recall_knowledge` for existing decisions across all plans
6. **Check for contradictions** - use `check_contradictions` before acting on remembered facts
7. **Mark blockers clearly** - use `status: "blocked"` with explanation

---

**Remember**: AgentPlanner is your persistent memory and coordination tool. Use it to track what you're doing, remember what you learned, coordinate with humans, and help future agents understand context.
