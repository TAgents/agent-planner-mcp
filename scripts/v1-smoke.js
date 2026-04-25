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

  // Create a fresh plan for the remaining destructive-but-safe tool tests.
  header('7. Setup — fresh plan for remaining tool tests');

  const stagingRes = await intentions.handlers.form_intention(
    {
      goal_id: parentGoal.id,
      title: '[v1.0 smoke test] Staging plan for tool coverage',
      rationale: 'Holds nodes used by the remaining smoke tests. Cleaned up at end.',
      status: 'draft',
      tree: [
        { node_type: 'phase', title: 'Phase A', children: [
          { node_type: 'task', title: 'Task A1' },
          { node_type: 'task', title: 'Task A2' },
        ]},
        { node_type: 'phase', title: 'Phase B' },
      ],
    },
    apiClient,
  );
  const stagingBody = showResult('staging plan created', stagingRes);
  const stagingPlanId = stagingBody?.plan_id;
  // Pull node IDs from form_intention's flat nodes[] response — getNodes
  // returns a nested tree where children are not at the top level.
  const flatNodes = stagingBody?.nodes || [];
  const phaseAId = flatNodes.find(n => n.title === 'Phase A')?.id;
  const phaseBId = flatNodes.find(n => n.title === 'Phase B')?.id;
  const taskA1Id = flatNodes.find(n => n.title === 'Task A1')?.id;
  const taskA2Id = flatNodes.find(n => n.title === 'Task A2')?.id;
  console.log(`    nodes resolved: A=${phaseAId?.slice(0,8)} B=${phaseBId?.slice(0,8)} A1=${taskA1Id?.slice(0,8)} A2=${taskA2Id?.slice(0,8)}`);

  header('8. propose_research_chain — RPI triple under Phase B');

  if (stagingPlanId && phaseBId) {
    const rpi = await intentions.handlers.propose_research_chain(
      {
        parent_id: phaseBId,
        plan_id: stagingPlanId,
        research_question: 'Is approach X viable?',
        implementation_target: 'Ship X if viable',
        rationale: 'smoke test',
      },
      apiClient,
    );
    showResult('RPI chain created', rpi);
  }

  header('9. link_intentions — A1 blocks A2');

  let depId;
  if (taskA1Id && taskA2Id) {
    const linkRes = await intentions.handlers.link_intentions(
      {
        from_task_id: taskA1Id,
        to_task_id: taskA2Id,
        relation: 'blocks',
        rationale: 'smoke test edge',
      },
      apiClient,
    );
    const body = showResult('link_intentions edge created', linkRes);
    depId = body?.dependency_id;
  }

  header('10. unlink_intentions — remove the edge we just made');

  if (depId && stagingPlanId) {
    const unlinkRes = await intentions.handlers.unlink_intentions(
      { dependency_id: depId, plan_id: stagingPlanId, reason: 'smoke cleanup' },
      apiClient,
    );
    showResult('unlink_intentions removed edge', unlinkRes);
  }

  header('11. update_node — rename Task A1');

  if (taskA1Id && stagingPlanId) {
    const updRes = await intentions.handlers.update_node(
      {
        node_id: taskA1Id,
        plan_id: stagingPlanId,
        title: 'Task A1 (renamed)',
        agent_instructions: 'Updated by smoke test',
      },
      apiClient,
    );
    showResult('update_node renamed', updRes);
  }

  header('12. move_node — move A1 under Phase B');

  if (taskA1Id && phaseBId && stagingPlanId) {
    const mvRes = await intentions.handlers.move_node(
      {
        node_id: taskA1Id,
        plan_id: stagingPlanId,
        new_parent_id: phaseBId,
      },
      apiClient,
    );
    showResult('move_node reparented', mvRes);
  }

  header('13. delete_node — archive A2');

  if (taskA2Id && stagingPlanId) {
    const delNodeRes = await intentions.handlers.delete_node(
      { node_id: taskA2Id, plan_id: stagingPlanId, reason: 'smoke cleanup' },
      apiClient,
    );
    showResult('delete_node archived', delNodeRes);
  }

  header('14. Collaboration tools — shape-only checks (no live impact)');

  // share_plan with bogus user — verifies endpoint shape; backend should
  // surface a partial failure on the bogus collaborator without affecting prod.
  if (stagingPlanId) {
    const shareRes = await intentions.handlers.share_plan(
      {
        plan_id: stagingPlanId,
        visibility: 'private',  // no-op; safe
        add_collaborators: [{ user_id: '00000000-0000-0000-0000-000000000000', role: 'viewer' }],
      },
      apiClient,
    );
    const body = showResult('share_plan (visibility no-op + bogus collab → expected partial failure)', shareRes);
    if (body?.failures?.length) {
      console.log(`    expected failure surfaced: ${JSON.stringify(body.failures[0])}`);
    }
  }

  // invite_member with bogus org — confirms reachability + error code mapping.
  const inviteRes = await intentions.handlers.invite_member(
    { organization_id: '00000000-0000-0000-0000-000000000000', email: 'noone@example.invalid' },
    apiClient,
  );
  if (inviteRes.isError) {
    console.log(`  ✓ invite_member returned expected error (bogus org): ${inviteRes.content[0].text.slice(0, 100)}`);
  } else {
    console.log('  ! invite_member did NOT error on bogus org — investigate');
  }

  // update_member_role with bogus IDs.
  const roleRes = await intentions.handlers.update_member_role(
    {
      organization_id: '00000000-0000-0000-0000-000000000000',
      membership_id: '00000000-0000-0000-0000-000000000000',
      new_role: 'admin',
    },
    apiClient,
  );
  if (roleRes.isError) {
    console.log(`  ✓ update_member_role returned expected error: ${roleRes.content[0].text.slice(0, 100)}`);
  } else {
    console.log('  ! update_member_role did NOT error on bogus IDs');
  }

  // remove_member shape check
  const removeRes = await intentions.handlers.remove_member(
    {
      organization_id: '00000000-0000-0000-0000-000000000000',
      membership_id: '00000000-0000-0000-0000-000000000000',
      reason: 'smoke shape check',
    },
    apiClient,
  );
  if (removeRes.isError) {
    console.log(`  ✓ remove_member returned expected error: ${removeRes.content[0].text.slice(0, 100)}`);
  } else {
    console.log('  ! remove_member did NOT error on bogus IDs');
  }

  header('15. Cleanup — archive staging plan');

  if (stagingPlanId) {
    const cleanupRes = await intentions.handlers.delete_plan(
      { plan_id: stagingPlanId, reason: 'smoke test cleanup' },
      apiClient,
    );
    showResult('staging plan archived', cleanupRes);
  }

  header('Cleanup — sub-goal');

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
