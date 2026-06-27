/**
 * BDI utility — onboarding.
 */

const { asOf, formatResponse } = require('./_shared');
const { version: MCP_VERSION } = require('../../../package.json');

const getStartedDefinition = {
  name: 'get_started',
  description:
    "Call this FIRST when you are new to AgentPlanner or unsure which tool to use " +
    "(e.g. looking for create_plan / quick_plan — the answer is form_intention). " +
    "Returns the live BDI tool-surface map and recommended workflows: mission " +
    "control loop (Cowork), single-task session (Code/CLI), multi-agent claiming " +
    "(OpenClaw). The map is derived from the actual tool set, so it can't drift.",
  inputSchema: {
    type: 'object',
    properties: {
      user_role: { type: 'string', enum: ['agent', 'human'], default: 'agent' },
    },
  },
};

async function getStartedHandler(args, apiClient) {
  // Best-effort backend version so one call shows which builds are in play
  // (the MCP and the API it is actually talking to are deployed separately).
  let api = { version: 'unavailable' };
  try {
    if (apiClient?.system?.version) api = await apiClient.system.version();
  } catch {
    api = { version: 'unavailable' };
  }

  // Derived from the actual module definitions so this map can't drift from the
  // real tool set (it silently did — delete_blueprint and record_criterion_progress
  // were both missing at points). Lazy require avoids any load-order cycle.
  const namesOf = (mod) => (mod.definitions || []).map((d) => d.name);
  const toolsByNamespace = {
    beliefs: namesOf(require('./beliefs')),
    desires: namesOf(require('./desires')),
    intentions: namesOf(require('./intentions')),
    workspaces: namesOf(require('./workspaces')),
  };

  return formatResponse({
    as_of: asOf(),
    mcp_version: MCP_VERSION,
    api_url: process.env.API_URL || 'http://localhost:3000',
    api_version: api.version,
    api_build: api.commit ? { commit: api.commit, started_at: api.started_at } : undefined,
    overview:
      "AgentPlanner exposes a BDI-aligned MCP surface. Tools are grouped by " +
      "Beliefs (state queries), Desires (goals), and Intentions (committed actions). " +
      "Each tool answers one whole agentic question and returns an `as_of` timestamp.",
    tools_by_namespace: toolsByNamespace,
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
