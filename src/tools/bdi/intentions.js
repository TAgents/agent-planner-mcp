/**
 * BDI intentions — committed actions.
 *
 * v0.9.0 ships queue_decision, resolve_decision, and update_task first.
 * Other intention tools (claim_next_task, release_task, add_learning) land in
 * subsequent passes.
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

module.exports = {
  definitions: [
    queueDecisionDefinition,
    resolveDecisionDefinition,
    updateTaskDefinition,
    claimNextTaskDefinition,
    releaseTaskDefinition,
    addLearningDefinition,
  ],
  handlers: {
    queue_decision: queueDecisionHandler,
    resolve_decision: resolveDecisionHandler,
    update_task: updateTaskHandler,
    claim_next_task: claimNextTaskHandler,
    release_task: releaseTaskHandler,
    add_learning: addLearningHandler,
  },
};
