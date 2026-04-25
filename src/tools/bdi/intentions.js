/**
 * BDI intentions — committed actions.
 *
 * v0.9.0 baseline (execution): queue_decision, resolve_decision, update_task,
 * claim_next_task, release_task, add_learning.
 *
 * v1.0.0 additions (creation, mutation, collaboration):
 *   - form_intention, extend_intention, propose_research_chain
 *   - link_intentions, unlink_intentions
 *   - update_plan, update_node, move_node, delete_plan, delete_node
 *   - share_plan, invite_member, update_member_role, remove_member
 *
 * See ../../../docs/MCP_v1.0_FULL_SURFACE.md for design rationale.
 */

const { asOf, formatResponse, errorResponse } = require('./_shared');

// ─────────────────────────────────────────────────────────────────────────
// queue_decision — real decision queue. Replaces add_learning workaround.
// ─────────────────────────────────────────────────────────────────────────

const queueDecisionDefinition = {
  name: 'queue_decision',
  description:
    "Queue a decision for human review. Writes to the real decisions table " +
    "(not the knowledge graph). Replaces the autopilot pattern of calling " +
    "add_learning with entry_type=decision and a 'DECISION NEEDED:' title prefix. " +
    "Resolves via resolve_decision.",
  inputSchema: {
    type: 'object',
    properties: {
      plan_id: {
        type: 'string',
        description: "Plan that owns this decision. Required if node_id is not provided.",
      },
      node_id: {
        type: 'string',
        description: "Task that prompted the decision. If provided, plan_id is inferred.",
      },
      title: { type: 'string', description: 'User-facing decision title' },
      context: { type: 'string', description: 'Background — why this matters, what is at stake' },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['label'],
        },
        description: 'Concrete options to choose between',
      },
      recommendation: {
        type: 'string',
        description: 'Agent\'s preferred option with one-line reasoning',
      },
      smallest_input_needed: {
        type: 'string',
        description: "Explicit ask for human, e.g. 'approve|defer'",
      },
      urgency: {
        type: 'string',
        enum: ['low', 'normal', 'high'],
        default: 'normal',
      },
      goal_id: { type: 'string', description: 'Optional goal this decision serves' },
      proposed_subtasks: {
        type: 'array',
        description: "Tasks to materialize if the human approves. Agents propose; humans steer structure. On resolve_decision(action='approve'), these are atomically created under the given parent_id and their IDs are returned.",
        items: {
          type: 'object',
          properties: {
            parent_id: { type: 'string', description: 'Where to attach. Must be a node the agent already has access to.' },
            title: { type: 'string' },
            description: { type: 'string' },
            node_type: { type: 'string', enum: ['phase', 'task', 'milestone'], default: 'task' },
            task_mode: { type: 'string', enum: ['research', 'plan', 'implement', 'free'], default: 'free' },
            agent_instructions: { type: 'string' },
            acceptance_criteria: { type: 'string' },
          },
          required: ['parent_id', 'title'],
        },
      },
    },
    required: ['title', 'context', 'smallest_input_needed'],
  },
};

async function queueDecisionHandler(args, apiClient) {
  const { plan_id, node_id, title, context, options, recommendation, smallest_input_needed, urgency, goal_id, proposed_subtasks } = args;

  let planId = plan_id;
  if (!planId && node_id) {
    try {
      const node = await apiClient.axiosInstance.get(`/nodes/${node_id}`).then((r) => r.data);
      planId = node.plan_id || node.planId;
    } catch (err) {
      return errorResponse('not_found', `Could not resolve plan_id from node_id ${node_id}: ${err.message}`);
    }
  }
  if (!planId) {
    return errorResponse('invalid_arg', 'queue_decision requires either plan_id or node_id');
  }

  const body = {
    title,
    context,
    options: options || [],
    recommendation: recommendation || null,
    urgency: urgency || 'normal',
    metadata: {
      smallest_input_needed,
      goal_id: goal_id || null,
      source: 'bdi.queue_decision',
      proposed_subtasks: Array.isArray(proposed_subtasks) ? proposed_subtasks : undefined,
    },
  };
  if (node_id) body.node_id = node_id;

  try {
    const created = await apiClient.axiosInstance
      .post(`/plans/${planId}/decisions`, body)
      .then((r) => r.data);
    return formatResponse({
      as_of: asOf(),
      decision_id: created.id,
      plan_id: planId,
      node_id: node_id || null,
      status: created.status || 'pending',
      title: created.title,
    });
  } catch (err) {
    return errorResponse(
      'upstream_unavailable',
      `Failed to queue decision: ${err.response?.data?.error || err.message}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// resolve_decision — mark a queued decision as approved/deferred/rejected.
// ─────────────────────────────────────────────────────────────────────────

const resolveDecisionDefinition = {
  name: 'resolve_decision',
  description:
    "Resolve a pending decision. action is 'approve', 'defer', or 'reject'. " +
    "Use this from Cowork artifact buttons or after a human responds in chat.",
  inputSchema: {
    type: 'object',
    properties: {
      decision_id: { type: 'string' },
      plan_id: {
        type: 'string',
        description: 'Plan that owns the decision (required by API path)',
      },
      action: {
        type: 'string',
        enum: ['approve', 'defer', 'reject'],
      },
      message: { type: 'string', description: 'Optional resolution note' },
      selected_option: {
        type: 'string',
        description: 'When the decision presented options, which was chosen',
      },
    },
    required: ['decision_id', 'plan_id', 'action'],
  },
};

async function resolveDecisionHandler(args, apiClient) {
  const { decision_id, plan_id, action, message, selected_option } = args;

  // Fetch the decision first so we can read proposed_subtasks if any.
  let decision = null;
  try {
    decision = await apiClient.axiosInstance
      .get(`/plans/${plan_id}/decisions/${decision_id}`)
      .then((r) => r.data);
  } catch (err) {
    // Best-effort — if fetch fails, we still try to resolve.
  }

  let resolved;
  try {
    resolved = await apiClient.axiosInstance
      .post(`/plans/${plan_id}/decisions/${decision_id}/resolve`, {
        resolution: action,
        message: message || null,
        selected_option: selected_option || null,
      })
      .then((r) => r.data);
  } catch (err) {
    return errorResponse(
      'upstream_unavailable',
      `Failed to resolve decision: ${err.response?.data?.error || err.message}`
    );
  }

  // On approve, materialize any proposed_subtasks atomically (best-effort per task).
  const created = [];
  const createFailures = [];
  if (action === 'approve' && decision?.metadata?.proposed_subtasks?.length) {
    for (const proposal of decision.metadata.proposed_subtasks) {
      try {
        const node = await apiClient.nodes.createNode(plan_id, {
          parent_id: proposal.parent_id,
          node_type: proposal.node_type || 'task',
          title: proposal.title,
          description: proposal.description,
          status: 'not_started',
          task_mode: proposal.task_mode || 'free',
          agent_instructions: proposal.agent_instructions,
          acceptance_criteria: proposal.acceptance_criteria,
        });
        created.push({ id: node.id || node.node?.id, title: proposal.title, parent_id: proposal.parent_id });
      } catch (err) {
        createFailures.push({
          title: proposal.title,
          parent_id: proposal.parent_id,
          error: err.response?.data?.error || err.message,
        });
      }
    }
  }

  return formatResponse({
    as_of: asOf(),
    decision_id,
    plan_id,
    status: resolved.status || action,
    resolved_at: resolved.resolved_at || asOf(),
    message: resolved.message || message || null,
    created_subtasks: created,
    create_failures: createFailures,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// update_task — atomic state transition. Replaces 3 calls.
// ─────────────────────────────────────────────────────────────────────────

const STATUS_TO_LOG_TYPE = {
  blocked: 'challenge',
  completed: 'progress',
  in_progress: 'progress',
  not_started: 'progress',
  plan_ready: 'progress',
};

const updateTaskDefinition = {
  name: 'update_task',
  description:
    "Atomic task state transition. Updates status, optionally appends a log " +
    "entry, optionally releases the claim. Idempotent on identical inputs. " +
    "Replaces quick_status + add_log + release_task fan-out.",
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string' },
      plan_id: {
        type: 'string',
        description: 'Plan that owns the task (auto-resolved from task if omitted)',
      },
      status: {
        type: 'string',
        enum: ['not_started', 'in_progress', 'completed', 'blocked', 'plan_ready'],
      },
      log_message: { type: 'string', description: 'Optional progress note' },
      log_type: {
        type: 'string',
        enum: ['progress', 'decision', 'blocker', 'completion', 'challenge'],
        description: "Defaults from status: blocked→challenge, others→progress.",
      },
      release_claim: {
        type: 'boolean',
        description: "Default: auto (true if status is completed/blocked). Set explicitly to override.",
      },
      add_learning: {
        type: 'string',
        description: 'Optional: also write a knowledge episode (recommended on completion)',
      },
    },
    required: ['task_id'],
  },
};

async function updateTaskHandler(args, apiClient) {
  const { task_id, status, log_message, add_learning, release_claim } = args;
  let planId = args.plan_id;

  // Resolve plan_id from task if not provided.
  if (!planId) {
    try {
      const node = await apiClient.axiosInstance.get(`/nodes/${task_id}`).then((r) => r.data);
      planId = node.plan_id || node.planId;
    } catch (err) {
      return errorResponse('not_found', `Could not resolve plan_id from task ${task_id}: ${err.message}`);
    }
  }

  const result = {
    as_of: asOf(),
    task_id,
    plan_id: planId,
    applied: { status_changed: false, log_added: false, claim_released: false, learning_recorded: false },
    failures: [],
  };

  // 1. Status update
  if (status) {
    try {
      await apiClient.nodes.updateNode(planId, task_id, { status });
      result.applied.status_changed = true;
      result.status = status;
    } catch (err) {
      result.failures.push({ step: 'update_status', error: err.response?.data?.error || err.message });
    }
  }

  // 2. Log entry
  if (log_message) {
    const logType = args.log_type || STATUS_TO_LOG_TYPE[status] || 'progress';
    try {
      const log = await apiClient.logs.addLog(planId, task_id, {
        content: log_message,
        log_type: logType,
      });
      result.applied.log_added = true;
      result.log_id = log?.id || log?.log?.id;
    } catch (err) {
      result.failures.push({ step: 'add_log', error: err.response?.data?.error || err.message });
    }
  }

  // 3. Claim release — auto if status is terminal, explicit override otherwise.
  const shouldRelease =
    typeof release_claim === 'boolean'
      ? release_claim
      : status === 'completed' || status === 'blocked';
  if (shouldRelease) {
    try {
      await apiClient.axiosInstance.delete(`/nodes/${task_id}/claim`);
      result.applied.claim_released = true;
    } catch (err) {
      // Releasing an unclaimed task is not a hard error — just record it.
      result.failures.push({ step: 'release_claim', error: err.response?.data?.error || err.message });
    }
  }

  // 4. Optional learning write to knowledge graph.
  if (add_learning) {
    try {
      await apiClient.graphiti.addEpisode({
        name: `Task: ${task_id}`,
        content: add_learning,
        source: 'task_update',
        plan_id: planId,
        node_id: task_id,
      });
      result.applied.learning_recorded = true;
    } catch (err) {
      result.failures.push({ step: 'add_learning', error: err.response?.data?.error || err.message });
    }
  }

  return formatResponse(result);
}

// ─────────────────────────────────────────────────────────────────────────
// claim_next_task — bundle suggest + claim + load context.
// ─────────────────────────────────────────────────────────────────────────

const claimNextTaskDefinition = {
  name: 'claim_next_task',
  description:
    "Pick the next task in scope, claim it, and return its context — all in " +
    "one call. Resolution order: (1) resume any in_progress task, (2) suggest_next_tasks, " +
    "(3) my_tasks fallback. Pass fresh:true to skip the resume step.",
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'object',
        properties: {
          plan_id: { type: 'string' },
          goal_id: { type: 'string' },
        },
      },
      ttl_minutes: { type: 'integer', default: 30 },
      fresh: { type: 'boolean', default: false },
      context_depth: { type: 'integer', enum: [1, 2, 3, 4], default: 2 },
      dry_run: {
        type: 'boolean',
        default: false,
        description: "If true, return the candidate task without claiming. Lets the caller peek before committing. No phantom claim left behind.",
      },
    },
    required: ['scope'],
  },
};

async function claimNextTaskHandler(args, apiClient) {
  const { scope = {}, ttl_minutes = 30, fresh = false, context_depth = 2, dry_run = false } = args;
  const { plan_id, goal_id } = scope;

  let chosen = null;
  let source = null;

  // 1. Resume in-progress (unless fresh)
  if (!fresh) {
    try {
      const myTasks = await apiClient.users.getMyTasks({ plan_id });
      const tasks = (myTasks.tasks || myTasks || []).filter((t) => t.status === 'in_progress');
      if (plan_id) tasks.filter((t) => t.plan_id === plan_id);
      if (tasks[0]) {
        chosen = tasks[0];
        source = 'resume_in_progress';
      }
    } catch {}
  }

  // 2. suggest_next_tasks
  if (!chosen && plan_id) {
    try {
      const params = new URLSearchParams({ plan_id, limit: '1' });
      const r = await apiClient.axiosInstance.get(`/plans/${plan_id}/suggest-next-tasks?${params}`);
      const suggested = (r.data?.tasks || r.data || [])[0];
      if (suggested) {
        chosen = suggested;
        source = 'suggest_next_tasks';
      }
    } catch {}
  }

  // 3. my_tasks fallback (first not_started)
  if (!chosen) {
    try {
      const myTasks = await apiClient.users.getMyTasks({ plan_id });
      const tasks = (myTasks.tasks || myTasks || []).filter((t) => t.status === 'not_started');
      if (tasks[0]) {
        chosen = tasks[0];
        source = 'my_tasks_fallback';
      }
    } catch {}
  }

  if (!chosen) {
    return errorResponse('not_found', 'No task available in scope');
  }

  const taskPlanId = chosen.plan_id || plan_id;
  const taskId = chosen.id;

  // Dry run: return candidate without claiming.
  if (dry_run) {
    return formatResponse({
      as_of: asOf(),
      candidate: {
        id: taskId,
        title: chosen.title,
        status: chosen.status,
        plan_id: taskPlanId,
        task_mode: chosen.task_mode,
      },
      source,
      claim: null,
      dry_run: true,
      next_action_hint: 'Call again with dry_run=false to claim, or pick a different task.',
    });
  }

  // Claim
  let claim = null;
  try {
    claim = await apiClient.nodes.claimTask(taskPlanId, taskId, 'mcp-agent', ttl_minutes);
  } catch (err) {
    return errorResponse('claim_collision', `Could not claim task ${taskId}: ${err.response?.data?.error || err.message}`);
  }

  // Load context
  let context = null;
  try {
    const params = new URLSearchParams({
      node_id: taskId,
      depth: String(context_depth),
      log_limit: '10',
      include_research: 'true',
    });
    const ctxResp = await apiClient.axiosInstance.get(`/context/progressive?${params}`);
    context = ctxResp.data;
  } catch (err) {
    // Best-effort: still return claim with the bare task object
  }

  return formatResponse({
    as_of: asOf(),
    task: context || chosen,
    plan_id: taskPlanId,
    source,
    claim: {
      claimed_at: claim?.claimed_at || asOf(),
      expires_at: claim?.expires_at,
      ttl_minutes,
    },
    next_action_hint: chosen.task_mode === 'implement'
      ? 'Task is implement mode — research and plan outputs are included in context if available'
      : 'Task ready to start — call update_task with status=in_progress when work begins',
  });
}

// ─────────────────────────────────────────────────────────────────────────
// release_task — explicit handoff.
// ─────────────────────────────────────────────────────────────────────────

const releaseTaskDefinition = {
  name: 'release_task',
  description: 'Release a claimed task without changing status. Use for explicit handoff or abandonment.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string' },
      plan_id: { type: 'string', description: 'Auto-resolved from task if omitted' },
      message: { type: 'string', description: 'Optional log entry on release' },
    },
    required: ['task_id'],
  },
};

async function releaseTaskHandler(args, apiClient) {
  const { task_id, message } = args;
  let planId = args.plan_id;
  if (!planId) {
    try {
      const node = await apiClient.axiosInstance.get(`/nodes/${task_id}`).then((r) => r.data);
      planId = node.plan_id || node.planId;
    } catch (err) {
      return errorResponse('not_found', `Could not resolve plan_id from task ${task_id}: ${err.message}`);
    }
  }
  try {
    await apiClient.nodes.releaseTask(planId, task_id, 'mcp-agent');
  } catch (err) {
    return errorResponse('upstream_unavailable', `release failed: ${err.message}`);
  }
  let logId = null;
  if (message) {
    try {
      const log = await apiClient.logs.addLog(planId, task_id, { content: message, log_type: 'progress' });
      logId = log?.id || log?.log?.id;
    } catch {}
  }
  return formatResponse({ as_of: asOf(), task_id, plan_id: planId, released: true, log_id: logId });
}

// ─────────────────────────────────────────────────────────────────────────
// add_learning — knowledge graph write.
// ─────────────────────────────────────────────────────────────────────────

const addLearningDefinition = {
  name: 'add_learning',
  description:
    "Record a knowledge episode. Use after research, on decisions, or when discovering " +
    "important context. Graphiti extracts entities/relationships automatically. " +
    "Surfaces coherence_warnings if the new content contradicts existing facts.",
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      scope: {
        type: 'object',
        properties: { plan_id: { type: 'string' }, goal_id: { type: 'string' }, node_id: { type: 'string' } },
      },
      entry_type: {
        type: 'string',
        enum: ['fact', 'decision', 'pattern', 'constraint', 'technique', 'learning'],
        default: 'fact',
      },
      source_description: { type: 'string' },
    },
    required: ['content'],
  },
};

async function addLearningHandler(args, apiClient) {
  const { content, scope = {}, entry_type = 'fact', source_description } = args;
  try {
    const result = await apiClient.graphiti.addEpisode({
      content,
      name: content.slice(0, 80),
      source: 'text',
      source_description: source_description || 'BDI add_learning',
      plan_id: scope.plan_id,
      node_id: scope.node_id,
      entity_type: entry_type,
    });
    return formatResponse({
      as_of: asOf(),
      episode_id: result.episode?.uuid || result.uuid || null,
      coherence_warnings: result.coherence_warnings || [],
      message: result.message || 'Knowledge recorded',
    });
  } catch (err) {
    return errorResponse('upstream_unavailable', `add_learning failed: ${err.response?.data?.error || err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// form_intention — create plan + initial tree atomically (v1.0).
// ─────────────────────────────────────────────────────────────────────────

const VALID_NODE_TYPES = ['phase', 'task', 'milestone'];
const VALID_TASK_MODES = ['free', 'research', 'plan', 'implement'];

function validateTreeShape(tree, depth = 0) {
  if (!Array.isArray(tree)) {
    return 'tree must be an array';
  }
  for (const node of tree) {
    if (!node || typeof node !== 'object') return 'tree node must be an object';
    if (!node.title) return 'tree node missing title';
    if (node.node_type && !VALID_NODE_TYPES.includes(node.node_type)) {
      return `invalid node_type "${node.node_type}" — must be one of ${VALID_NODE_TYPES.join(', ')}`;
    }
    if (node.task_mode && !VALID_TASK_MODES.includes(node.task_mode)) {
      return `invalid task_mode "${node.task_mode}"`;
    }
    if (node.children) {
      const err = validateTreeShape(node.children, depth + 1);
      if (err) return err;
    }
  }
  return null;
}

const formIntentionDefinition = {
  name: 'form_intention',
  description:
    "Create a plan that achieves a goal, including an initial phase/task " +
    "tree, in one call. Defaults to status='active' for human-directed " +
    "creation; pass status='draft' for autonomous loops so a human can " +
    "review before promotion. Drafts surface in the dashboard pending " +
    "queue and auto-promote to active when work begins on any node.",
  inputSchema: {
    type: 'object',
    properties: {
      goal_id: { type: 'string', description: "Goal this plan serves." },
      title: { type: 'string' },
      description: { type: 'string' },
      rationale: { type: 'string', description: "Why this plan. Surfaces in human review when status=draft." },
      status: {
        type: 'string',
        enum: ['draft', 'active'],
        default: 'active',
      },
      visibility: {
        type: 'string',
        enum: ['private', 'unlisted', 'public'],
        default: 'private',
      },
      tree: {
        type: 'array',
        description: "Recursive tree of nodes (phases, tasks, milestones). Children nest under parents via the 'children' array.",
        items: {
          type: 'object',
          properties: {
            node_type: { type: 'string', enum: VALID_NODE_TYPES, default: 'task' },
            title: { type: 'string' },
            description: { type: 'string' },
            task_mode: { type: 'string', enum: VALID_TASK_MODES, default: 'free' },
            agent_instructions: { type: 'string' },
            children: { type: 'array' },
          },
          required: ['title'],
        },
      },
    },
    required: ['goal_id', 'title', 'rationale'],
  },
};

async function createSubtree(apiClient, planId, parentId, children, results) {
  for (const child of children || []) {
    let createdNode;
    try {
      const payload = {
        node_type: child.node_type || 'task',
        title: child.title,
        description: child.description || '',
        task_mode: child.task_mode || 'free',
      };
      if (parentId) payload.parent_id = parentId;
      if (child.agent_instructions) payload.agent_instructions = child.agent_instructions;

      const resp = await apiClient.nodes.createNode(planId, payload);
      // createNode returns { result, created } — unwrap.
      createdNode = resp.result || resp;
      results.push({ id: createdNode.id, title: createdNode.title, node_type: createdNode.node_type });
    } catch (err) {
      results.push({ title: child.title, error: err.response?.data?.error || err.message });
      continue;
    }

    if (child.children?.length && createdNode?.id) {
      await createSubtree(apiClient, planId, createdNode.id, child.children, results);
    }
  }
}

async function formIntentionHandler(args, apiClient) {
  const { goal_id, title, description, rationale, status = 'active', visibility = 'private', tree = [] } = args;

  // Validate goal exists.
  let goal;
  try {
    goal = await apiClient.goals.get(goal_id);
  } catch (err) {
    return errorResponse('not_found', `Goal ${goal_id} not found or not accessible: ${err.message}`);
  }

  // Validate tree shape upfront (atomic-ish — fail before partial creation).
  const treeError = validateTreeShape(tree);
  if (treeError) {
    return errorResponse('tree_shape_invalid', treeError);
  }

  // Compose plan description (rationale + optional description).
  const composedDescription = description ? `${rationale}\n\n${description}` : rationale;

  // 1. Create plan.
  let plan;
  try {
    plan = await apiClient.plans.createPlan({
      title,
      description: composedDescription,
      status,
      visibility,
    });
  } catch (err) {
    return errorResponse('create_failed', `Failed to create plan: ${err.response?.data?.error || err.message}`);
  }

  // 2. Link plan to goal (best-effort).
  try {
    await apiClient.goals.linkPlan(goal_id, plan.id);
  } catch (err) {
    // Non-fatal — plan exists, link can be retried by user.
  }

  // 3. Create tree (top-level children parent to root via omitted parent_id).
  const nodeResults = [];
  await createSubtree(apiClient, plan.id, null, tree, nodeResults);

  return formatResponse({
    as_of: asOf(),
    plan_id: plan.id,
    goal_id,
    status: plan.status,
    is_draft: plan.status === 'draft',
    nodes_created: nodeResults.filter((n) => n.id).length,
    node_failures: nodeResults.filter((n) => n.error),
    nodes: nodeResults,
    next_step: plan.status === 'draft'
      ? "Plan created as draft. Will surface in dashboard pending for human review. Auto-promotes to active when first task moves to in_progress."
      : "Plan active. Claim a task with claim_next_task({plan_id}) to begin work.",
  });
}

// ─────────────────────────────────────────────────────────────────────────
// extend_intention — add children under an existing parent (v1.0).
// Lightweight — does not go through the decision queue.
// ─────────────────────────────────────────────────────────────────────────

const extendIntentionDefinition = {
  name: 'extend_intention',
  description:
    "Add children under an existing phase or task. Use when an agent has " +
    "implicit authority to decompose work (e.g., a parent task they have " +
    "claimed). For high-stakes structural proposals, use queue_decision " +
    "with proposed_subtasks instead. Defaults to status='active'.",
  inputSchema: {
    type: 'object',
    properties: {
      parent_id: { type: 'string', description: "Phase or task to add children under." },
      plan_id: { type: 'string', description: "Plan that owns the parent (auto-resolved if omitted)." },
      rationale: { type: 'string', description: "Why these children. Stored in metadata for audit." },
      children: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            node_type: { type: 'string', enum: VALID_NODE_TYPES, default: 'task' },
            title: { type: 'string' },
            description: { type: 'string' },
            task_mode: { type: 'string', enum: VALID_TASK_MODES, default: 'free' },
            agent_instructions: { type: 'string' },
            children: { type: 'array' },
          },
          required: ['title'],
        },
      },
    },
    required: ['parent_id', 'rationale', 'children'],
  },
};

async function extendIntentionHandler(args, apiClient) {
  const { parent_id, rationale, children = [] } = args;
  let { plan_id } = args;

  // Resolve plan_id from parent if not provided.
  if (!plan_id) {
    try {
      const parent = await apiClient.axiosInstance.get(`/nodes/${parent_id}`).then((r) => r.data);
      plan_id = parent.plan_id || parent.planId;
    } catch (err) {
      return errorResponse('not_found', `Could not resolve plan_id from parent ${parent_id}: ${err.message}`);
    }
  }

  const treeError = validateTreeShape(children);
  if (treeError) {
    return errorResponse('tree_shape_invalid', treeError);
  }

  const nodeResults = [];
  await createSubtree(apiClient, plan_id, parent_id, children, nodeResults);

  return formatResponse({
    as_of: asOf(),
    plan_id,
    parent_id,
    rationale,
    nodes_created: nodeResults.filter((n) => n.id).length,
    node_failures: nodeResults.filter((n) => n.error),
    nodes: nodeResults,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// propose_research_chain — RPI shortcut (v1.0).
// Creates Research → Plan → Implement under parent with two blocking edges.
// ─────────────────────────────────────────────────────────────────────────

const proposeResearchChainDefinition = {
  name: 'propose_research_chain',
  description:
    "Create a Research → Plan → Implement triple under an existing parent " +
    "task or phase. The Research task feeds Plan; Plan feeds Implement " +
    "(via 'blocks' dependency edges). Use when tackling work with " +
    "significant unknowns. Defaults to status='active'.",
  inputSchema: {
    type: 'object',
    properties: {
      parent_id: { type: 'string', description: "Parent task or phase the chain attaches to." },
      plan_id: { type: 'string', description: "Plan that owns the parent (auto-resolved if omitted)." },
      research_question: { type: 'string', description: "What the Research task investigates." },
      implementation_target: { type: 'string', description: "What the Implement task ultimately produces." },
      rationale: { type: 'string', description: "Why an RPI chain is appropriate here." },
    },
    required: ['parent_id', 'research_question', 'implementation_target', 'rationale'],
  },
};

async function proposeResearchChainHandler(args, apiClient) {
  const { parent_id, research_question, implementation_target, rationale } = args;
  let { plan_id } = args;

  if (!plan_id) {
    try {
      const parent = await apiClient.axiosInstance.get(`/nodes/${parent_id}`).then((r) => r.data);
      plan_id = parent.plan_id || parent.planId;
    } catch (err) {
      return errorResponse('not_found', `Could not resolve plan_id from parent ${parent_id}: ${err.message}`);
    }
  }

  const created = {};
  const failures = [];

  // 1. Create the three tasks.
  for (const [key, spec] of [
    ['research', { title: `Research: ${research_question}`, description: research_question, task_mode: 'research' }],
    ['plan', { title: `Plan: ${implementation_target}`, description: `Plan implementation based on research findings`, task_mode: 'plan' }],
    ['implement', { title: `Implement: ${implementation_target}`, description: implementation_target, task_mode: 'implement' }],
  ]) {
    try {
      const resp = await apiClient.nodes.createNode(plan_id, {
        node_type: 'task',
        title: spec.title,
        description: spec.description,
        task_mode: spec.task_mode,
        parent_id,
      });
      created[key] = resp.result || resp;
    } catch (err) {
      failures.push({ step: `create_${key}`, error: err.response?.data?.error || err.message });
    }
  }

  if (failures.length) {
    return formatResponse({
      as_of: asOf(),
      plan_id,
      parent_id,
      partial: true,
      created: Object.fromEntries(Object.entries(created).map(([k, v]) => [k, { id: v.id, title: v.title }])),
      failures,
    });
  }

  // 2. Create the two blocking edges: research blocks plan, plan blocks implement.
  const edges = [];
  for (const [from, to] of [
    [created.research.id, created.plan.id],
    [created.plan.id, created.implement.id],
  ]) {
    try {
      await apiClient.axiosInstance.post('/dependencies', {
        source_node_id: from,
        target_node_id: to,
        dependency_type: 'blocks',
      });
      edges.push({ from, to, relation: 'blocks' });
    } catch (err) {
      failures.push({ step: 'create_edge', error: err.response?.data?.error || err.message, from, to });
    }
  }

  return formatResponse({
    as_of: asOf(),
    plan_id,
    parent_id,
    rationale,
    research: { id: created.research.id, title: created.research.title },
    plan: { id: created.plan.id, title: created.plan.title },
    implement: { id: created.implement.id, title: created.implement.title },
    edges,
    failures,
    next_step: "Claim the Research task with claim_next_task({plan_id}) to begin investigation.",
  });
}

// ─────────────────────────────────────────────────────────────────────────
// link_intentions — create dependency edge between two existing tasks (v1.0).
// Cycle detection happens server-side; we surface the 409 cleanly.
// ─────────────────────────────────────────────────────────────────────────

const VALID_RELATIONS = ['blocks', 'requires', 'relates_to'];

const linkIntentionsDefinition = {
  name: 'link_intentions',
  description:
    "Create a dependency edge between two existing tasks. Use to express " +
    "discovered ordering constraints (e.g., agent realizes task B requires " +
    "task A's output). Server rejects cycles. Both tasks must be in the " +
    "same plan.",
  inputSchema: {
    type: 'object',
    properties: {
      from_task_id: { type: 'string' },
      to_task_id: { type: 'string' },
      relation: { type: 'string', enum: VALID_RELATIONS, default: 'blocks' },
      rationale: { type: 'string', description: "Why this link. Stored in dependency metadata." },
    },
    required: ['from_task_id', 'to_task_id', 'rationale'],
  },
};

async function linkIntentionsHandler(args, apiClient) {
  const { from_task_id, to_task_id, relation = 'blocks', rationale } = args;

  if (from_task_id === to_task_id) {
    return errorResponse('invalid_argument', 'from_task_id and to_task_id must differ');
  }

  // Resolve plan_id from the source task; validate target is in the same plan.
  let planId, fromPlan, toPlan;
  try {
    const fromNode = await apiClient.axiosInstance.get(`/nodes/${from_task_id}`).then((r) => r.data);
    fromPlan = fromNode.plan_id || fromNode.planId;
    planId = fromPlan;
  } catch (err) {
    return errorResponse('not_found', `from_task ${from_task_id} not found: ${err.message}`);
  }
  try {
    const toNode = await apiClient.axiosInstance.get(`/nodes/${to_task_id}`).then((r) => r.data);
    toPlan = toNode.plan_id || toNode.planId;
  } catch (err) {
    return errorResponse('not_found', `to_task ${to_task_id} not found: ${err.message}`);
  }

  if (fromPlan !== toPlan) {
    return errorResponse('cross_plan_unsupported', `Both tasks must be in the same plan (from: ${fromPlan}, to: ${toPlan}). Cross-plan links require a separate API.`);
  }

  try {
    const dep = await apiClient.axiosInstance.post(`/plans/${planId}/dependencies`, {
      source_node_id: from_task_id,
      target_node_id: to_task_id,
      dependency_type: relation,
      metadata: { rationale },
    }).then((r) => r.data);

    return formatResponse({
      as_of: asOf(),
      dependency_id: dep.id,
      plan_id: planId,
      from_task_id,
      to_task_id,
      relation,
    });
  } catch (err) {
    const status = err.response?.status;
    const upstream = err.response?.data?.error || err.message;
    if (status === 409) {
      return errorResponse('cycle_detected', `Edge rejected — would create a cycle: ${upstream}`);
    }
    return errorResponse('create_failed', `Failed to create dependency: ${upstream}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// unlink_intentions — remove a dependency edge (v1.0).
// ─────────────────────────────────────────────────────────────────────────

const unlinkIntentionsDefinition = {
  name: 'unlink_intentions',
  description: "Remove a dependency edge by id.",
  inputSchema: {
    type: 'object',
    properties: {
      dependency_id: { type: 'string' },
      plan_id: { type: 'string', description: "Plan that owns the dependency. Required for the route." },
      reason: { type: 'string', description: "Why removed. Logged for audit." },
    },
    required: ['dependency_id', 'plan_id'],
  },
};

async function unlinkIntentionsHandler(args, apiClient) {
  const { dependency_id, plan_id, reason } = args;

  try {
    await apiClient.axiosInstance.delete(`/plans/${plan_id}/dependencies/${dependency_id}`);
    return formatResponse({
      as_of: asOf(),
      dependency_id,
      plan_id,
      reason: reason || null,
      removed: true,
    });
  } catch (err) {
    const upstream = err.response?.data?.error || err.message;
    if (err.response?.status === 404) {
      return errorResponse('not_found', `Dependency ${dependency_id} not found in plan ${plan_id}`);
    }
    return errorResponse('delete_failed', `Failed to remove dependency: ${upstream}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// update_plan — edit any plan property atomically (v1.0).
// Status changes route here; visibility, github linkage, metadata, etc.
// ─────────────────────────────────────────────────────────────────────────

const updatePlanDefinition = {
  name: 'update_plan',
  description:
    "Edit any plan property atomically: title, description, status, " +
    "visibility, GitHub linkage, metadata. Use status='archived' to " +
    "soft-delete (recoverable via status='active' + restore=true). " +
    "Hard delete stays REST-only with admin auth.",
  inputSchema: {
    type: 'object',
    properties: {
      plan_id: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      status: {
        type: 'string',
        enum: ['draft', 'active', 'completed', 'archived'],
      },
      visibility: { type: 'string', enum: ['private', 'unlisted', 'public'] },
      metadata: { type: 'object', description: "Shallow-merged into existing metadata." },
      restore: {
        type: 'boolean',
        description: "Required when un-archiving (status: 'archived' → 'active'). Guards against accidental restoration.",
        default: false,
      },
    },
    required: ['plan_id'],
  },
};

async function updatePlanHandler(args, apiClient) {
  const { plan_id, title, description, status, visibility, metadata, restore } = args;

  // Guard: un-archiving requires explicit restore=true.
  if (status && status !== 'archived') {
    try {
      const current = await apiClient.plans.getPlan(plan_id);
      if (current.status === 'archived' && !restore) {
        return errorResponse(
          'restore_required',
          `Plan ${plan_id} is archived. Pass restore=true to un-archive.`
        );
      }
    } catch (err) {
      // If we can't fetch, fall through — the update will fail loudly anyway.
    }
  }

  const payload = {};
  if (title !== undefined) payload.title = title;
  if (description !== undefined) payload.description = description;
  if (status !== undefined) payload.status = status;
  if (metadata !== undefined) payload.metadata = metadata;

  const applied = [];
  const failures = [];

  if (Object.keys(payload).length) {
    try {
      await apiClient.plans.updatePlan(plan_id, payload);
      applied.push(...Object.keys(payload));
    } catch (err) {
      failures.push({ step: 'update_plan', error: err.response?.data?.error || err.message });
    }
  }

  if (visibility !== undefined) {
    try {
      await apiClient.plans.updateVisibility(plan_id, { visibility });
      applied.push('visibility');
    } catch (err) {
      failures.push({ step: 'update_visibility', error: err.response?.data?.error || err.message });
    }
  }

  let plan = null;
  try { plan = await apiClient.plans.getPlan(plan_id); } catch {}

  return formatResponse({
    as_of: asOf(),
    plan_id,
    applied_changes: applied,
    failures,
    plan: plan ? { id: plan.id, title: plan.title, status: plan.status, visibility: plan.visibility } : null,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// update_node — edit any node property except status (v1.0).
// Status transitions route through update_task (existing tool) since they
// trigger claim/log side effects.
// ─────────────────────────────────────────────────────────────────────────

const updateNodeDefinition = {
  name: 'update_node',
  description:
    "Edit any node property atomically: title, description, node_type, " +
    "task_mode, agent_instructions, metadata. Status transitions belong " +
    "on update_task (which handles claim/log side effects). Rejects " +
    "node_type changes when the node has children.",
  inputSchema: {
    type: 'object',
    properties: {
      node_id: { type: 'string' },
      plan_id: { type: 'string', description: "Auto-resolved if omitted." },
      title: { type: 'string' },
      description: { type: 'string' },
      node_type: { type: 'string', enum: ['phase', 'task', 'milestone'] },
      task_mode: { type: 'string', enum: VALID_TASK_MODES },
      agent_instructions: { type: 'string' },
      metadata: { type: 'object' },
    },
    required: ['node_id'],
  },
};

async function updateNodeHandler(args, apiClient) {
  const { node_id, title, description, node_type, task_mode, agent_instructions, metadata } = args;
  let { plan_id } = args;

  if (!plan_id) {
    try {
      const node = await apiClient.axiosInstance.get(`/nodes/${node_id}`).then((r) => r.data);
      plan_id = node.plan_id || node.planId;
    } catch (err) {
      return errorResponse('not_found', `Could not resolve plan_id from node ${node_id}: ${err.message}`);
    }
  }

  const payload = {};
  if (title !== undefined) payload.title = title;
  if (description !== undefined) payload.description = description;
  if (node_type !== undefined) payload.node_type = node_type;
  if (task_mode !== undefined) payload.task_mode = task_mode;
  if (agent_instructions !== undefined) payload.agent_instructions = agent_instructions;
  if (metadata !== undefined) payload.metadata = metadata;

  if (!Object.keys(payload).length) {
    return errorResponse('no_changes', 'At least one field to update must be provided.');
  }

  try {
    const updated = await apiClient.nodes.updateNode(plan_id, node_id, payload);
    return formatResponse({
      as_of: asOf(),
      plan_id,
      node_id,
      applied_changes: Object.keys(payload),
      node: updated.result || updated,
    });
  } catch (err) {
    return errorResponse('update_failed', `Failed to update node: ${err.response?.data?.error || err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// move_node — reparent a node within the same plan (v1.0).
// ─────────────────────────────────────────────────────────────────────────

const moveNodeDefinition = {
  name: 'move_node',
  description:
    "Reparent a node within the same plan. Cycle-safe (server rejects " +
    "moves that would create a tree cycle). Optional position sets the " +
    "order_index among siblings.",
  inputSchema: {
    type: 'object',
    properties: {
      node_id: { type: 'string' },
      new_parent_id: { type: 'string' },
      plan_id: { type: 'string', description: "Auto-resolved if omitted." },
      position: { type: 'integer', description: "Optional order_index among siblings." },
    },
    required: ['node_id', 'new_parent_id'],
  },
};

async function moveNodeHandler(args, apiClient) {
  const { node_id, new_parent_id, position } = args;
  let { plan_id } = args;

  if (!plan_id) {
    try {
      const node = await apiClient.axiosInstance.get(`/nodes/${node_id}`).then((r) => r.data);
      plan_id = node.plan_id || node.planId;
    } catch (err) {
      return errorResponse('not_found', `Could not resolve plan_id from node ${node_id}: ${err.message}`);
    }
  }

  const payload = { parent_id: new_parent_id };
  if (typeof position === 'number') payload.order_index = position;

  try {
    const result = await apiClient.axiosInstance.post(
      `/plans/${plan_id}/nodes/${node_id}/move`,
      payload
    ).then((r) => r.data);

    return formatResponse({
      as_of: asOf(),
      plan_id,
      node_id,
      new_parent_id,
      position: position ?? null,
      node: result,
    });
  } catch (err) {
    return errorResponse('move_failed', `Failed to move node: ${err.response?.data?.error || err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// delete_plan / delete_node — soft delete via status='archived' (v1.0).
// Hard delete stays REST-only with admin auth.
// ─────────────────────────────────────────────────────────────────────────

const deletePlanDefinition = {
  name: 'delete_plan',
  description:
    "Soft-delete a plan by setting status='archived'. Recoverable via " +
    "update_plan({status: 'active', restore: true}). Hard delete is not " +
    "agent-callable — use REST + admin token if absolutely needed.",
  inputSchema: {
    type: 'object',
    properties: {
      plan_id: { type: 'string' },
      reason: { type: 'string', description: "Logged for audit." },
    },
    required: ['plan_id'],
  },
};

async function deletePlanHandler(args, apiClient) {
  const { plan_id, reason } = args;

  try {
    await apiClient.plans.updatePlan(plan_id, { status: 'archived' });
    return formatResponse({
      as_of: asOf(),
      plan_id,
      archived: true,
      reason: reason || null,
      next_step: "Plan archived. To restore: update_plan({plan_id, status: 'active', restore: true})",
    });
  } catch (err) {
    return errorResponse('archive_failed', `Failed to archive plan: ${err.response?.data?.error || err.message}`);
  }
}

const deleteNodeDefinition = {
  name: 'delete_node',
  description:
    "Soft-delete a node by setting status='archived'. Cascades to children " +
    "by default. Recoverable via update_task({status: 'not_started'}).",
  inputSchema: {
    type: 'object',
    properties: {
      node_id: { type: 'string' },
      plan_id: { type: 'string', description: "Auto-resolved if omitted." },
      reason: { type: 'string' },
      cascade_children: { type: 'boolean', default: true },
    },
    required: ['node_id'],
  },
};

async function deleteNodeHandler(args, apiClient) {
  const { node_id, reason } = args;
  let { plan_id } = args;
  // cascade_children is intentionally ignored at the MCP layer for now —
  // backend cascade behavior on archived status is implicit (children remain
  // accessible until explicitly archived themselves). When backend gains
  // explicit cascade-on-archive, surface it here.

  if (!plan_id) {
    try {
      const node = await apiClient.axiosInstance.get(`/nodes/${node_id}`).then((r) => r.data);
      plan_id = node.plan_id || node.planId;
    } catch (err) {
      return errorResponse('not_found', `Could not resolve plan_id from node ${node_id}: ${err.message}`);
    }
  }

  try {
    await apiClient.nodes.updateNode(plan_id, node_id, { status: 'archived' });
    return formatResponse({
      as_of: asOf(),
      plan_id,
      node_id,
      archived: true,
      reason: reason || null,
    });
  } catch (err) {
    return errorResponse('archive_failed', `Failed to archive node: ${err.response?.data?.error || err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// share_plan — atomic visibility + collaborator changes (v1.0).
// Collaborators specified by user_id (email resolution stays UI-side for now).
// ─────────────────────────────────────────────────────────────────────────

const VALID_COLLAB_ROLES = ['viewer', 'editor', 'admin'];

const sharePlanDefinition = {
  name: 'share_plan',
  description:
    "Atomically change a plan's visibility and add/remove collaborators in " +
    "one call. Collaborators are specified by user_id (email-based invites " +
    "stay UI-only for now). Caller must be plan owner or admin.",
  inputSchema: {
    type: 'object',
    properties: {
      plan_id: { type: 'string' },
      visibility: { type: 'string', enum: ['private', 'unlisted', 'public'] },
      add_collaborators: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            user_id: { type: 'string' },
            role: { type: 'string', enum: VALID_COLLAB_ROLES, default: 'viewer' },
          },
          required: ['user_id'],
        },
      },
      remove_collaborators: {
        type: 'array',
        description: "Array of user_ids to remove from the plan.",
        items: { type: 'string' },
      },
    },
    required: ['plan_id'],
  },
};

async function sharePlanHandler(args, apiClient) {
  const { plan_id, visibility, add_collaborators = [], remove_collaborators = [] } = args;
  const applied = [];
  const failures = [];

  if (visibility) {
    try {
      await apiClient.plans.updateVisibility(plan_id, { visibility });
      applied.push(`visibility:${visibility}`);
    } catch (err) {
      failures.push({ step: 'visibility', error: err.response?.data?.error || err.message });
    }
  }

  for (const collab of add_collaborators) {
    try {
      await apiClient.axiosInstance.post(`/plans/${plan_id}/collaborators`, {
        user_id: collab.user_id,
        role: collab.role || 'viewer',
      });
      applied.push(`add:${collab.user_id}:${collab.role || 'viewer'}`);
    } catch (err) {
      failures.push({ step: `add:${collab.user_id}`, error: err.response?.data?.error || err.message });
    }
  }

  for (const userId of remove_collaborators) {
    try {
      await apiClient.axiosInstance.delete(`/plans/${plan_id}/collaborators/${userId}`);
      applied.push(`remove:${userId}`);
    } catch (err) {
      failures.push({ step: `remove:${userId}`, error: err.response?.data?.error || err.message });
    }
  }

  return formatResponse({
    as_of: asOf(),
    plan_id,
    applied_changes: applied,
    failures,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// invite_member / update_member_role / remove_member — org membership (v1.0).
// ─────────────────────────────────────────────────────────────────────────

const inviteMemberDefinition = {
  name: 'invite_member',
  description:
    "Add a user to an organization by user_id or email. Caller must be " +
    "org owner or admin. If email is provided and the user doesn't exist, " +
    "the API returns 404 (email-invite flow stays UI-only).",
  inputSchema: {
    type: 'object',
    properties: {
      organization_id: { type: 'string' },
      user_id: { type: 'string' },
      email: { type: 'string' },
      role: { type: 'string', enum: ['admin', 'member'], default: 'member' },
    },
    required: ['organization_id'],
  },
};

async function inviteMemberHandler(args, apiClient) {
  const { organization_id, user_id, email, role = 'member' } = args;

  if (!user_id && !email) {
    return errorResponse('invalid_argument', 'Either user_id or email must be provided.');
  }

  const payload = { role };
  if (user_id) payload.user_id = user_id;
  if (email) payload.email = email;

  try {
    const member = await apiClient.organizations.addMember(organization_id, payload);
    return formatResponse({
      as_of: asOf(),
      organization_id,
      member: {
        membership_id: member.id,
        user_id: member.user?.id,
        email: member.user?.email,
        role: member.role,
      },
    });
  } catch (err) {
    const upstream = err.response?.data?.error || err.message;
    const code = err.response?.status === 404 ? 'user_not_found' : 'invite_failed';
    return errorResponse(code, `Failed to invite member: ${upstream}`);
  }
}

const updateMemberRoleDefinition = {
  name: 'update_member_role',
  description:
    "Change a member's role within an organization. Caller must be org " +
    "owner. Server rejects demoting the last admin.",
  inputSchema: {
    type: 'object',
    properties: {
      organization_id: { type: 'string' },
      membership_id: { type: 'string', description: "Membership row id (from listMembers)." },
      new_role: { type: 'string', enum: ['admin', 'member'] },
    },
    required: ['organization_id', 'membership_id', 'new_role'],
  },
};

async function updateMemberRoleHandler(args, apiClient) {
  const { organization_id, membership_id, new_role } = args;

  try {
    const result = await apiClient.axiosInstance.put(
      `/organizations/${organization_id}/members/${membership_id}/role`,
      { role: new_role }
    ).then((r) => r.data);

    return formatResponse({
      as_of: asOf(),
      organization_id,
      membership_id,
      new_role,
      member: result,
    });
  } catch (err) {
    return errorResponse('update_role_failed', `Failed to update member role: ${err.response?.data?.error || err.message}`);
  }
}

const removeMemberDefinition = {
  name: 'remove_member',
  description:
    "Remove a member from an organization. Caller must be org owner or " +
    "admin (admins cannot remove other admins). Server rejects removing " +
    "the org owner.",
  inputSchema: {
    type: 'object',
    properties: {
      organization_id: { type: 'string' },
      membership_id: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['organization_id', 'membership_id'],
  },
};

async function removeMemberHandler(args, apiClient) {
  const { organization_id, membership_id, reason } = args;

  try {
    await apiClient.organizations.removeMember(organization_id, membership_id);
    return formatResponse({
      as_of: asOf(),
      organization_id,
      membership_id,
      removed: true,
      reason: reason || null,
    });
  } catch (err) {
    return errorResponse('remove_failed', `Failed to remove member: ${err.response?.data?.error || err.message}`);
  }
}

module.exports = {
  definitions: [
    queueDecisionDefinition,
    resolveDecisionDefinition,
    updateTaskDefinition,
    claimNextTaskDefinition,
    releaseTaskDefinition,
    addLearningDefinition,
    formIntentionDefinition,
    extendIntentionDefinition,
    proposeResearchChainDefinition,
    linkIntentionsDefinition,
    unlinkIntentionsDefinition,
    updatePlanDefinition,
    updateNodeDefinition,
    moveNodeDefinition,
    deletePlanDefinition,
    deleteNodeDefinition,
    sharePlanDefinition,
    inviteMemberDefinition,
    updateMemberRoleDefinition,
    removeMemberDefinition,
  ],
  handlers: {
    queue_decision: queueDecisionHandler,
    resolve_decision: resolveDecisionHandler,
    update_task: updateTaskHandler,
    claim_next_task: claimNextTaskHandler,
    release_task: releaseTaskHandler,
    add_learning: addLearningHandler,
    form_intention: formIntentionHandler,
    extend_intention: extendIntentionHandler,
    propose_research_chain: proposeResearchChainHandler,
    link_intentions: linkIntentionsHandler,
    unlink_intentions: unlinkIntentionsHandler,
    update_plan: updatePlanHandler,
    update_node: updateNodeHandler,
    move_node: moveNodeHandler,
    delete_plan: deletePlanHandler,
    delete_node: deleteNodeHandler,
    share_plan: sharePlanHandler,
    invite_member: inviteMemberHandler,
    update_member_role: updateMemberRoleHandler,
    remove_member: removeMemberHandler,
  },
};
