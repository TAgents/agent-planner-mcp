/**
 * BDI beliefs — state queries.
 *
 * v0.9.0 ships `briefing` first. Other belief tools (task_context, goal_state,
 * recall_knowledge, search, plan_analysis) land in subsequent passes.
 */

const { asOf, formatResponse, errorResponse, safeArray } = require('./_shared');

// ─────────────────────────────────────────────────────────────────────────
// briefing — bundled mission control state. Replaces 4 round trips today.
// ─────────────────────────────────────────────────────────────────────────

const briefingDefinition = {
  name: 'briefing',
  description:
    "Mission control state in one call. Returns goal health summary, " +
    "pending decisions, my tasks, recent activity, and a top recommendation. " +
    "Use this as the single read for Cowork live artifacts and the autopilot's " +
    "first call. Replaces check_goals_health + get_my_tasks + get_recent_episodes + " +
    "check_coherence_pending fan-out.",
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['mission_control', 'task_session', 'org'],
        default: 'mission_control',
        description: 'Audience preset. mission_control = autopilot/dashboard, task_session = active coding session, org = full org snapshot.',
      },
      goal_id: { type: 'string', description: 'Narrow to a single goal' },
      plan_id: { type: 'string', description: 'Narrow to a single plan' },
      recent_window_hours: {
        type: 'number',
        default: 24,
        description: 'Lookback window for recent_activity, in hours',
      },
    },
  },
};

async function briefingHandler(args, apiClient) {
  const recentHours = typeof args.recent_window_hours === 'number' ? args.recent_window_hours : 24;
  const recentSinceMs = Date.now() - recentHours * 3600 * 1000;

  // Fan out to existing endpoints in parallel; tolerate individual failures.
  const [
    dashboardRes,
    pendingRes,
    myTasksRes,
    coherenceRes,
    episodesRes,
  ] = await Promise.allSettled([
    apiClient.goals.getDashboard(),
    apiClient.axiosInstance.get('/dashboard/pending', { params: { limit: 10 } }),
    apiClient.users.myTasks(),
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
  const myTasks = unwrap(myTasksRes, 'users.myTasks', { tasks: [] });
  const coherencePending = unwrap(coherenceRes, 'coherence.pending', { plans: [], goals: [] });
  const episodes = unwrap(episodesRes, 'graphiti.episodes', { episodes: { episodes: [] } });

  // Goal health, optionally narrowed by goal_id.
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

  // Pending decisions (real ones, from decisionsDal). Optional plan_id narrowing.
  let decisions = safeArray(pending.decisions);
  if (args.plan_id) decisions = decisions.filter((d) => d.plan_id === args.plan_id);

  // Pending agent_requests (separate system).
  let agentRequests = safeArray(pending.agent_requests);
  if (args.plan_id) agentRequests = agentRequests.filter((r) => r.plan_id === args.plan_id);

  // My tasks bucketed.
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

  // Recent activity from knowledge episodes within window.
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

  // Top recommendation: highest direct_downstream_count bottleneck on at_risk goals.
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

  // Coherence pending list.
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
    meta: {
      partial: failures.length > 0,
      failures,
    },
  });
}

module.exports = {
  definitions: [briefingDefinition],
  handlers: {
    briefing: briefingHandler,
  },
};
