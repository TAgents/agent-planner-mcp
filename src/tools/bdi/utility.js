/**
 * BDI utility — onboarding.
 */

const { asOf, formatResponse } = require('./_shared');
const { version: MCP_VERSION } = require('../../../package.json');

const getStartedDefinition = {
  name: 'get_started',
  description:
    "Onboarding for new agents. Returns the BDI tool surface map and recommended " +
    "workflows: mission control loop (Cowork), single-task session (Code/CLI), " +
    "multi-agent claiming (OpenClaw).",
  inputSchema: {
    type: 'object',
    properties: {
      user_role: { type: 'string', enum: ['agent', 'human'], default: 'agent' },
    },
  },
};

async function getStartedHandler(args) {
  return formatResponse({
    as_of: asOf(),
    mcp_version: MCP_VERSION,
    overview:
      "AgentPlanner exposes a BDI-aligned MCP surface. Tools are grouped by " +
      "Beliefs (state queries), Desires (goals), and Intentions (committed actions). " +
      "Each tool answers one whole agentic question and returns an `as_of` timestamp.",
    tools_by_namespace: {
      beliefs: ['briefing', 'list_plans', 'task_context', 'goal_state', 'recall_knowledge', 'search', 'plan_analysis'],
      desires: ['list_goals', 'create_goal', 'update_goal', 'derive_subgoal'],
      intentions: ['form_intention', 'extend_intention', 'link_intentions', 'propose_research_chain', 'claim_next_task', 'update_task', 'update_node', 'release_task', 'queue_decision', 'resolve_decision', 'add_learning'],
      workspaces: ['list_workspaces', 'create_workspace', 'list_blueprints', 'fork_blueprint', 'save_as_blueprint'],
    },
    recommended_workflows: [
      {
        name: 'Set up new work a human asked for',
        steps: [
          'list_goals / recall_knowledge — check what already exists',
          'create_goal(...) — create the goal directly (status active). Agents create goals; there is no UI step or approval gate when a human asked.',
          'form_intention(goal_id, nodes with ref + depends_on) — create the plan + task tree atomically, with execution order declared inline',
          'Then execute it: claim_next_task → update_task',
        ],
      },
      {
        name: 'Mission control loop (Cowork autopilot or scheduled task)',
        steps: [
          'briefing(scope="mission_control") — single read for full state',
          'For each at_risk goal: goal_state(goal_id)',
          'If action is reversible: do it via update_task or update_goal',
          'If action needs human approval: queue_decision',
          'Always: add_learning to record what you did and why',
        ],
      },
      {
        name: 'Single coding session (Claude Code, ap CLI)',
        steps: [
          'claim_next_task(scope={plan_id}) — pick + claim + load context',
          'update_task(task_id, status="in_progress") when work starts',
          'update_task(task_id, status="completed", log_message=..., add_learning=...) when done',
        ],
      },
      {
        name: 'Multi-agent server (OpenClaw)',
        steps: [
          'claim_next_task with explicit ttl_minutes',
          'Periodic task_context refresh during long work',
          'release_task on handoff',
        ],
      },
    ],
    key_principles: [
      'Agents create goals AND plans, not just execute — when a human asks you to set something up, use create_goal / form_intention directly (no UI round-trip, no approval gate). The UI is for human oversight, not the only way to create work.',
      'Tools are intent-shaped, not CRUD-shaped',
      'Reads are bundled to minimize round trips',
      'Writes are atomic where possible (update_task does status+log+release)',
      'as_of on every response — use for cache freshness',
    ],
  });
}

module.exports = {
  definitions: [getStartedDefinition],
  handlers: { get_started: getStartedHandler },
};
