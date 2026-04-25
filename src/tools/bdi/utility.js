/**
 * BDI utility — onboarding.
 */

const { asOf, formatResponse } = require('./_shared');

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
    overview:
      "AgentPlanner exposes a BDI-aligned MCP surface. Tools are grouped by " +
      "Beliefs (state queries), Desires (goals), and Intentions (committed actions). " +
      "Each tool answers one whole agentic question and returns an `as_of` timestamp.",
    tools_by_namespace: {
      beliefs: ['briefing', 'task_context', 'goal_state', 'recall_knowledge', 'search', 'plan_analysis'],
      desires: ['list_goals', 'update_goal'],
      intentions: ['claim_next_task', 'update_task', 'release_task', 'queue_decision', 'resolve_decision', 'add_learning'],
    },
    recommended_workflows: [
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
