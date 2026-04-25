#!/usr/bin/env node
/**
 * v1.0 smoke test — runs new tool handlers directly against agentplanner.io.
 * NOT a Jest test (avoids being picked up by `npm test`). Run with:
 *   node __tests__/v1-smoke.js
 *
 * Requires API_URL and USER_API_TOKEN in env.
 */

const path = require('path');
const fs = require('fs');

// Pull token from .mcp.json if env vars not set.
if (!process.env.USER_API_TOKEN) {
  try {
    const mcpConfig = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../.mcp.json'), 'utf8'),
    );
    process.env.API_URL = mcpConfig.mcpServers['agent-planner'].env.API_URL;
    process.env.USER_API_TOKEN = mcpConfig.mcpServers['agent-planner'].env.USER_API_TOKEN;
  } catch (e) {
    console.error('Could not read .mcp.json — set API_URL + USER_API_TOKEN env vars manually.');
    process.exit(1);
  }
}

const { createApiClient } = require('../src/api-client');
const desires = require('../src/tools/bdi/desires');
const intentions = require('../src/tools/bdi/intentions');

const apiClient = createApiClient(process.env.USER_API_TOKEN, {
  apiUrl: process.env.API_URL,
});

function header(name) {
  console.log(`\n${'='.repeat(60)}\n  ${name}\n${'='.repeat(60)}`);
}

function showResult(label, result) {
  if (result.isError) {
    console.log(`  ✗ ${label}`);
    console.log(`    ${result.content[0].text}`);
    return false;
  }
  console.log(`  ✓ ${label}`);
  const body = JSON.parse(result.content[0].text);
  const summary = JSON.stringify(body, null, 2)
    .split('\n')
    .slice(0, 12)
    .join('\n');
  console.log('    ' + summary.split('\n').join('\n    '));
  return body;
}

async function main() {
  console.log(`API: ${process.env.API_URL}`);
  console.log(`Token: ${process.env.USER_API_TOKEN.slice(0, 12)}…`);

  header('1. Read sanity (existing v0.9 surface)');

  // briefing — make sure auth works at all
  try {
    const goals = await apiClient.goals.list({ status: 'active' });
    console.log(`  ✓ list_goals returned ${Array.isArray(goals) ? goals.length : '?'} active goals`);
    if (Array.isArray(goals) && goals.length) {
      const g = goals[0];
      console.log(`    sample goal: id=${g.id?.slice(0, 8)} title="${g.title?.slice(0, 50)}"`);
    }
  } catch (err) {
    console.log(`  ✗ list_goals failed: ${err.response?.status} ${err.message}`);
    process.exit(1);
  }

  header('2. derive_subgoal — autonomous draft');

  // Find a parent goal to derive under.
  const allGoals = await apiClient.goals.list({ status: 'active' });
  const parentGoal = Array.isArray(allGoals) ? allGoals[0] : null;
  if (!parentGoal) {
    console.log('  ✗ No active goals found to derive under — skipping');
    return;
  }
  console.log(`  Using parent goal: ${parentGoal.title} (${parentGoal.id})`);

  const subgoalRes = await desires.handlers.derive_subgoal(
    {
      parent_goal_id: parentGoal.id,
      title: '[v1.0 smoke test] Auto-derived sub-goal',
      rationale: 'Smoke test of derive_subgoal tool. Safe to archive.',
      status: 'draft',
    },
    apiClient,
  );
  const subgoalBody = showResult('derive_subgoal as draft', subgoalRes);

  let subgoalId = subgoalBody?.goal_id;
  if (subgoalId) {
    console.log(`    → created sub-goal id ${subgoalId}`);
  }

  header('3. form_intention — full plan + tree');

  const planRes = await intentions.handlers.form_intention(
    {
      goal_id: parentGoal.id,
      title: '[v1.0 smoke test] Auto-formed plan',
      rationale: 'Smoke test of form_intention. Safe to archive.',
      status: 'draft',
      tree: [
        {
          node_type: 'phase',
          title: 'Phase A — Smoke',
          children: [
            { node_type: 'task', title: 'Smoke task 1' },
            { node_type: 'task', title: 'Smoke task 2' },
          ],
        },
      ],
    },
    apiClient,
  );
  const planBody = showResult('form_intention with nested tree', planRes);
  const planId = planBody?.plan_id;

  header('4. extend_intention — add child to existing parent');

  if (planId) {
    // Find a node to add children under (the phase we just created).
    const nodes = await apiClient.nodes.getNodes(planId);
    const phaseNode = (Array.isArray(nodes) ? nodes : nodes.nodes || []).find(
      (n) => n.node_type === 'phase' || n.nodeType === 'phase',
    );
    if (phaseNode) {
      const extRes = await intentions.handlers.extend_intention(
        {
          parent_id: phaseNode.id,
          plan_id: planId,
          rationale: 'smoke test extend',
          children: [{ title: 'Extend smoke task' }],
        },
        apiClient,
      );
      showResult('extend_intention added 1 child', extRes);
    } else {
      console.log('  ✗ no phase found in plan — skipping');
    }
  }

  header('5. update_plan — rename');

  if (planId) {
    const updRes = await intentions.handlers.update_plan(
      {
        plan_id: planId,
        title: '[v1.0 smoke test] Renamed plan',
      },
      apiClient,
    );
    showResult('update_plan renamed', updRes);
  }

  header('6. delete_plan — soft-delete cleanup');

  if (planId) {
    const delRes = await intentions.handlers.delete_plan(
      { plan_id: planId, reason: 'smoke test cleanup' },
      apiClient,
    );
    showResult('delete_plan archived', delRes);
  }

  header('7. delete_node (sub-goal) — cleanup the test sub-goal too');

  if (subgoalId) {
    // Production backend doesn't yet have v1.0 status enum extension —
    // 'archived' is not yet in goals VALID_STATUSES on prod. Use 'abandoned'
    // (existing valid value) to clean up the smoke-test sub-goal.
    try {
      await apiClient.goals.update(subgoalId, { status: 'abandoned' });
      console.log(`  ✓ archived (via 'abandoned') sub-goal ${subgoalId}`);
    } catch (err) {
      console.log(`  ✗ failed to archive sub-goal: ${err.response?.data?.error || err.message}`);
    }
  }

  header('Smoke test complete');
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
