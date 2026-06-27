/**
 * BDI desires — goal management.
 *
 * 4 tools: list_goals (with health rollup), update_goal (atomic, subsumes
 * link/unlink and achiever changes), create_goal (new top-level goal), and
 * derive_subgoal (a sub-goal under an existing parent). Agents create goals
 * directly — no UI round-trip and no forced approval gate.
 */

const { asOf, formatResponse, errorResponse, safeArray, apiErrorMessage } = require('./_shared');

// Success criteria accept plain strings (qualitative) or structured measurable
// units. A criterion with metric+target+direction becomes "measurable" and
// drives goal attainment (see the backend's goalCriteria.normalizeCriteria,
// which also maps legacy string[] / {criteria:[]} shapes onto this).
const SUCCESS_CRITERIA_SCHEMA = {
  type: 'array',
  description:
    "Each entry is a plain string (qualitative) OR a structured object " +
    "{ statement, metric?, target?, current?, unit?, direction: 'increase'|'decrease'|'boolean' }. " +
    "Give a criterion metric+target+direction to make it measurable so it counts toward goal attainment.",
  items: {
    oneOf: [
      { type: 'string' },
      {
        type: 'object',
        required: ['statement'],
        properties: {
          statement: { type: 'string', description: 'Human-readable condition.' },
          metric: { type: 'string', description: 'What is measured, e.g. "p99 latency".' },
          target: { description: 'Goal value (number or string).' },
          current: { description: 'Latest observed value (number or string).' },
          unit: { type: 'string', description: 'e.g. "ms", "%", "customers".' },
          direction: { type: 'string', enum: ['increase', 'decrease', 'boolean'] },
        },
      },
    ],
  },
};

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
          workspace_id: { type: 'string', description: 'Scope to goals inside a single workspace' },
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
      apiClient.goals.list({ status: filter.include_inactive ? undefined : 'active', workspaceId: filter.workspace_id }),
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
          // Commitment: true once the goal is promoted to active execution
          // (replaces the old desire/intention goal_type vocabulary).
          committed: { type: 'boolean' },
          success_criteria: SUCCESS_CRITERIA_SCHEMA,
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

  // Direct field updates. title/description/priority/status share their name
  // with the backend, but success_criteria must be camelCased to successCriteria
  // — the goal update schema is .strict(), so the snake_case key was rejected
  // with a 400 (the one multi-word field, hence "description writes but
  // success_criteria fails"). Send the array shape directly: it is the backend's
  // preferred form. (The old { criteria: [...] } wrap made the backend count
  // Object.keys()==1 and skip per-criterion knowledge grounding.)
  const directFields = {};
  for (const k of ['title', 'description', 'priority', 'status']) {
    if (changes[k] !== undefined) directFields[k] = changes[k];
  }
  if (changes.success_criteria !== undefined) {
    directFields.successCriteria = changes.success_criteria;
  }
  // Map the public `committed` boolean onto the backend's commitment write
  // (the API still accepts the legacy goalType field and translates it to
  // promoted_at). committed:true ⇒ promoted, false ⇒ aspirational.
  if (changes.committed !== undefined) {
    directFields.goalType = changes.committed ? 'intention' : 'desire';
  }

  if (Object.keys(directFields).length) {
    try {
      await apiClient.goals.update(goal_id, directFields);
      applied.push('direct_fields');
    } catch (err) {
      failures.push({ step: 'direct_fields', error: apiErrorMessage(err) });
    }
  }

  for (const planId of safeArray(changes.add_linked_plans)) {
    try { await apiClient.goals.linkPlan(goal_id, planId); applied.push(`link_plan:${planId}`); }
    catch (err) { failures.push({ step: `link_plan:${planId}`, error: apiErrorMessage(err) }); }
  }
  for (const planId of safeArray(changes.remove_linked_plans)) {
    try { await apiClient.goals.unlinkPlan(goal_id, planId); applied.push(`unlink_plan:${planId}`); }
    catch (err) { failures.push({ step: `unlink_plan:${planId}`, error: apiErrorMessage(err) }); }
  }
  for (const nodeId of safeArray(changes.add_achievers)) {
    try { await apiClient.goals.addAchiever(goal_id, nodeId); applied.push(`add_achiever:${nodeId}`); }
    catch (err) { failures.push({ step: `add_achiever:${nodeId}`, error: apiErrorMessage(err) }); }
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
      failures.push({ step: `remove_achiever:${nodeId}`, error: apiErrorMessage(err) });
    }
  }

  let goal = null;
  try { goal = await apiClient.goals.get(goal_id); } catch {}

  return formatResponse({ as_of: asOf(), goal_id, applied_changes: applied, failures, goal });
}

// ─────────────────────────────────────────────────────────────────────────
// derive_subgoal — create a sub-goal under an existing parent. For a new
// top-level goal use create_goal.
// ─────────────────────────────────────────────────────────────────────────

const VALID_GOAL_TYPES = ['outcome', 'constraint', 'metric', 'principle'];
const VALID_STATUSES = ['draft', 'active', 'achieved', 'paused', 'abandoned', 'archived'];

const deriveSubgoalDefinition = {
  name: 'derive_subgoal',
  description:
    "Create a sub-goal under an existing parent goal (parent_goal_id required). " +
    "For a new top-level goal, use create_goal instead. Defaults to " +
    "status='active'; pass status='draft' for autonomous loops so a human can " +
    "review before promotion. Drafts surface in the dashboard pending queue.",
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
      success_criteria: SUCCESS_CRITERIA_SCHEMA,
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
  if (success_criteria) payload.successCriteria = success_criteria;
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

// ─────────────────────────────────────────────────────────────────────────
// create_goal — create a top-level goal directly (no parent).
// Agents create goals when a human asks them to; there is no UI round-trip and
// no forced approval gate. Defaults to status='active'.
// ─────────────────────────────────────────────────────────────────────────

const createGoalDefinition = {
  name: 'create_goal',
  description:
    "Create a new top-level goal (no parent). Use this when a human asks you to " +
    "set up a goal — agents create goals directly, no UI step required. For a " +
    "goal that contributes to an existing one, use derive_subgoal instead. " +
    "Defaults to status='active' (live immediately); pass status='draft' only " +
    "if you want it to sit in the pending queue for review. Lands in the user's " +
    "active organization's default workspace unless workspace_id is given.",
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: "The goal statement." },
      description: { type: 'string', description: "What the goal means / context." },
      type: {
        type: 'string',
        enum: VALID_GOAL_TYPES,
        default: 'outcome',
        description: "outcome (end state), metric (quantitative target), constraint (must-not-violate), principle (durable invariant).",
      },
      status: {
        type: 'string',
        enum: VALID_STATUSES,
        default: 'active',
        description: "Default 'active' (live). Pass 'draft' to propose without activating.",
      },
      success_criteria: SUCCESS_CRITERIA_SCHEMA,
      priority: { type: 'integer', minimum: 0, maximum: 10, default: 0 },
      workspace_id: { type: 'string', description: "Optional. Target workspace; defaults to the active org's default workspace." },
    },
    required: ['title'],
  },
};

async function createGoalHandler(args, apiClient) {
  const { title, description, type = 'outcome', status = 'active', success_criteria, priority, workspace_id } = args;

  const payload = { title, type, status };
  if (description) payload.description = description;
  if (success_criteria) payload.successCriteria = success_criteria;
  if (typeof priority === 'number') payload.priority = priority;
  if (workspace_id) payload.workspaceId = workspace_id;

  let goal;
  try {
    goal = await apiClient.goals.create(payload);
  } catch (err) {
    const upstream = err.response?.data?.error || err.message;
    return errorResponse('create_failed', `Failed to create goal: ${upstream}`);
  }

  return formatResponse({
    as_of: asOf(),
    goal_id: goal.id,
    title: goal.title,
    status: goal.status,
    is_draft: goal.status === 'draft',
    next_step: goal.status === 'draft'
      ? "Goal created as draft. Promote via update_goal({status: 'active'}) once ready."
      : "Goal is active. Add sub-goals with derive_subgoal, or link plans via update_goal({add_linked_plans: [...]}).",
  });
}

// ─────────────────────────────────────────────────────────────────────────
// record_criterion_progress — set the current value of a measurable criterion.
// This is the write that makes goal attainment real (metric moved 40→72).
// ─────────────────────────────────────────────────────────────────────────

const recordCriterionProgressDefinition = {
  name: 'record_criterion_progress',
  description:
    "Record the latest observed value of one of a goal's success criteria " +
    "(e.g. a metric moved 40→72). Identify the criterion by criterion_id " +
    "(stable, like 'c0') or its 0-based index — both are visible in goal_state. " +
    "Only measurable criteria (metric+target+direction) count toward attainment; " +
    "this is the write that makes goal attainment real.",
  inputSchema: {
    type: 'object',
    properties: {
      goal_id: { type: 'string' },
      criterion_id: { type: 'string', description: "Stable criterion id (e.g. 'c0'). Use this or index." },
      index: { type: 'integer', description: '0-based position of the criterion. Alternative to criterion_id.' },
      current: { description: 'Latest observed value (number or string). Required.' },
    },
    required: ['goal_id', 'current'],
  },
};

async function recordCriterionProgressHandler(args, apiClient) {
  const { goal_id, criterion_id, index, current } = args;
  if (!goal_id) return errorResponse('invalid_arg', 'record_criterion_progress requires goal_id');
  if (current === undefined) return errorResponse('invalid_arg', 'record_criterion_progress requires current');
  if (!criterion_id && !Number.isInteger(index)) {
    return errorResponse('invalid_arg', 'record_criterion_progress requires criterion_id or index');
  }

  const body = { current };
  if (criterion_id) body.criterion_id = criterion_id;
  if (Number.isInteger(index)) body.index = index;

  try {
    const result = await apiClient.goals.recordCriterionProgress(goal_id, body);
    return formatResponse({ as_of: asOf(), goal_id, criterion: result.criterion, criteria: result.criteria });
  } catch (err) {
    const status = err.response?.status;
    if (status === 404) return errorResponse('not_found', apiErrorMessage(err));
    return errorResponse('upstream_unavailable', `record_criterion_progress failed: ${apiErrorMessage(err)}`);
  }
}

module.exports = {
  definitions: [
    listGoalsDefinition,
    updateGoalDefinition,
    createGoalDefinition,
    deriveSubgoalDefinition,
    recordCriterionProgressDefinition,
  ],
  handlers: {
    list_goals: listGoalsHandler,
    update_goal: updateGoalHandler,
    create_goal: createGoalHandler,
    derive_subgoal: deriveSubgoalHandler,
    record_criterion_progress: recordCriterionProgressHandler,
  },
};
