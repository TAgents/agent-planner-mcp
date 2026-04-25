/**
 * BDI desires — goal management.
 *
 * 2 tools: list_goals (with health rollup), update_goal (atomic, subsumes
 * link/unlink and achiever changes).
 */

const { asOf, formatResponse, errorResponse, safeArray } = require('./_shared');

const listGoalsDefinition = {
  name: 'list_goals',
  description:
    "List goals with health rollup. Returns aggregate counts (on_track/at_risk/stale) " +
    "plus per-goal summary.",
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'object',
        properties: {
          health: { type: 'array', items: { type: 'string', enum: ['on_track', 'at_risk', 'stale'] } },
          status: { type: 'array', items: { type: 'string' } },
          include_inactive: { type: 'boolean', default: false },
        },
      },
    },
  },
};

async function listGoalsHandler(args, apiClient) {
  const filter = args.filter || {};
  try {
    const [listRes, dashboardRes] = await Promise.allSettled([
      apiClient.goals.list({ status: filter.include_inactive ? undefined : 'active' }),
      apiClient.goals.getDashboard(),
    ]);

    const goals = listRes.status === 'fulfilled' ? safeArray(listRes.value) : [];
    const dashGoals = dashboardRes.status === 'fulfilled' ? safeArray(dashboardRes.value.goals) : [];
    const healthByGoal = Object.fromEntries(dashGoals.map((g) => [g.id, g]));

    let merged = goals.map((g) => {
      const d = healthByGoal[g.id] || {};
      return {
        id: g.id,
        title: g.title,
        health: d.health || 'on_track',
        priority: g.priority,
        status: g.status,
        owner_name: d.owner_name || g.owner_name,
        last_activity: d.last_activity,
        linked_plan_count: d.linked_plan_progress?.linked_plan_count,
      };
    });

    if (filter.health?.length) merged = merged.filter((g) => filter.health.includes(g.health));
    if (filter.status?.length) merged = merged.filter((g) => filter.status.includes(g.status));

    const summary = merged.reduce(
      (acc, g) => {
        acc[g.health] = (acc[g.health] || 0) + 1;
        acc.total += 1;
        return acc;
      },
      { on_track: 0, at_risk: 0, stale: 0, total: 0 }
    );

    return formatResponse({ as_of: asOf(), summary, goals: merged });
  } catch (err) {
    return errorResponse('upstream_unavailable', `list_goals failed: ${err.message}`);
  }
}

const updateGoalDefinition = {
  name: 'update_goal',
  description:
    "Atomic goal update. Subsumes update_goal + link_plan_to_goal + unlink_plan_from_goal " +
    "+ add_achiever + remove_achiever. All changes apply together.",
  inputSchema: {
    type: 'object',
    properties: {
      goal_id: { type: 'string' },
      changes: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'integer' },
          status: { type: 'string' },
          goal_type: { type: 'string', enum: ['desire', 'intention'] },
          success_criteria: {},
          promote_to_intention: { type: 'boolean' },
          add_linked_plans: { type: 'array', items: { type: 'string' } },
          remove_linked_plans: { type: 'array', items: { type: 'string' } },
          add_achievers: { type: 'array', items: { type: 'string' } },
          remove_achievers: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    required: ['goal_id', 'changes'],
  },
};

async function updateGoalHandler(args, apiClient) {
  const { goal_id, changes } = args;
  const applied = [];
  const failures = [];

  // Direct field updates
  const directFields = {};
  for (const k of ['title', 'description', 'priority', 'status', 'success_criteria']) {
    if (changes[k] !== undefined) directFields[k] = changes[k];
  }
  if (changes.goal_type) directFields.goalType = changes.goal_type;
  if (changes.promote_to_intention) directFields.goalType = 'intention';

  if (Object.keys(directFields).length) {
    try {
      await apiClient.goals.update(goal_id, directFields);
      applied.push('direct_fields');
    } catch (err) {
      failures.push({ step: 'direct_fields', error: err.message });
    }
  }

  for (const planId of safeArray(changes.add_linked_plans)) {
    try { await apiClient.goals.linkPlan(goal_id, planId); applied.push(`link_plan:${planId}`); }
    catch (err) { failures.push({ step: `link_plan:${planId}`, error: err.message }); }
  }
  for (const planId of safeArray(changes.remove_linked_plans)) {
    try { await apiClient.goals.unlinkPlan(goal_id, planId); applied.push(`unlink_plan:${planId}`); }
    catch (err) { failures.push({ step: `unlink_plan:${planId}`, error: err.message }); }
  }
  for (const nodeId of safeArray(changes.add_achievers)) {
    try { await apiClient.goals.addAchiever(goal_id, nodeId); applied.push(`add_achiever:${nodeId}`); }
    catch (err) { failures.push({ step: `add_achiever:${nodeId}`, error: err.message }); }
  }
  for (const nodeId of safeArray(changes.remove_achievers)) {
    try {
      const achievers = await apiClient.goals.listAchievers(goal_id);
      const link = safeArray(achievers.achievers || achievers).find((a) => a.source_node_id === nodeId);
      if (link) {
        await apiClient.goals.removeAchiever(goal_id, link.id);
        applied.push(`remove_achiever:${nodeId}`);
      }
    } catch (err) {
      failures.push({ step: `remove_achiever:${nodeId}`, error: err.message });
    }
  }

  let goal = null;
  try { goal = await apiClient.goals.get(goal_id); } catch {}

  return formatResponse({ as_of: asOf(), goal_id, applied_changes: applied, failures, goal });
}

module.exports = {
  definitions: [listGoalsDefinition, updateGoalDefinition],
  handlers: {
    list_goals: listGoalsHandler,
    update_goal: updateGoalHandler,
  },
};
