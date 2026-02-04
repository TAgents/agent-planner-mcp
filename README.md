# AgentPlanner MCP Server

A Model Context Protocol (MCP) server for [AgentPlanner.io](https://agentplanner.io) - enabling AI agents to create, manage, and execute structured plans.

## 🚀 Quick Start

### For OpenClaw Agents

Add to your OpenClaw config:

```yaml
mcp:
  servers:
    agentplanner:
      command: npx
      args: ["-y", "@tagents/agent-planner-mcp"]
      env:
        API_URL: https://api.agentplanner.io
        USER_API_TOKEN: your_token_here
```

Get your API token at: https://www.agentplanner.io/app/settings

### For Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentplanner": {
      "command": "npx",
      "args": ["-y", "@tagents/agent-planner-mcp"],
      "env": {
        "API_URL": "https://api.agentplanner.io",
        "USER_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

---

## 🎯 Tool Overview

### Quick Actions (Start Here!)

Low-friction tools for common operations:

| Tool | Purpose | Example |
|------|---------|---------|
| `quick_plan` | Create plan + tasks in one call | "Create a plan for the product launch with these tasks..." |
| `quick_task` | Add a single task | "Add a task to review the PR" |
| `quick_status` | Update task status | "Mark task X as completed" |
| `quick_log` | Log progress | "Note that I've finished the API integration" |

### Context Loading

Get everything you need before starting work:

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `get_context` | Full context for plan/goal | **Always call first** before working on a plan |
| `get_my_tasks` | Tasks needing attention | Heartbeat check-ins, "what should I work on?" |
| `get_started` | Usage guidance | When you're new or unsure how to proceed |

### Knowledge Management

Build persistent memory across sessions:

| Tool | Purpose |
|------|---------|
| `add_learning` | Capture insights, decisions, context |
| `search_knowledge` | Find relevant past knowledge |
| `add_knowledge_entry` | Full knowledge entry with metadata |

### Markdown Import/Export

Filesystem-friendly plan management:

| Tool | Purpose |
|------|---------|
| `export_plan_markdown` | Export plan as markdown text |
| `import_plan_markdown` | Create plan from markdown |

### Goals & Organizations

| Tool | Purpose |
|------|---------|
| `list_goals` | See all objectives |
| `get_goal` | Goal details with linked plans |
| `link_plan_to_goal` | Connect plan to objective |
| `list_organizations` | See your organizations |

### Full CRUD (When You Need More Control)

Plans, nodes, artifacts, logs, search, and more - see [Full Tool Reference](#full-tool-reference).

---

## 📖 Recommended Workflows

### Starting Work on a Plan

```
1. get_context(plan_id: "...")
   → See status, blocked tasks, recent activity, knowledge

2. Review needs_attention.blocked first
   → Unblock or escalate blocked tasks

3. Pick a task from needs_attention.in_progress or ready_to_start

4. quick_status(task_id, plan_id, "in_progress")
   → Mark it as started

5. Do the work...

6. quick_log(task_id, plan_id, "What I did...")
   → Document progress

7. quick_status(task_id, plan_id, "completed")
   → Mark done, see next_tasks in response
```

### Creating a New Plan

```
1. quick_plan(
     title: "My Plan",
     tasks: ["Task 1", "Task 2", "Task 3"],
     goal_id: "optional-goal-id"
   )
   → Returns plan_id, task_ids, plan_url

2. Add more structure if needed with create_node
```

### Capturing Knowledge

```
# After making a decision
add_learning(
  title: "Chose PostgreSQL over MongoDB",
  content: "We decided on PostgreSQL because...",
  entry_type: "decision",
  tags: ["database", "architecture"]
)

# Before making a decision
search_knowledge(query: "database decisions")
→ Check what's already been decided
```

### Importing from Markdown

```
import_plan_markdown(markdown: """
# Product Launch Plan

## Phase 1: Preparation
- Create landing page
- Write documentation
- ✅ Set up analytics

## Phase 2: Launch
- Send announcement email
- Post on social media
""")
→ Creates structured plan with phases and tasks
```

---

## 🧠 Best Practices for Agents

### 1. Always Load Context First

Before working on any plan, call `get_context`. This gives you:
- Current progress and statistics
- Blocked tasks that need attention
- Recent activity
- Relevant knowledge

### 2. Log As You Work

Use `quick_log` to document:
- What you're doing
- Decisions made
- Blockers encountered
- Lessons learned

This helps humans follow your work and helps future agents understand what happened.

### 3. Capture Knowledge

When you learn something important, store it:
- **Decisions**: Why something was chosen
- **Constraints**: Rules that must be followed
- **Learnings**: What worked or didn't
- **Context**: Background information

Use `add_learning` or `add_knowledge_entry` - this persists beyond your session!

### 4. Handle Blockers Gracefully

When stuck:
```
quick_status(task_id, plan_id, "blocked", note: "Need API credentials from admin")
```

This:
- Marks the task so humans see it
- Logs the reason
- Lets you move to other tasks

### 5. Check Before Deciding

Before making significant decisions:
```
search_knowledge(query: "relevant topic")
```

Past decisions, constraints, or context might already exist.

---

## 🔧 Full Tool Reference

### Quick Actions

#### `quick_plan`
Create a plan with tasks in one call.

```javascript
{
  title: "Plan Title",           // Required
  description: "Description",    // Optional
  tasks: ["Task 1", "Task 2"],  // Required - list of task titles
  goal_id: "goal-uuid"          // Optional - link to goal
}
// Returns: plan_id, plan_url, task_ids, tasks[]
```

#### `quick_task`
Add a single task to a plan.

```javascript
{
  plan_id: "plan-uuid",         // Required
  title: "Task Title",          // Required
  description: "Details",       // Optional
  phase_id: "phase-uuid",       // Optional - uses first phase if not provided
  agent_instructions: "..."     // Optional - guidance for agents
}
// Returns: task_id, task_url
```

#### `quick_status`
Update task status.

```javascript
{
  task_id: "task-uuid",         // Required
  plan_id: "plan-uuid",         // Required
  status: "completed",          // Required: not_started|in_progress|completed|blocked
  note: "Optional note"         // Optional - auto-logged if provided
}
// Returns: success, next_tasks (for completed), suggestion
```

#### `quick_log`
Add progress note.

```javascript
{
  task_id: "task-uuid",         // Required
  plan_id: "plan-uuid",         // Required
  message: "What happened",     // Required
  log_type: "progress"          // Optional: progress|decision|blocker|completion
}
```

### Context Loading

#### `get_context`
Load everything for a plan or goal.

```javascript
{
  plan_id: "plan-uuid",         // Optional
  goal_id: "goal-uuid",         // Optional
  include_knowledge: true       // Default: true
}
// Returns: plan, statistics, progress_percentage, needs_attention, 
//          recent_activity, plan_knowledge, recommendation
```

#### `get_my_tasks`
Get tasks needing attention.

```javascript
{
  plan_id: "plan-uuid",         // Optional - checks all plans if not provided
  status: ["blocked", "in_progress"]  // Default
}
// Returns: needs_attention[], ready_to_start[], summary
```

#### `get_started`
Get usage guidance.

```javascript
{
  topic: "overview"  // overview|planning|execution|knowledge|collaboration
}
// Returns: guide with tips, workflows, recommended tools
```

### Knowledge

#### `add_learning`
Capture knowledge.

```javascript
{
  title: "Brief title",         // Required
  content: "Full details",      // Required
  entry_type: "learning",       // Optional: learning|decision|context|constraint
  scope: "organization",        // Optional: organization|goal|plan
  scope_id: "uuid",            // Optional
  tags: ["tag1", "tag2"]       // Optional
}
```

#### `search_knowledge`
Search across knowledge.

```javascript
{
  query: "search terms",        // Required
  scope: "plan",               // Optional
  scope_id: "uuid",            // Optional
  entry_types: ["decision"],   // Optional
  limit: 10                    // Optional
}
```

### Markdown

#### `export_plan_markdown`
```javascript
{
  plan_id: "uuid",
  include_descriptions: true,
  include_status: true
}
// Returns: markdown string
```

#### `import_plan_markdown`
```javascript
{
  markdown: "# Title\n## Phase\n- Task",
  title: "Override title",      // Optional
  goal_id: "uuid"              // Optional
}
// Returns: plan_id, phases[], tasks[]
```

### Goals

#### `list_goals`
```javascript
{
  organization_id: "uuid",     // Optional
  status: "active"             // Optional: active|achieved|at_risk|abandoned
}
```

#### `get_goal`
```javascript
{
  goal_id: "uuid"
}
// Returns: goal with success_metrics, linked_plans
```

#### `link_plan_to_goal`
```javascript
{
  goal_id: "uuid",
  plan_id: "uuid"
}
```

### Full CRUD Tools

- `list_plans`, `create_plan`, `update_plan`, `delete_plan`
- `create_node`, `update_node`, `delete_node`, `move_node`
- `get_plan_structure`, `get_plan_summary`
- `add_log`, `get_logs`
- `manage_artifact`, `batch_get_artifacts`
- `batch_update_nodes`
- `search` (universal search)
- `list_organizations`, `get_organization`

---

## 🔌 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_URL` | AgentPlanner API URL | https://api.agentplanner.io |
| `USER_API_TOKEN` | Your API token | Required |
| `NODE_ENV` | Environment | production |

---

## 📝 Status Values

| Status | Meaning |
|--------|---------|
| `not_started` | Work hasn't begun |
| `in_progress` | Currently being worked on |
| `completed` | Finished and verified |
| `blocked` | Cannot proceed (add note explaining why!) |
| `cancelled` | No longer needed |

---

## 🐛 Troubleshooting

### "Authentication failed"
- Check your `USER_API_TOKEN` is valid
- Get a new token at https://www.agentplanner.io/app/settings

### "Connection refused"
- Verify `API_URL` is correct
- For local dev: `http://localhost:3000`
- For production: `https://api.agentplanner.io`

### "Tool not found"
- Make sure you're using the correct tool name
- Check this README for available tools

---

## 📚 Links

- **App**: https://www.agentplanner.io
- **API Docs**: https://api.agentplanner.io/api-docs/
- **GitHub**: https://github.com/TAgents/agent-planner-mcp
- **npm**: https://www.npmjs.com/package/@tagents/agent-planner-mcp

---

## License

MIT
