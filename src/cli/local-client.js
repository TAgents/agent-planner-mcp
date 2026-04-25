const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createApiClient } = require('../api-client');
const { ensureDir, getConfigPath, mergeConfig, readConfig, resolveApiConfig, writeConfig } = require('./config');

const DEFAULT_AGENT_ID = 'ap-cli';
const DEFAULT_CLAIM_TTL_MIN = 30;

function parseArgs(args = []) {
  const positional = [];
  const options = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const keyValue = arg.slice(2).split('=');
    const key = keyValue[0].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (keyValue.length > 1) {
      options[key] = keyValue.slice(1).join('=');
      continue;
    }

    const next = args[i + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    i += 1;
  }

  return { positional, options };
}

async function promptForLogin(options) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const prompt = (question) => new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });

  const apiUrl = options.apiUrl || await prompt('API URL (default: https://agentplanner.io/api): ') || 'https://agentplanner.io/api';
  const token = options.token || await prompt('API token: ');
  rl.close();

  if (!token) {
    throw new Error('API token is required. Pass --token or run in an interactive terminal.');
  }

  return { apiUrl, token };
}

async function login(options = {}) {
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  const credentials = (options.token && options.apiUrl)
    ? { apiUrl: options.apiUrl, token: options.token }
    : interactive
      ? await promptForLogin(options)
      : (() => {
          if (!options.token) {
            throw new Error('Missing token. Pass --token for non-interactive login.');
          }
          return {
            apiUrl: options.apiUrl || 'https://agentplanner.io/api',
            token: options.token,
          };
        })();

  const api = createApiClient(credentials.token, { apiUrl: credentials.apiUrl });
  const plans = await api.plans.getPlans();

  const configData = {
    apiUrl: credentials.apiUrl,
    token: credentials.token,
    updatedAt: new Date().toISOString(),
  };

  let defaultPlanId = null;
  if (options.planId) {
    defaultPlanId = options.planId;
  } else if (Array.isArray(plans) && plans.length === 1) {
    defaultPlanId = plans[0].id;
  }
  if (defaultPlanId) {
    configData.defaultPlanId = defaultPlanId;
  }

  const configPath = writeConfig(configData);

  return {
    configPath,
    apiUrl: credentials.apiUrl,
    defaultPlanId,
  };
}

function getWorkspaceStatePath(baseDir = process.cwd()) {
  return path.join(baseDir, '.agentplanner');
}

function getWorkspaceContextPath(baseDir = process.cwd()) {
  return path.join(getWorkspaceStatePath(baseDir), 'context.json');
}

function readWorkspaceContext(baseDir = process.cwd()) {
  const contextPath = getWorkspaceContextPath(baseDir);
  if (!fs.existsSync(contextPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(contextPath, 'utf8'));
}

function resolveSelection(options = {}, baseDir = process.cwd()) {
  const workspaceContext = readWorkspaceContext(baseDir) || {};
  const config = readConfig();
  return {
    planId: options.planId || workspaceContext.selection?.planId || config.defaultPlanId || null,
    nodeId: options.nodeId || workspaceContext.selection?.nodeId || null,
  };
}

function renderPlanTree(nodes = []) {
  const lines = [];

  function walk(node, depth) {
    const indent = '  '.repeat(depth);
    const marker = node.node_type === 'phase' ? '▸' : node.node_type === 'milestone' ? '◆' : '•';
    const status = node.status ? ` [${node.status}]` : '';
    lines.push(`${indent}${marker} ${node.title}${status}`);
    for (const child of node.children || []) {
      walk(child, depth + 1);
    }
  }

  for (const node of nodes) {
    walk(node, 0);
  }

  return `${lines.join('\n')}\n`;
}

function stringifyJson(data) {
  return JSON.stringify(data, null, 2) + '\n';
}

function renderBulletList(items = []) {
  return items.filter(Boolean).map((item) => `- ${item}`);
}

function extractAcceptanceCriteria(text = '') {
  const match = text.match(/Acceptance criteria:\s*([\s\S]*)/i);
  if (!match) return [];

  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => line.replace(/^-\s*/, '').trim());
}

function stripAcceptanceCriteria(text = '') {
  return text.replace(/\n*Acceptance criteria:\s*[\s\S]*/i, '').trim();
}

function renderPlanHealth(plan) {
  if (!plan) return [];
  const hasQuality = plan.quality_score !== null && plan.quality_score !== undefined;
  const hasChecked = Boolean(plan.coherence_checked_at);
  if (!hasQuality && !hasChecked) return [];

  const out = ['## Plan health', ''];
  if (hasQuality) {
    out.push(`- Quality score: ${plan.quality_score}`);
    if (plan.quality_rationale) {
      out.push(`- Rationale: ${plan.quality_rationale}`);
    }
  }
  out.push(`- Last coherence check: ${hasChecked ? plan.coherence_checked_at : 'never'}`);
  if (!hasChecked) {
    out.push('- Run `run_coherence_check` (MCP) before acting on stale plans.');
  }
  out.push('');
  return out;
}

function renderCoherenceWarning(task) {
  if (!task || !task.coherence_status) return [];
  const status = task.coherence_status;
  if (status === 'clean' || status === 'unchecked') return [];

  const out = ['## Coherence warning', ''];
  out.push(`- Status: ${status}`);
  if (status === 'contradiction_detected') {
    out.push('- Supporting knowledge contains contradictions. Run `check_contradictions` (MCP) and re-verify before acting.');
  } else if (status === 'stale_beliefs') {
    out.push('- Knowledge backing this task may be outdated. Run `recall_knowledge` (MCP) to refresh before deciding.');
  }
  out.push('');
  return out;
}

function renderContradictions(nodeContext) {
  const list = Array.isArray(nodeContext?.contradictions) ? nodeContext.contradictions : [];
  if (!list.length) return [];

  const out = ['## Detected contradictions', ''];
  out.push(...renderBulletList(
    list.slice(0, 5).map((c) => c.summary || c.content || c.message || JSON.stringify(c)),
  ));
  out.push('');
  return out;
}

function renderCurrentTask(selection, plan, nodeContext, planContext) {
  const lines = [];
  lines.push(`# ${selection.nodeId && nodeContext?.node ? nodeContext.node.title : plan.title}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(`- Plan: ${plan.title}`);
  lines.push(`- Plan ID: ${plan.id}`);
  if (selection.nodeId && nodeContext?.node) {
    lines.push(`- Task ID: ${selection.nodeId}`);
    lines.push(`- Status: ${nodeContext.node.status || 'unknown'}`);
    if (nodeContext.node.task_mode && nodeContext.node.task_mode !== 'free') {
      lines.push(`- Task mode: ${nodeContext.node.task_mode}`);
    }
  }
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push('');

  lines.push(...renderPlanHealth(plan));

  if (!selection.nodeId || !nodeContext?.node) {
    lines.push('No node selected. Re-run with --node-id to materialize a task-specific current-task.md.');
    lines.push('');
    lines.push('Generated file. Safe to overwrite with `agent-planner-mcp context ...`.');
    lines.push('');
    return lines.join('\n');
  }

  const task = nodeContext.node;
  const ancestry = Array.isArray(nodeContext.ancestry) ? nodeContext.ancestry : [];
  const parentPhase = ancestry.find((item) => item.node_type === 'phase');
  const acceptanceCriteria = extractAcceptanceCriteria(task.description || '');
  const description = stripAcceptanceCriteria(task.description || '');
  const knowledge = (nodeContext.knowledge || []).slice(0, 5).map((item) => item.content);
  const phaseSummaries = (planContext?.phases || []).map((phase) => `${phase.title}: ${phase.completed_tasks}/${phase.total_tasks} complete`);

  lines.push(...renderCoherenceWarning(task));
  lines.push(...renderContradictions(nodeContext));

  if (parentPhase) {
    lines.push('## Placement');
    lines.push('');
    lines.push(`- Phase: ${parentPhase.title}`);
    lines.push(`- Phase status: ${parentPhase.status || 'unknown'}`);
    lines.push('');
  }

  if (description) {
    lines.push('## Task');
    lines.push('');
    lines.push(description);
    lines.push('');
  }

  if (task.context) {
    lines.push('## Implementation context');
    lines.push('');
    lines.push(task.context);
    lines.push('');
  }

  if (task.agent_instructions) {
    lines.push('## Agent instructions');
    lines.push('');
    lines.push(task.agent_instructions);
    lines.push('');
  }

  if (acceptanceCriteria.length) {
    lines.push('## Acceptance criteria');
    lines.push('');
    lines.push(...renderBulletList(acceptanceCriteria));
    lines.push('');
  }

  const goalsData = (nodeContext.goals || []).concat(
    (planContext?.goals || []).filter(
      (pg) => !(nodeContext.goals || []).some((ng) => ng.id === pg.id)
    )
  );
  if (goalsData.length) {
    lines.push('## Linked goals');
    lines.push('');
    lines.push(...goalsData.map((g) => `- ${g.title || g.name}${g.status ? ` [${g.status}]` : ''}`));
    lines.push('');
  }

  if (knowledge.length) {
    lines.push('## Relevant knowledge');
    lines.push('');
    lines.push(...renderBulletList(knowledge));
    lines.push('');
  }

  if (phaseSummaries.length) {
    lines.push('## Plan progress snapshot');
    lines.push('');
    lines.push(...renderBulletList(phaseSummaries));
    lines.push('');
  }

  lines.push('## Suggested loop');
  lines.push('');
  lines.push('- Run `agent-planner-mcp start` when you begin active work (claims the task for 30 min).');
  lines.push('- Do the implementation work in the repo, not in `.agentplanner/`.');
  lines.push('- If blocked, run `agent-planner-mcp blocked --message "why"` (releases the claim).');
  lines.push('- When complete, run `agent-planner-mcp done --message "what changed"` (logs progress and writes a learning to the temporal graph).');
  lines.push('- Refresh with `agent-planner-mcp context --plan-id ... --node-id ...` when you need updated context.');
  lines.push('');
  lines.push('## Source of truth');
  lines.push('');
  lines.push('- AgentPlanner (the API) is the source of truth for this plan and task.');
  lines.push('- Files under `.agentplanner/` are a regeneratable cache produced by `agent-planner-mcp context`.');
  lines.push('- Do not hand-edit `.agentplanner/` files; changes here are not synced back. Use the writeback commands above.');
  lines.push('- Safe to delete `.agentplanner/` at any time — re-run `context` or `next` to repopulate.');
  lines.push('');
  return lines.join('\n');
}

async function materializeContext(options = {}) {
  const baseDir = path.resolve(options.dir || process.cwd());
  const selection = resolveSelection(options, baseDir);
  if (!selection.planId) {
    throw new Error('Missing plan id. Pass --plan-id or run context after generating workspace state.');
  }

  const { apiUrl, token } = resolveApiConfig(options);
  if (!token) {
    throw new Error(`Not logged in. Run \`agent-planner-mcp login\` first. Config path: ${getConfigPath()}`);
  }

  const api = createApiClient(token, { apiUrl });
  const stateDir = getWorkspaceStatePath(baseDir);
  ensureDir(stateDir);

  const [plan, nodes, planContext, nodeContext] = await Promise.all([
    api.plans.getPlan(selection.planId),
    api.nodes.getNodes(selection.planId),
    api.context.getPlanContext(selection.planId),
    selection.nodeId ? api.context.getNodeContext(selection.nodeId) : Promise.resolve(null),
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    apiUrl,
    selection,
    plan,
    planContext,
    nodeContext,
  };

  fs.writeFileSync(path.join(stateDir, 'context.json'), stringifyJson(payload));
  fs.writeFileSync(path.join(stateDir, 'plan-tree.md'), renderPlanTree(nodes));
  fs.writeFileSync(path.join(stateDir, 'current-task.md'), renderCurrentTask(selection, plan, nodeContext, planContext));

  return {
    stateDir,
    selection,
  };
}

async function tryClaim(api, planId, nodeId, options = {}) {
  if (typeof api.nodes?.claimTask !== 'function') return false;
  try {
    await api.nodes.claimTask(
      planId,
      nodeId,
      options.agentId || DEFAULT_AGENT_ID,
      Number(options.ttl) || DEFAULT_CLAIM_TTL_MIN,
    );
    return true;
  } catch (_err) {
    return false;
  }
}

async function tryRelease(api, planId, nodeId, options = {}) {
  if (typeof api.nodes?.releaseTask !== 'function') return false;
  try {
    await api.nodes.releaseTask(planId, nodeId, options.agentId || DEFAULT_AGENT_ID);
    return true;
  } catch (_err) {
    return false;
  }
}

async function tryRecordLearning(api, { planId, nodeId, taskTitle, message }) {
  if (!message || typeof api.graphiti?.addEpisode !== 'function') return false;
  try {
    await api.graphiti.addEpisode({
      content: message,
      name: taskTitle ? `[done] ${taskTitle}` : `[done] ${nodeId}`,
      plan_id: planId,
      node_id: nodeId,
      metadata: { entry_type: 'learning', source: DEFAULT_AGENT_ID },
    });
    return true;
  } catch (_err) {
    return false;
  }
}

async function updateStatus(command, options = {}) {
  const statusMap = {
    start: 'in_progress',
    blocked: 'blocked',
    done: 'completed',
  };
  const logTypeMap = {
    blocked: 'challenge',
    done: 'progress',
  };

  const baseDir = path.resolve(options.dir || process.cwd());
  const selection = resolveSelection(options, baseDir);
  if (!selection.planId || !selection.nodeId) {
    throw new Error('Missing plan/node selection. Pass --plan-id and --node-id, or run context with both first.');
  }

  const { apiUrl, token } = resolveApiConfig(options);
  if (!token) {
    throw new Error(`Not logged in. Run \`agent-planner-mcp login\` first. Config path: ${getConfigPath()}`);
  }

  const api = createApiClient(token, { apiUrl });
  await api.nodes.updateNodeStatus(selection.planId, selection.nodeId, statusMap[command]);

  let logged = false;
  if (options.message && logTypeMap[command]) {
    await api.logs.addLogEntry(selection.planId, selection.nodeId, {
      content: options.message,
      log_type: logTypeMap[command],
    });
    logged = true;
  }

  let claimed = false;
  let released = false;
  let learned = false;

  if (command === 'start') {
    claimed = await tryClaim(api, selection.planId, selection.nodeId, options);
  } else if (command === 'blocked' || command === 'done') {
    released = await tryRelease(api, selection.planId, selection.nodeId, options);
  }

  if (command === 'done' && options.message) {
    const workspaceContext = readWorkspaceContext(baseDir);
    const taskTitle = workspaceContext?.nodeContext?.node?.title;
    learned = await tryRecordLearning(api, {
      planId: selection.planId,
      nodeId: selection.nodeId,
      taskTitle,
      message: options.message,
    });
  }

  return {
    planId: selection.planId,
    nodeId: selection.nodeId,
    status: statusMap[command],
    logged,
    claimed,
    released,
    learned,
  };
}

async function getMyTasks(options = {}) {
  const { apiUrl, token } = resolveApiConfig(options);
  if (!token) {
    throw new Error(`Not logged in. Run \`agent-planner-mcp login\` first. Config path: ${getConfigPath()}`);
  }

  const config = readConfig();
  const planId = options.planId || config.defaultPlanId || null;
  const api = createApiClient(token, { apiUrl });
  const fetchOptions = {};
  if (planId) fetchOptions.plan_id = planId;

  const tasks = await api.users.getMyTasks(fetchOptions);
  if (!planId) {
    return { tasks, planId };
  }

  const taskList = Array.isArray(tasks) ? tasks : tasks?.tasks;
  if (!Array.isArray(taskList)) {
    return { tasks, planId };
  }

  const filteredTasks = taskList.filter((task) => task.plan_id === planId);
  if (Array.isArray(tasks)) {
    return { tasks: filteredTasks, planId };
  }

  return {
    tasks: {
      ...tasks,
      tasks: filteredTasks,
    },
    planId,
  };
}

function normalizeSuggestion(suggestion, planId) {
  if (!suggestion) return null;
  const id = suggestion.id || suggestion.node_id;
  if (!id) return null;
  return {
    id,
    title: suggestion.title,
    status: suggestion.status,
    plan_id: suggestion.plan_id || planId,
    task_mode: suggestion.task_mode,
    knowledge_ready: suggestion.knowledge_ready,
    ...suggestion,
  };
}

async function pickViaSuggestNextTasks(api, planId, limit) {
  if (!planId || typeof api.nodes?.suggestNextTasks !== 'function') return null;
  try {
    const suggestions = await api.nodes.suggestNextTasks(planId, limit);
    const list = Array.isArray(suggestions)
      ? suggestions
      : (suggestions?.suggestions || suggestions?.tasks || []);
    if (!list.length) return null;
    return normalizeSuggestion(list[0], planId);
  } catch (_err) {
    return null;
  }
}

async function pickFromQueue(options, status) {
  try {
    const { tasks, planId: queuePlanId } = await getMyTasks(options);
    const list = Array.isArray(tasks) ? tasks : tasks?.tasks || [];
    const match = list.find((t) => t.status === status);
    if (!match) return null;
    if (!match.plan_id && queuePlanId) match.plan_id = queuePlanId;
    return match;
  } catch (_err) {
    return null;
  }
}

async function getNextTask(options = {}) {
  const { apiUrl, token } = resolveApiConfig(options);
  if (!token) {
    throw new Error(`Not logged in. Run \`agent-planner-mcp login\` first. Config path: ${getConfigPath()}`);
  }

  const config = readConfig();
  const planId = options.planId || config.defaultPlanId || null;
  const api = createApiClient(token, { apiUrl });
  const fresh = Boolean(options.fresh);

  // Resolution order:
  //  1. Resume any in_progress task in scope (unless --fresh).
  //  2. Dependency-aware recommendation via suggest_next_tasks.
  //  3. Fallback: first not_started task in the my-tasks queue.
  //
  // `tasks` is the queue view; `next` is the smart picker. `next --fresh`
  // forces a fresh recommendation even when active work exists.

  let chosen = null;
  let source = null;

  if (!fresh) {
    chosen = await pickFromQueue(options, 'in_progress');
    if (chosen) source = 'resume_in_progress';
  }

  if (!chosen) {
    chosen = await pickViaSuggestNextTasks(api, planId, options.limit ? Number(options.limit) : 5);
    if (chosen) source = 'suggest_next_tasks';
  }

  if (!chosen) {
    chosen = await pickFromQueue(options, 'not_started');
    if (chosen) source = 'my_tasks_fallback';
  }

  if (!chosen) {
    throw new Error('No actionable tasks (in_progress or not_started) found.');
  }

  const taskPlanId = chosen.plan_id || planId;
  if (!taskPlanId) {
    throw new Error('Could not determine plan_id for the selected task. Pass --plan-id explicitly.');
  }

  const claimed = await tryClaim(api, taskPlanId, chosen.id, options);

  const contextResult = await materializeContext({
    ...options,
    planId: taskPlanId,
    nodeId: chosen.id,
  });

  return {
    task: chosen,
    planId: taskPlanId,
    stateDir: contextResult.stateDir,
    claimed,
    source,
  };
}

module.exports = {
  getMyTasks,
  getNextTask,
  getWorkspaceContextPath,
  getWorkspaceStatePath,
  login,
  materializeContext,
  parseArgs,
  readWorkspaceContext,
  renderCurrentTask,
  renderPlanTree,
  resolveSelection,
  updateStatus,
};
