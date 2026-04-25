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
    },
    required: ['title', 'context', 'smallest_input_needed'],
  },
};

async function queueDecisionHandler(args, apiClient) {
  const { plan_id, node_id, title, context, options, recommendation, smallest_input_needed, urgency, goal_id } = args;

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
    metadata: { smallest_input_needed, goal_id: goal_id || null, source: 'bdi.queue_decision' },
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
  try {
    const resolved = await apiClient.axiosInstance
      .post(`/plans/${plan_id}/decisions/${decision_id}/resolve`, {
        resolution: action,
        message: message || null,
        selected_option: selected_option || null,
      })
      .then((r) => r.data);
    return formatResponse({
      as_of: asOf(),
      decision_id,
      plan_id,
      status: resolved.status || action,
      resolved_at: resolved.resolved_at || asOf(),
      message: resolved.message || message || null,
    });
  } catch (err) {
    return errorResponse(
      'upstream_unavailable',
      `Failed to resolve decision: ${err.response?.data?.error || err.message}`
    );
  }
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

module.exports = {
  definitions: [queueDecisionDefinition, resolveDecisionDefinition, updateTaskDefinition],
  handlers: {
    queue_decision: queueDecisionHandler,
    resolve_decision: resolveDecisionHandler,
    update_task: updateTaskHandler,
  },
};
