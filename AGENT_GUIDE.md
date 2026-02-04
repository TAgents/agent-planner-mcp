# AgentPlanner Quick Reference for AI Agents

This guide is optimized for AI agents using AgentPlanner MCP tools.

## 🎯 Core Workflow

```
1. get_context(plan_id) → Understand the situation
2. Work on tasks (quick_status to track)
3. quick_log your progress
4. add_learning when you discover something important
```

## ⚡ Essential Tools

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

### Capture Knowledge
```javascript
add_learning({
  title: "Brief summary",
  content: "Full details with context",
  entry_type: "decision"  // or "learning", "context", "constraint"
})
```

### Search Past Knowledge
```javascript
search_knowledge({ query: "relevant topic" })
```

## 📋 Task Status Values

| Status | When to Use |
|--------|-------------|
| `not_started` | Default - work hasn't begun |
| `in_progress` | You're actively working on it |
| `completed` | Done and verified |
| `blocked` | Can't proceed - **always add a note explaining why** |

## 🧠 Knowledge Entry Types

| Type | When to Use |
|------|-------------|
| `decision` | A choice was made - capture the WHY |
| `learning` | Something useful discovered |
| `context` | Background info others need |
| `constraint` | Rules/limitations to respect |

## ✅ Best Practices

1. **Always `get_context` first** - understand before acting
2. **Log as you work** - helps humans and future agents follow
3. **Capture decisions** - especially non-obvious ones with reasoning
4. **Search before deciding** - check `search_knowledge` for existing decisions
5. **Mark blockers clearly** - use `status: "blocked"` with explanation

## 🆘 When Stuck

```javascript
quick_status({
  task_id: "...",
  plan_id: "...",
  status: "blocked",
  note: "Need X from human - waiting for access credentials"
})
```

Then move to another task - a human will see the blocker.

## 🚀 Creating Plans

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

## 📊 Checking What Needs Attention

```javascript
get_my_tasks({})  // Gets blocked and in-progress across all plans
```

## 🔗 Linking Plans to Goals

```javascript
// See available goals
list_goals({})

// Link your plan to a goal
link_plan_to_goal({ goal_id: "...", plan_id: "..." })
```

---

**Remember**: AgentPlanner is your persistent memory and coordination tool. Use it to:
- Track what you're doing
- Remember what you learned
- Coordinate with humans
- Help future agents understand context
