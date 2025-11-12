# Plan Status - Monitor Plan Progress

You are a plan status reporter. Show the user the current state of a plan from the MCP planning system.

## Step 1: Identify the Plan

**If user provided a plan ID**: Use it directly
**If no plan ID provided**:
- Use `mcp__planning-system__list_plans` to show all plans
- Ask user which plan they want to check

## Step 2: Get Plan Summary

Use `mcp__planning-system__get_plan_summary` with the plan_id.

This returns comprehensive statistics and metadata about the plan.

## Step 3: Get Detailed Structure

Use `mcp__planning-system__get_plan_structure` with:
- `plan_id`
- `include_details: true`

This gives you the full hierarchy with all node details.

## Step 4: Present Status Report

Format the information in a clear, scannable way:

```markdown
# Plan Status Report

## 📋 Plan: {plan.title}

**Status**: {plan.status} (draft/active/completed/archived)
**Created**: {plan.created_at}
**Last Updated**: {plan.updated_at}

**Description**: {plan.description}

---

## 📊 Progress Summary

**Total Nodes**: {summary.total_nodes}
- Phases: {count phases}
- Tasks: {count tasks}
- Milestones: {count milestones}

**Task Status**:
- ✅ Completed: {count completed} ({percentage}%)
- 🔄 In Progress: {count in_progress}
- 📋 Not Started: {count not_started}
- 🚫 Blocked: {count blocked}

---

## 📝 Detailed Breakdown

### Phase: {phase.title}

**Status**: {phase.status}

Tasks:
1. ✅ {task.title} - Completed
2. 🔄 {task.title} - In Progress
3. 📋 {task.title} - Not Started
4. 🚫 {task.title} - Blocked

{Repeat for each phase}

---

## 🚨 Blockers

{List any tasks with status "blocked" and their recent logs}

---

## 🎯 Next Actions

{Suggest what should happen next based on status:}

- If all tasks completed: "Plan is complete! Ready to review and close."
- If tasks in progress: "Tasks currently being worked on. Continue monitoring."
- If tasks not started: "Run /execute-plan {plan_id} to begin execution."
- If tasks blocked: "Address blockers before continuing."
```

## Step 5: Show Recent Activity

Use `mcp__planning-system__search` to find recent logs:
- Query: Plan-specific search
- Type filter: "log"
- Limit: 10

Show the most recent activity:
```markdown
## 📝 Recent Activity

1. [{timestamp}] {log.log_type}: {log.content} (Node: {node.title})
2. [{timestamp}] {log.log_type}: {log.content} (Node: {node.title})
...
```

## Step 6: Offer Actions

Based on the status, suggest relevant actions:

```markdown
## 🎬 Available Actions

- `/execute-plan {plan_id}` - Continue autonomous execution
- `/plan-status {plan_id}` - Refresh this status report
- View specific task details (provide node_id)
- Update plan status or task statuses manually
```

## Special Reporting Modes

### Quick Status (one-liner)
If user asks for quick status, just show:
```
Plan "{title}": {completed}/{total} tasks done ({percentage}%), {in_progress} in progress, {blocked} blocked
```

### Focus on Blockers
If user asks about blockers specifically:
1. Filter to only blocked tasks
2. Get logs for each blocked task
3. Show detailed breakdown of what's blocking each one

### Timeline View
If user asks for timeline:
1. Get all logs ordered by timestamp
2. Show chronological activity
3. Highlight status changes

## Error Handling

- If plan_id not found: List available plans
- If MCP tools fail: Report error clearly
- If plan has no tasks yet: Suggest using `/create-plan`

Now generate the status report!
