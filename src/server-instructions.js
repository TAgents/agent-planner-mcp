/**
 * Server-level MCP instructions — surfaced to the model the moment the server
 * connects, independent of any externally-loaded skill. This is the safety net
 * for agents that do NOT have the AgentPlanner SKILL.md: it maps plain intents
 * to the BDI tool names (which were renamed at v0.9, e.g. "create a plan" is
 * `form_intention`, not `create_plan`) and points to `get_started` for the rest.
 *
 * Keep this short — it's read on every connect. Deeper guidance lives in
 * `get_started` (auto-derived from the live tool set, so it can't drift).
 */
const SERVER_INSTRUCTIONS = [
  'AgentPlanner uses an intent-shaped, BDI-aligned tool vocabulary (renamed at v0.9 — there is no create_plan/quick_plan/create_node/quick_status).',
  'New here or unsure which tool? Call `get_started` first — it returns the full tool map and recommended workflows.',
  '',
  'Common intents → tool:',
  '- Create a goal → `create_goal` (a sub-goal → `derive_subgoal`)',
  '- Create a plan with its task tree → `form_intention` (add tasks later → `extend_intention`; an R→P→I chain → `propose_research_chain`)',
  '- Find and claim the next task → `claim_next_task`',
  '- Update status / log progress / finish a task → `update_task` (folds the old quick_status + quick_log + add_log + release)',
  '- Read a goal (details, progress, quality, bottlenecks) → `goal_state`; all goals’ health → `briefing` / `list_goals`',
  '- Read a task in context → `task_context`; analyze a plan (critical path, bottlenecks, impact, coherence) → `plan_analysis`',
  '- Record / recall knowledge → `add_learning` / `recall_knowledge`',
  '- Queue a human decision → `queue_decision`; resolve one → `resolve_decision`',
].join('\n');

module.exports = { SERVER_INSTRUCTIONS };
