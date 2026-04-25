/**
 * BDI desires — goal management.
 *
 * 3 tools: list_goals (with health rollup), update_goal (atomic, subsumes
 * link/unlink and achiever changes), derive_subgoal (propose a sub-goal
 * under an existing parent; mandatory parent — top-level goals stay UI-only).
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

// ─────────────────────────────────────────────────────────────────────────
// derive_subgoal — propose a sub-goal under an existing parent.
// Top-level goals stay UI-only (strategic direction is human-set).
// ─────────────────────────────────────────────────────────────────────────

const VALID_GOAL_TYPES = ['outcome', 'constraint', 'metric', 'principle'];
const VALID_STATUSES = ['draft', 'active', 'achieved', 'paused', 'abandoned', 'archived'];

const deriveSubgoalDefinition = {
  name: 'derive_subgoal',
  description:
    "Propose a sub-goal under an existing parent goal. parent_goal_id is " +
    "mandatory — agents cannot create top-level goals (strategic direction is " +
    "human-set). Defaults to status='active' for human-directed creation; pass " +
    "status='draft' for autonomous loops so a human can review before promotion. " +
    "Drafts surface in the dashboard pending queue.",
  inputSchema: {
    type: 'object',
    properties: {
      parent_goal_id: {
        type: 'string',
        description: "Required. The parent goal this sub-goal contributes to.",
      },
      title: { type: 'string' },
      description: { type: 'string', description: "Optional extended description, appended after rationale." },
      rationale: {
        type: 'string',
        description: "Why this sub-goal is needed to achieve the parent. Becomes the description; surfaces in human review.",
      },
      type: {
        type: 'string',
        enum: VALID_GOAL_TYPES,
        default: 'outcome',
      },
      status: {
        type: 'string',
        enum: VALID_STATUSES,
        default: 'active',
        description: "Default 'active' for human-directed creation. Pass 'draft' when acting autonomously without explicit user direction.",
      },
      success_criteria: {
        type: 'array',
        items: { type: 'string' },
        description: "Concrete, observable conditions that mark this sub-goal achieved.",
      },
      priority: { type: 'integer', default: 0 },
    },
    required: ['parent_goal_id', 'title', 'rationale'],
  },
};

async function deriveSubgoalHandler(args, apiClient) {
  const { parent_goal_id, title, description, rationale, type = 'outcome', status = 'active', success_criteria, priority } = args;

  // Verify parent exists and inherit organization scope.
  let parent;
  try {
    parent = await apiClient.goals.get(parent_goal_id);
  } catch (err) {
    return errorResponse('not_found', `Parent goal ${parent_goal_id} not found or not accessible: ${err.message}`);
  }

  // Compose description: rationale is primary; optional description appended.
  const composedDescription = description
    ? `${rationale}\n\n${description}`
    : rationale;

  const payload = {
    title,
    description: composedDescription,
    type,
    status,
    parentGoalId: parent_goal_id,
    organizationId: parent.organization_id || parent.organizationId || undefined,
  };
  if (success_criteria) payload.successCriteria = { criteria: success_criteria };
  if (typeof priority === 'number') payload.priority = priority;

  let goal;
  try {
    goal = await apiClient.goals.create(payload);
  } catch (err) {
    const upstream = err.response?.data?.error || err.message;
    return errorResponse('create_failed', `Failed to create sub-goal: ${upstream}`);
  }

  return formatResponse({
    as_of: asOf(),
    goal_id: goal.id,
    parent_goal_id,
    title: goal.title,
    status: goal.status,
    is_draft: goal.status === 'draft',
    next_step: goal.status === 'draft'
      ? "Sub-goal created as draft. It will surface in the dashboard pending queue for human review. Promote via update_goal({status: 'active'}) once approved."
      : "Sub-goal active. Link plans to it via update_goal({add_linked_plans: [...]}).",
  });
}

module.exports = {
  definitions: [listGoalsDefinition, updateGoalDefinition, deriveSubgoalDefinition],
  handlers: {
    list_goals: listGoalsHandler,
    update_goal: updateGoalHandler,
    derive_subgoal: deriveSubgoalHandler,
  },
};
