# Claude Code Autonomous Execution Setup

This package includes an autonomous execution orchestration system for Claude Code that works with the Agent Planner MCP server.

## What is This?

The Claude Code orchestration system enables autonomous plan execution where Claude Code can:
- Read plans from the MCP planning system
- Execute tasks one by one using specialized agents
- Update progress in real-time
- Handle errors and blockers
- Provide complete visibility into execution

## Components

### Slash Commands

Three powerful commands for autonomous execution:

- **`/create-plan`** - Interactive plan builder that guides you through creating structured plans
- **`/execute-plan`** - Autonomous orchestrator that executes plan tasks sequentially
- **`/plan-status`** - Real-time status reporter showing progress and activity

### Documentation

- **AUTONOMOUS_EXECUTION_GUIDE.md** - Comprehensive guide with examples and best practices

### Configuration

- **settings.template.json** - Claude Code permissions for MCP tools

## Installation

### Prerequisites

1. **Agent Planner MCP Server** must be configured in Claude Code
2. **API Token** from your Agent Planner instance
3. **Claude Code** installed and running

### Quick Install

From your project directory:

```bash
# If installed globally
npm install -g agent-planner-mcp
npm run setup-claude-code

# Or using npx (recommended)
npx agent-planner-mcp setup-claude-code
```

This will:
- Create `.claude/` directory if it doesn't exist
- Install slash commands in `.claude/commands/`
- Copy documentation to `.claude/AUTONOMOUS_EXECUTION_GUIDE.md`
- Merge MCP permissions into `.claude/settings.local.json`

### Manual Installation

If you prefer manual installation:

```bash
# From agent-planner-mcp package directory
cp -r claude-code/commands /path/to/your/project/.claude/
cp claude-code/AUTONOMOUS_EXECUTION_GUIDE.md /path/to/your/project/.claude/
```

Then add these permissions to your `.claude/settings.local.json`:

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

## Usage

### 1. Create a Plan

```bash
/create-plan
```

Claude will guide you through:
- Defining plan title and description
- Breaking work into phases
- Creating specific tasks with acceptance criteria
- Adding agent instructions for autonomous execution

**Output**: Plan ID (e.g., `plan_abc123`)

### 2. Execute the Plan

```bash
/execute-plan plan_abc123
```

Claude will:
- Fetch the plan from MCP
- Execute tasks sequentially
- Launch specialized Task agents per task
- Update MCP status in real-time
- Log all progress
- Handle blockers and errors
- Report final summary

### 3. Monitor Progress

```bash
/plan-status plan_abc123
```

Shows:
- Overall progress statistics
- Task breakdown by status
- Recent activity logs
- Blockers and issues
- Next suggested actions

## Example Workflow

```bash
# 1. Create a new feature plan
/create-plan
> "Add user profile editing feature"
# Plan ID: plan_abc123

# 2. Execute autonomously
/execute-plan plan_abc123
# Claude works through:
# - Create database migration ✅
# - Add API endpoints ✅
# - Create UI components ✅
# - Write tests ✅
# - Update documentation ✅

# 3. Check status anytime
/plan-status plan_abc123
# Progress: 5/5 tasks complete (100%)
```

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Claude Code                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Slash        │→│ Task Tool    │→│ MCP Planning │ │
│  │ Commands     │  │ Agents       │  │ System       │ │
│  │ (Orchestrate)│  │ (Execute)    │  │ (Persist)    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Execution Flow

1. **`/create-plan`** creates structured plan in MCP
2. **`/execute-plan`** orchestrates execution:
   - Fetches plan structure
   - For each task:
     - Updates status to "in_progress"
     - Launches Task agent with full context
     - Agent executes autonomously (reads code, makes changes, tests)
     - Updates status to "completed" or "blocked"
     - Logs progress
   - Reports final summary
3. **`/plan-status`** monitors at any time

### State Persistence

All execution state is stored in the MCP planning system:
- Plans with hierarchical structure
- Task status (not_started/in_progress/completed/blocked)
- Logs and activity timeline
- Artifacts and file references

**Key benefit**: Execution can be interrupted and resumed anytime!

## Best Practices

### Writing Good Plans

Each task should have:

1. **Clear Title**: "Create user authentication API endpoint"
2. **Detailed Description**: What and why
3. **Specific Acceptance Criteria**:
   ```
   - API returns 200 on valid credentials
   - Returns 401 on invalid credentials
   - Integration tests pass with 80%+ coverage
   ```
4. **Agent Instructions**:
   ```
   Create route in src/routes/auth.routes.js following pattern in users.routes.js.
   Use bcrypt for password hashing.
   Add validation middleware using express-validator.
   Write tests in tests/integration/auth.test.js.
   Run 'npm test' to verify.
   ```

### Task Ordering

Consider dependencies:
- Database migrations → API endpoints → UI components
- Core functionality → Tests → Documentation

### Project Context

The orchestration system automatically references your project's `CLAUDE.md` for:
- Architecture patterns
- Development commands
- Testing strategies
- Deployment procedures

## Troubleshooting

### "Plan not found"
- Check plan ID is correct
- List available plans: `/plan-status` (no ID)

### "Task blocked"
- Check logs: `/plan-status <plan-id>`
- Review blocker details
- Update task instructions if needed
- Change status back to "not_started" and retry

### Execution interrupted
- No problem! Just run `/execute-plan <plan-id>` again
- It resumes from where it left off
- All progress is saved in MCP

### MCP tools not available
- Ensure agent-planner-mcp is in Claude Code MCP configuration
- Check `.claude/settings.local.json` has correct permissions
- Restart Claude Code after configuration changes

## Configuration Options

### MCP Server Configuration

In your Claude Code MCP settings (usually `~/Library/Application Support/Claude/mcp_settings.json`):

```json
{
  "mcpServers": {
    "planning-system": {
      "command": "npx",
      "args": ["-y", "agent-planner-mcp"],
      "env": {
        "API_URL": "http://localhost:3000",
        "USER_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

### Permissions

The setup script automatically adds these permissions to `.claude/settings.local.json`:

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

This allows Claude to update plans autonomously without asking for approval each time.

## Advanced Usage

### Multiple Plans

You can have multiple plans active simultaneously:

```bash
/create-plan  # Feature: User profiles
/create-plan  # Bug fix: Auth timeout
/create-plan  # Refactor: Database layer

/execute-plan plan_abc123  # Execute first plan
/execute-plan plan_def456  # Execute second plan
```

### Resuming Execution

Plans persist across sessions:

```bash
# Start execution
/execute-plan plan_abc123
# ... 3/10 tasks complete ...
# Close Claude Code or interrupt

# Later: Resume
/execute-plan plan_abc123
# Picks up at task 4/10
```

### Custom Project Patterns

Add project-specific guidance to your `CLAUDE.md`:

```markdown
## Project Conventions

### Backend
- All API routes must include Swagger annotations
- Use RLS policies for database security
- Run `npm run db:init` after creating migrations

### Frontend
- Components in `src/components/`
- Use Tailwind CSS for styling
- Write tests for all user-facing components
```

Agents automatically reference this during execution.

## Related Documentation

- [AUTONOMOUS_EXECUTION_GUIDE.md](./claude-code/AUTONOMOUS_EXECUTION_GUIDE.md) - Complete guide with examples
- [Main README](./README.md) - MCP server setup and configuration
- [Agent Planner Docs](https://agentplanner.io/docs) - Full system documentation

## Support

- **Issues**: https://github.com/talkingagents/agent-planner-mcp/issues
- **Docs**: https://agentplanner.io
- **Discord**: Join our community for help and discussion

## License

MIT
