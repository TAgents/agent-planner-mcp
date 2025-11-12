# Claude Code Slash Commands

Custom slash commands for autonomous plan execution in the Talking Agents project.

## Available Commands

### `/create-plan`
Interactive plan builder that guides you through creating a structured development plan.

**Usage**: `/create-plan`

**What it does**:
- Asks for plan title and description
- Helps break work into phases
- Creates specific tasks with acceptance criteria
- Adds agent instructions for autonomous execution
- Stores everything in MCP planning system

### `/execute-plan`
Autonomous execution orchestrator that works through plan tasks systematically.

**Usage**: `/execute-plan <plan-id>` or `/execute-plan` (will prompt for ID)

**What it does**:
- Loads plan from MCP
- Executes tasks sequentially using Task agents
- Updates status in real-time
- Logs all progress
- Handles blockers and errors
- Reports final summary

### `/plan-status`
Status reporter showing plan progress and recent activity.

**Usage**: `/plan-status <plan-id>` or `/plan-status` (will list all plans)

**What it does**:
- Shows overall progress statistics
- Lists all tasks with current status
- Highlights blockers
- Shows recent activity logs
- Suggests next actions

## How They Work Together

```
1. /create-plan
   ↓
   Creates structured plan in MCP
   ↓
2. /execute-plan <plan-id>
   ↓
   Executes tasks autonomously
   ↓
3. /plan-status <plan-id>
   ↓
   Monitor progress anytime
```

## Requirements

- MCP planning system must be configured and running
- `.claude/settings.local.json` must have MCP permissions enabled
- See AUTONOMOUS_EXECUTION_GUIDE.md for full setup details

## Examples

### Creating and executing a plan
```
> /create-plan
Claude: What is this plan for?
You: Add user profile editing feature

Claude: Let me help you break this down...
[Interactive prompts follow]

Claude: Plan created! Plan ID: plan_abc123

> /execute-plan plan_abc123
Claude: Starting execution...
Task 1/5: Create migration... ✅ Complete
Task 2/5: Add API endpoint... ✅ Complete
Task 3/5: Create UI component... 🔄 In progress...
```

### Checking status
```
> /plan-status plan_abc123
# Plan Status Report

## 📋 Plan: Add user profile editing feature
**Status**: active
**Progress**: 3/5 tasks complete (60%)

## Task Status:
- ✅ Completed: 3
- 🔄 In Progress: 1
- 📋 Not Started: 1
```

## Customization

These commands can be modified by editing the .md files in this directory. Each file contains:
- Instructions for Claude Code on how to execute the command
- Templates for interacting with MCP
- Guidance on error handling and edge cases

## See Also

- [AUTONOMOUS_EXECUTION_GUIDE.md](../AUTONOMOUS_EXECUTION_GUIDE.md) - Comprehensive guide
- [CLAUDE.md](/CLAUDE.md) - Project architecture and patterns
- [.claude/settings.local.json](../settings.local.json) - MCP configuration
