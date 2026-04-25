#!/usr/bin/env node

/**
 * CLI entry point for agent-planner-mcp.
 * Preserves the existing MCP server/setup commands while adding
 * a thin local-client loop for login/context/status writeback.
 */

const { getMyTasks, getNextTask, materializeContext, login, parseArgs, updateStatus } = require('./cli/local-client');

const args = process.argv.slice(2);
const command = args[0];
const { options } = parseArgs(args.slice(1));

function printHelp() {
  console.log(`
Agent Planner MCP - MCP server + thin local client

Usage:
  npx agent-planner-mcp                          Start MCP server (requires USER_API_TOKEN)
  npx agent-planner-mcp setup-claude-code       Install orchestration commands to .claude/
  npx agent-planner-mcp setup                   Interactive setup wizard
  npx agent-planner-mcp login --token <token> [--api-url <url>] [--plan-id <id>]
  npx agent-planner-mcp tasks [--plan-id <id>]
  npx agent-planner-mcp next [--plan-id <id>] [--fresh]
  npx agent-planner-mcp context --plan-id <id> [--node-id <id>] [--dir <path>]
  npx agent-planner-mcp start [--plan-id <id>] [--node-id <id>]
  npx agent-planner-mcp blocked [--plan-id <id>] [--node-id <id>] [--message "..."]
  npx agent-planner-mcp done [--plan-id <id>] [--node-id <id>] [--message "..."]
  npx agent-planner-mcp --help

Commands:
  login    Authenticate and store credentials. If --plan-id is passed it is
           saved as the default plan. If exactly one plan is accessible, it is
           auto-selected as the default.
  tasks    Queue view: list tasks assigned to you (uses /users/my-tasks).
           Filters by --plan-id or falls back to the stored default plan.
  next     Smart picker. Resolution order: (1) resume any in_progress task
           in scope, (2) dependency-aware recommendation via suggest_next_tasks,
           (3) fall back to first not_started task in your queue. Claims the
           picked task for 30 minutes and materializes its context files.
           Pass --fresh to skip step 1 and force a fresh recommendation
           even when active work exists.
  context  Pull context for a specific plan/node and write .agentplanner/ files
           (a regeneratable cache; AgentPlanner remains the source of truth).
           Surfaces plan health (quality, coherence) and any contradictions
           detected on the task. --node-id can be used alone when a default
           plan is set.
  start    Mark the current task as in_progress and claim it (30-minute TTL).
  blocked  Mark the current task as blocked and release the claim. Optional
           --message is logged as a challenge entry.
  done     Mark the current task as completed and release the claim. Optional
           --message is logged as progress AND written to the temporal
           knowledge graph as a learning episode.

Environment Variables:
  API_URL          - Agent Planner API URL (default: http://localhost:3000)
  USER_API_TOKEN   - API token from Agent Planner UI (required for server)
  MCP_SERVER_NAME  - Server name (default: planning-system-mcp)
  NODE_ENV         - Environment (development/production)

Documentation:
  https://github.com/talkingagents/agent-planner-mcp
`);
}

async function main() {
  switch (command) {
    case 'setup-claude-code': {
      const setupClaudeCode = require('./setup-claude-code.js');
      setupClaudeCode.main();
      return;
    }

    case 'setup':
      require('./setup.js');
      return;

    case 'login': {
      const result = await login(options);
      console.log(`Saved credentials to ${result.configPath}`);
      console.log(`API URL: ${result.apiUrl}`);
      if (result.defaultPlanId) {
        console.log(`Default plan: ${result.defaultPlanId}`);
      }
      return;
    }

    case 'tasks': {
      const result = await getMyTasks(options);
      const taskList = Array.isArray(result.tasks) ? result.tasks : result.tasks?.tasks || [];
      if (result.planId) {
        console.log(`Tasks for plan ${result.planId}:`);
      } else {
        console.log('All tasks:');
      }
      if (!taskList.length) {
        console.log('  (no tasks)');
        return;
      }
      for (const t of taskList) {
        const plan = t.plan_id && t.plan_id !== result.planId ? ` (plan: ${t.plan_id})` : '';
        console.log(`  [${t.status || '?'}] ${t.title || t.id}${plan}`);
      }
      return;
    }

    case 'next': {
      const result = await getNextTask(options);
      console.log(`Selected task: ${result.task.title || result.task.id} [${result.task.status}]`);
      console.log(`Plan: ${result.planId}`);
      console.log(`Source: ${result.source}`);
      if (result.claimed) console.log('Claimed task for 30 minutes.');
      console.log(`Context written to ${result.stateDir}`);
      return;
    }

    case 'context': {
      const result = await materializeContext(options);
      console.log(`Wrote generated context files to ${result.stateDir}`);
      if (result.selection.nodeId) {
        console.log(`Selected node: ${result.selection.nodeId}`);
      }
      return;
    }

    case 'start':
    case 'blocked':
    case 'done': {
      const result = await updateStatus(command, options);
      console.log(`Updated ${result.nodeId} to ${result.status}`);
      if (result.logged) console.log('Added log entry.');
      if (result.claimed) console.log('Claimed task.');
      if (result.released) console.log('Released task claim.');
      if (result.learned) console.log('Recorded learning to temporal knowledge graph.');
      return;
    }

    case '--help':
    case '-h':
    case 'help':
      printHelp();
      return;

    case '--version':
    case '-v': {
      const pkg = require('../package.json');
      console.log(`agent-planner-mcp v${pkg.version}`);
      return;
    }

    default:
      if (command && !command.startsWith('-')) {
        console.error(`Unknown command: ${command}`);
        console.error('Run "npx agent-planner-mcp --help" for usage information.');
        process.exit(1);
      }
      require('./index.js');
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
