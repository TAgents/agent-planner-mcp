/**
 * BDI beliefs — state queries.
 *
 * 6 tools: briefing, task_context, goal_state, recall_knowledge, search,
 * plan_analysis. Each answers one whole agentic question and returns `as_of`.
 */

const { asOf, formatResponse, errorResponse, safeArray } = require('./_shared');

// ─────────────────────────────────────────────────────────────────────────
// briefing — bundled mission control state. Replaces 4 round trips.
// ─────────────────────────────────────────────────────────────────────────

const briefingDefinition = {
  name: 'briefing',
  description:
    "Mission control state in one call. Returns goal health summary, " +
    "pending decisions, my tasks, recent activity, and a top recommendation. " +
    "Use this as the single read for Cowork live artifacts and the autopilot's " +
    "first call.",
  inputSchema: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['mission_control', 'task_session', 'org'], default: 'mission_control' },
      goal_id: { type: 'string' },
      plan_id: { type: 'string' },
      recent_window_hours: { type: 'number', default: 24 },
    },
  },
};

async function briefingHandler(args, apiClient) {
  const recentHours = typeof args.recent_window_hours === 'number' ? args.recent_window_hours : 24;
  const recentSinceMs = Date.now() - recentHours * 3600 * 1000;

  const [dashboardRes, pendingRes, myTasksRes, coherenceRes, episodesRes] = await Promise.allSettled([
    apiClient.goals.getDashboard(),
    apiClient.axiosInstance.get('/dashboard/pending', { params: { limit: 10 } }),
    apiClient.users.getMyTasks(),
    apiClient.coherence.getPending(),
    apiClient.graphiti.getEpisodes({ max_episodes: 20 }),
  ]);

  const failures = [];
  function unwrap(settled, label, defaultValue) {
    if (settled.status === 'fulfilled') return settled.value;
    failures.push({ source: label, message: settled.reason?.message || String(settled.reason) });
    return defaultValue;
  }

  const dashboard = unwrap(dashboardRes, 'goals.dashboard', { goals: [] });
  const pendingResp = unwrap(pendingRes, 'dashboard.pending', { data: { decisions: [], agent_requests: [] } });
  const pending = pendingResp.data || pendingResp || { decisions: [], agent_requests: [] };
  const myTasks = unwrap(myTasksRes, 'users.getMyTasks', { tasks: [] });
  const coherencePending = unwrap(coherenceRes, 'coherence.pending', { plans: [], goals: [] });
  const episodes = unwrap(episodesRes, 'graphiti.episodes', { episodes: { episodes: [] } });

  let goals = safeArray(dashboard.goals);
  if (args.goal_id) goals = goals.filter((g) => g.id === args.goal_id);

  const goalSummary = goals.reduce(
    (acc, g) => {
      const h = g.health || 'on_track';
      acc[h] = (acc[h] || 0) + 1;
      acc.total += 1;
      return acc;
    },
    { on_track: 0, at_risk: 0, stale: 0, total: 0 }
  );

  let decisions = safeArray(pending.decisions);
  if (args.plan_id) decisions = decisions.filter((d) => d.plan_id === args.plan_id);

  let agentRequests = safeArray(pending.agent_requests);
  if (args.plan_id) agentRequests = agentRequests.filter((r) => r.plan_id === args.plan_id);

  const tasks = safeArray(myTasks.tasks || myTasks);
  const myTasksBucketed = {
    in_progress: tasks.filter((t) => t.status === 'in_progress'),
    blocked: tasks.filter((t) => t.status === 'blocked'),
    recently_completed: tasks.filter((t) => {
      if (t.status !== 'completed') return false;
      const at = t.updated_at || t.completed_at;
      return at && new Date(at).getTime() >= recentSinceMs;
    }),
  };

  const allEpisodes = safeArray(episodes.episodes?.episodes || episodes.episodes);
  const recentActivity = allEpisodes
    .filter((e) => e.created_at && new Date(e.created_at).getTime() >= recentSinceMs)
    .map((e) => ({
      type: 'episode',
      ref_id: e.uuid,
      summary: e.name || (e.content && e.content.slice(0, 200)),
      occurred_at: e.created_at,
      source: e.source,
    }));

  const topRecommendation = (() => {
    const atRisk = goals.filter((g) => g.health === 'at_risk');
    let best = null;
    for (const g of atRisk) {
      for (const b of safeArray(g.bottleneck_summary)) {
        if (!best || (b.direct_downstream_count || 0) > (best.direct_downstream_count || 0)) {
          best = { ...b, goal_id: g.id, goal_title: g.title };
        }
      }
    }
    if (!best) return null;
    return {
      goal_id: best.goal_id,
      suggested_action: `Unblock task "${best.title}" — it gates ${best.direct_downstream_count || 0} downstream task(s)`,
      reasoning: `On at_risk goal "${best.goal_title}", this is the bottleneck with the highest direct_downstream_count`,
      node_id: best.node_id,
    };
  })();

  const coherencePendingList = [
    ...safeArray(coherencePending.plans).map((p) => ({
      id: p.id,
      type: 'plan',
      title: p.title,
      last_check_age_hours:
        p.coherence_checked_at
          ? Math.round((Date.now() - new Date(p.coherence_checked_at).getTime()) / 3600 / 1000)
          : null,
    })),
    ...safeArray(coherencePending.goals).map((g) => ({
      id: g.id,
      type: 'goal',
      title: g.title,
      last_check_age_hours:
        g.coherence_checked_at
          ? Math.round((Date.now() - new Date(g.coherence_checked_at).getTime()) / 3600 / 1000)
          : null,
    })),
  ];

  return formatResponse({
    as_of: asOf(),
    scope: args.scope || 'mission_control',
    goal_health: {
      summary: goalSummary,
      goals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        health: g.health,
        priority: g.priority,
        bottleneck_summary: g.bottleneck_summary,
        last_activity: g.last_activity,
        pending_decision_count: g.pending_decision_count,
      })),
    },
    pending_decisions: decisions,
    pending_agent_requests: agentRequests,
    my_tasks: myTasksBucketed,
    recent_activity: recentActivity,
    top_recommendation: topRecommendation,
    coherence_pending: coherencePendingList,
    meta: { partial: failures.length > 0, failures },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// task_context — single task at progressive depth (1-4).
// ─────────────────────────────────────────────────────────────────────────

const taskContextDefinition = {
  name: 'task_context',
  description:
    "Get progressive context for a task. Depth: 1 (task only), 2 (+ neighborhood), " +
    "3 (+ knowledge), 4 (+ extended plan/goals/transitive deps). For RPI implement " +
    "tasks, automatically includes research+plan outputs from the chain.",
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string' },
      depth: { type: 'integer', enum: [1, 2, 3, 4], default: 2 },
      token_budget: { type: 'integer', default: 0 },
    },
    required: ['task_id'],
  },
};

async function taskContextHandler(args, apiClient) {
  const { task_id, depth = 2, token_budget = 0 } = args;
  const params = new URLSearchParams({
    node_id: task_id,
    depth: String(depth),
    token_budget: String(token_budget),
    log_limit: '10',
    include_research: 'true',
  });
  try {
    const response = await apiClient.axiosInstance.get(`/context/progressive?${params}`);
    return formatResponse({ as_of: asOf(), ...response.data });
  } catch (err) {
    return errorResponse('upstream_unavailable', `Failed to load task context: ${err.response?.data?.error || err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// goal_state — single-goal deep dive. Replaces 5 separate goal reads.
// ─────────────────────────────────────────────────────────────────────────

const goalStateDefinition = {
  name: 'goal_state',
  description:
    "Comprehensive single-goal read: details, quality assessment, progress, " +
    "bottlenecks, knowledge gaps, pending decisions, recent activity. " +
    "Replaces get_goal + goal_path + goal_progress + goal_knowledge_gaps + assess_goal_quality.",
  inputSchema: {
    type: 'object',
    properties: { goal_id: { type: 'string' } },
    required: ['goal_id'],
  },
};

async function goalStateHandler(args, apiClient) {
  const { goal_id } = args;
  const [goalRes, qualityRes, progressRes, gapsRes, pathRes] = await Promise.allSettled([
    apiClient.goals.get(goal_id),
    apiClient.goals.getQuality(goal_id),
    apiClient.goals.getProgress(goal_id),
    apiClient.goals.getKnowledgeGaps(goal_id),
    apiClient.goals.getPath(goal_id),
  ]);

  const failures = [];
  const unwrap = (s, label, def) => {
    if (s.status === 'fulfilled') return s.value;
    failures.push({ source: label, message: s.reason?.message });
    return def;
  };

  const goal = unwrap(goalRes, 'goals.get', null);
  if (!goal) return errorResponse('not_found', `Goal ${goal_id} not found`);

  const quality = unwrap(qualityRes, 'goals.quality', {});
  const progress = unwrap(progressRes, 'goals.progress', {});
  const gaps = unwrap(gapsRes, 'goals.knowledgeGaps', { gaps: [] });
  const path = unwrap(pathRes, 'goals.path', { tasks: [] });

  const bottlenecks = safeArray(path.tasks || path)
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => (b.direct_downstream_count || 0) - (a.direct_downstream_count || 0))
    .slice(0, 5)
    .map((t) => ({
      node_id: t.id,
      title: t.title,
      status: t.status,
      direct_downstream_count: t.direct_downstream_count || 0,
    }));

  return formatResponse({
    as_of: asOf(),
    goal: {
      id: goal.id, title: goal.title, description: goal.description,
      type: goal.type, goal_type: goal.goalType || goal.goal_type,
      status: goal.status, priority: goal.priority,
      owner_id: goal.ownerId || goal.owner_id, success_criteria: goal.successCriteria || goal.success_criteria,
      promoted_at: goal.promotedAt || goal.promoted_at,
    },
    quality: {
      score: quality.score, dimensions: quality.dimensions,
      suggestions: quality.suggestions, last_assessed_at: quality.as_of,
    },
    progress: progress,
    bottlenecks,
    knowledge_gaps: safeArray(gaps.gaps || gaps),
    meta: { partial: failures.length > 0, failures },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// recall_knowledge — universal knowledge query. Replaces 4 separate tools.
// ─────────────────────────────────────────────────────────────────────────

const recallKnowledgeDefinition = {
  name: 'recall_knowledge',
  description:
    "Universal knowledge graph query. Returns facts, entities, recent episodes, " +
    "and contradictions in one shape. Use result_kind to control payload size. " +
    "Replaces recall_knowledge legacy + find_entities + get_recent_episodes + check_contradictions.",
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query — required for facts/entities, optional for episodes' },
      scope: {
        type: 'object',
        properties: { plan_id: { type: 'string' }, goal_id: { type: 'string' }, node_id: { type: 'string' } },
      },
      since: { type: 'string', description: 'ISO 8601 — only return episodes after this' },
      entry_type: { type: 'string', enum: ['learning', 'decision', 'progress', 'challenge', 'all'], default: 'all' },
      result_kind: { type: 'string', enum: ['facts', 'entities', 'episodes', 'all'], default: 'all' },
      max_results: { type: 'integer', default: 10 },
      include_contradictions: { type: 'boolean', default: false },
    },
  },
};

async function recallKnowledgeHandler(args, apiClient) {
  const { query, scope = {}, since, entry_type = 'all', result_kind = 'all', max_results = 10, include_contradictions = false } = args;
  const wantFacts = result_kind === 'all' || result_kind === 'facts';
  const wantEntities = result_kind === 'all' || result_kind === 'entities';
  const wantEpisodes = result_kind === 'all' || result_kind === 'episodes';

  const calls = [];
  if (wantFacts && query) {
    calls.push({ key: 'facts', p: apiClient.graphiti.graphSearch({ query, max_results, ...scope }) });
  }
  if (wantEntities && query) {
    calls.push({ key: 'entities', p: apiClient.graphiti.searchEntities({ query, max_results }) });
  }
  if (wantEpisodes) {
    calls.push({ key: 'episodes', p: apiClient.graphiti.getEpisodes({ max_episodes: Math.min(max_results * 2, 50) }) });
  }
  if (include_contradictions && query) {
    calls.push({ key: 'contradictions', p: apiClient.graphiti.detectContradictions({ topic: query, ...scope }) });
  }

  const settled = await Promise.allSettled(calls.map((c) => c.p));
  const out = { as_of: asOf(), facts: [], entities: [], episodes: [], contradictions: null, meta: { failures: [] } };

  settled.forEach((s, i) => {
    const key = calls[i].key;
    if (s.status !== 'fulfilled') {
      out.meta.failures.push({ source: `graphiti.${key}`, message: s.reason?.message });
      return;
    }
    const v = s.value;
    if (key === 'facts') out.facts = safeArray(v.facts || v);
    if (key === 'entities') out.entities = safeArray(v.entities || v);
    if (key === 'episodes') {
      let eps = safeArray(v.episodes?.episodes || v.episodes || v);
      if (since) {
        const sinceMs = new Date(since).getTime();
        eps = eps.filter((e) => e.created_at && new Date(e.created_at).getTime() >= sinceMs);
      }
      if (entry_type !== 'all') {
        eps = eps.filter((e) => (e.entry_type || e.source) === entry_type);
      }
      out.episodes = eps.slice(0, max_results);
    }
    if (key === 'contradictions') out.contradictions = v;
  });

  return formatResponse(out);
}

// ─────────────────────────────────────────────────────────────────────────
// search — universal text search.
// ─────────────────────────────────────────────────────────────────────────

const searchDefinition = {
  name: 'search',
  description: 'Text search across plans, nodes, and content. Use for finding entities by title or fragment.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      scope: { type: 'string', enum: ['global', 'plans', 'plan', 'node'], default: 'global' },
      scope_id: { type: 'string' },
      filters: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          type: { type: 'string' },
          limit: { type: 'integer', default: 20 },
        },
      },
    },
    required: ['query'],
  },
};

async function searchHandler(args, apiClient) {
  const { query, scope = 'global', scope_id, filters = {} } = args;
  try {
    let result;
    const limit = filters.limit || 20;
    if (scope === 'global') result = await apiClient.search.global(query, { limit, ...filters });
    else if (scope === 'plans') result = await apiClient.search.plans(query, limit);
    else if (scope === 'plan') result = await apiClient.search.inPlan(scope_id, query, limit);
    else if (scope === 'node') result = await apiClient.search.inNode(scope_id, query, limit);
    return formatResponse({ as_of: asOf(), ...(result || {}) });
  } catch (err) {
    return errorResponse('upstream_unavailable', `Search failed: ${err.response?.data?.error || err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// plan_analysis — advanced reads (impact, critical_path, bottlenecks, coherence).
// ─────────────────────────────────────────────────────────────────────────

const planAnalysisDefinition = {
  name: 'plan_analysis',
  description:
    "Advanced plan reads: impact analysis (delay/block/remove), critical path, " +
    "bottleneck list, or coherence check.",
  inputSchema: {
    type: 'object',
    properties: {
      plan_id: { type: 'string' },
      type: { type: 'string', enum: ['impact', 'critical_path', 'bottlenecks', 'coherence'] },
      node_id: { type: 'string' },
      scenario: { type: 'string', enum: ['delay', 'block', 'remove'] },
    },
    required: ['plan_id', 'type'],
  },
};

async function planAnalysisHandler(args, apiClient) {
  const { plan_id, type, node_id, scenario } = args;
  try {
    let result;
    if (type === 'critical_path') {
      result = (await apiClient.axiosInstance.get(`/plans/${plan_id}/critical-path`)).data;
    } else if (type === 'bottlenecks') {
      result = (await apiClient.axiosInstance.get(`/plans/${plan_id}/bottlenecks`)).data;
    } else if (type === 'impact') {
      if (!node_id) return errorResponse('invalid_arg', 'plan_analysis type=impact requires node_id');
      const params = new URLSearchParams({ scenario: scenario || 'block' });
      result = (await apiClient.axiosInstance.get(`/plans/${plan_id}/nodes/${node_id}/impact?${params}`)).data;
    } else if (type === 'coherence') {
      result = await apiClient.coherence.runCheck(plan_id);
    }
    return formatResponse({ as_of: asOf(), type, results: result || {} });
  } catch (err) {
    return errorResponse('upstream_unavailable', `plan_analysis failed: ${err.response?.data?.error || err.message}`);
  }
}

module.exports = {
  definitions: [
    briefingDefinition,
    taskContextDefinition,
    goalStateDefinition,
    recallKnowledgeDefinition,
    searchDefinition,
    planAnalysisDefinition,
  ],
  handlers: {
    briefing: briefingHandler,
    task_context: taskContextHandler,
    goal_state: goalStateHandler,
    recall_knowledge: recallKnowledgeHandler,
    search: searchHandler,
    plan_analysis: planAnalysisHandler,
  },
};
