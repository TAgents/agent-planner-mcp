# Autonomous Plan Execution Guide

This directory is configured for autonomous plan execution using Claude Code with the MCP planning system.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Code                              │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐ │
│  │ Slash Commands │→│ Task Tool      │→│ MCP Planning  │ │
│  │ (Orchestrator) │  │ (Executors)    │  │ System (Data) │ │
│  └────────────────┘  └────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────┘
         ↓                    ↓                     ↓
    /execute-plan      general-purpose      Persistent Storage
    /create-plan         agents           (plans, tasks, logs)
    /plan-status
```

## Quick Start

### 1. Create a Plan

```bash
# In Claude Code CLI, run:
/create-plan
```

This interactive command will guide you through:
- Defining your plan title and description
- Breaking it into phases
- Creating specific tasks with acceptance criteria
- Adding agent instructions for autonomous execution

### 2. Execute the Plan

```bash
# Start autonomous execution:
/execute-plan <plan-id>
```

Claude will:
- Load the plan from MCP
- Work through tasks one by one
- Launch specialized Task agents for each task
- Update status in real-time
- Log all progress
- Report completion or blockers

### 3. Monitor Progress

```bash
# Check status anytime:
/plan-status <plan-id>
```

Shows:
- Overall progress (% complete)
- Current task being worked on
- Any blockers
- Recent activity
- Next suggested actions

## Available Commands

### `/create-plan`
Interactive plan builder that helps you structure work into phases and tasks.

**When to use**: Starting a new feature, bug fix, refactoring, or any multi-step work.

**Output**: A complete plan with hierarchical structure stored in MCP.

### `/execute-plan <plan-id>`
Autonomous execution orchestrator that works through tasks systematically.

**When to use**: After creating a plan, or to resume interrupted execution.

**What it does**:
- Fetches tasks from the plan
- Executes them one by one using Task agents
- Updates MCP with progress
- Handles errors and blockers
- Reports final summary

### `/plan-status <plan-id>`
Real-time status reporter showing plan progress and activity.

**When to use**: Check progress during execution, review completed work, identify blockers.

**Output**: Formatted report with statistics, task breakdown, and recent activity.

## How Autonomous Execution Works

### The Execution Loop

1. **Fetch Plan**: Load plan structure from MCP
2. **Find Next Task**: Get first task with status "not_started"
3. **Get Context**: Load task details, acceptance criteria, agent instructions
4. **Update Status**: Mark task as "in_progress" in MCP
5. **Execute**: Launch Task agent with full context
6. **Wait**: Agent works autonomously (reads code, makes changes, runs tests)
7. **Process Result**:
   - If successful → Mark "completed", log progress, move to next task
   - If blocked → Mark "blocked", log issue, ask user for guidance
8. **Repeat**: Continue until all tasks done or blocked

### Task Agent Execution

Each task gets a dedicated `general-purpose` agent that:
- Has access to all Claude Code tools (Read, Write, Edit, Bash, etc.)
- Receives full task context from the plan
- Works autonomously to complete the task
- Reports back with summary of changes
- Verifies acceptance criteria are met

### State Management

All state is stored in the MCP planning system:
- **Plans**: Title, description, status (draft/active/completed)
- **Nodes**: Hierarchical tasks/phases/milestones
- **Logs**: Activity timeline (progress, challenges, decisions)
- **Artifacts**: File references and resources

**Key benefit**: Execution can be interrupted and resumed. State persists across sessions.

## Writing Good Plans

### Task Structure

Each task should have:

1. **Clear Title**: "Create user authentication API endpoint"
2. **Description**: What needs to be done and why
3. **Acceptance Criteria**:
   - Specific, measurable outcomes
   - "API returns 200 on valid credentials"
   - "Returns 401 on invalid credentials"
   - "Integration tests pass with 80%+ coverage"
4. **Agent Instructions**:
   - Specific file paths or patterns to follow
   - Technologies/frameworks to use
   - Testing requirements
   - Related files to reference

### Example: Good vs. Bad Tasks

❌ **Bad Task**:
```
Title: Add login
Description: Add login functionality
Acceptance Criteria: Login works
Agent Instructions: Add login
```

✅ **Good Task**:
```
Title: Create login API endpoint
Description: Add POST /api/v1/auth/login endpoint that validates credentials and returns JWT token
Acceptance Criteria:
- Endpoint accepts email and password
- Returns JWT token on valid credentials
- Returns 401 on invalid credentials
- Returns 400 on missing fields
- Integration tests pass with 80%+ coverage
- Swagger docs updated
Agent Instructions:
Create route in agent-planner/src/routes/auth.routes.js following pattern in users.routes.js.
Create controller in src/controllers/auth.controller.js.
Use bcrypt for password hashing.
Generate JWT using jsonwebtoken library.
Add validation middleware using express-validator.
Write integration tests in tests/integration/auth.test.js.
Run 'npm test' to verify.
Update API docs with 'npm run docs:all'.
```

### Task Ordering

Consider dependencies:
1. Database migrations before API endpoints
2. API endpoints before frontend components
3. Core functionality before tests
4. Tests before documentation

## Project Context

The orchestrator and agents have access to CLAUDE.md which provides:
- Multi-repo structure (backend, frontend, MCP, homepage)
- Development commands for each repo
- Testing patterns
- Authentication flow
- Database migration system
- Deployment procedures

Agents automatically reference this context when executing tasks.

## Backend-Specific Tasks

For backend tasks (migrations, API endpoints, database):
- Agents know to use `npm run db:init` after creating migrations
- Follow patterns in src/routes/*.routes.js and src/controllers/*.controller.js
- Add RLS policies for security
- Update API docs with `npm run docs:all`
- Run appropriate test suites

## Frontend-Specific Tasks

For frontend tasks (components, pages, hooks):
- Agents use React + TypeScript patterns
- Follow Tailwind CSS conventions
- Create components in src/components/
- Use React Query for server state
- Write tests with React Testing Library

## Tips for Success

1. **Be Specific**: Vague tasks lead to vague implementations
2. **One Thing Per Task**: Don't combine multiple concerns
3. **Clear Success Criteria**: Agent needs to know when done
4. **Reference Existing Code**: Help agents find patterns
5. **Include Testing**: Every code task should mention tests
6. **Review Agent Instructions**: These guide the autonomous agent

## Troubleshooting

### "Plan not found"
- Check plan ID is correct
- List plans with `/plan-status` (no ID) to see available plans

### "Task is blocked"
- Check logs with `/plan-status <plan-id>`
- Review what blocked the task
- Update agent instructions if needed
- Manually unblock or fix issue, then change status back to "not_started"

### "Agent didn't follow instructions"
- Review agent_instructions in the task
- Make them more specific with file paths and patterns
- Reference similar existing code to follow
- Update task and retry

### Execution interrupted
- No problem! Just run `/execute-plan <plan-id>` again
- It will resume from where it left off
- All progress is saved in MCP

## MCP Configuration

Your `.claude/settings.local.json` should include:

```json
{
  "permissions": {
    "allow": [
      "mcp__planning-system__create_node",
      "mcp__planning-system__create_plan",
      "mcp__planning-system__add_log",
      "mcp__planning-system__get_plan_summary",
      "mcp__planning-system__batch_update_nodes",
      "mcp__planning-system__update_node"
    ]
  }
}
```

These permissions let Claude autonomously update plans without asking for approval each time.

## Example Workflow

```bash
# 1. Create a plan
/create-plan
# → Follow prompts to create "Feature: User Notifications" plan
# → Plan ID: abc-123

# 2. Execute autonomously
/execute-plan abc-123
# → Claude works through all tasks
# → Creates migration
# → Adds API endpoints
# → Creates frontend components
# → Writes tests
# → Reports completion

# 3. Check status anytime (in another session if needed)
/plan-status abc-123
# → Shows progress: 8/10 tasks complete
# → 2 tasks in progress

# 4. When done
/plan-status abc-123
# → Shows: All tasks completed!
```

## Advanced: Manual MCP Tool Usage

You can also use MCP tools directly:

```javascript
// List all plans
mcp__planning-system__list_plans()

// Create a plan
mcp__planning-system__create_plan({
  title: "Feature: Dark Mode",
  description: "Add dark mode support across the app"
})

// Add a task
mcp__planning-system__create_node({
  plan_id: "abc-123",
  node_type: "task",
  title: "Create dark mode toggle component",
  acceptance_criteria: "Toggle switches theme, persists preference"
})

// Update status
mcp__planning-system__update_node({
  plan_id: "abc-123",
  node_id: "task-456",
  status: "completed"
})
```

But using the slash commands is much easier!

## Next Steps

1. Try creating a simple 2-3 task plan with `/create-plan`
2. Run `/execute-plan` and watch it work
3. Monitor with `/plan-status`
4. Iterate and refine your task definitions

Happy autonomous coding! 🚀
