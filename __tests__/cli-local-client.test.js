const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../src/api-client', () => ({
  createApiClient: jest.fn(),
}));

const { createApiClient } = require('../src/api-client');
const localClient = require('../src/cli/local-client');

describe('local client helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('parseArgs handles dashed flags and inline values', () => {
    const parsed = localClient.parseArgs(['--plan-id', 'plan-1', '--node-id=node-1', '--dry-run']);
    expect(parsed.options).toEqual({
      planId: 'plan-1',
      nodeId: 'node-1',
      dryRun: true,
    });
  });

  test('materializeContext writes generated files', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret' });

    createApiClient.mockReturnValue({
      plans: {
        getPlan: jest.fn().mockResolvedValue({ id: 'plan-1', title: 'Example Plan' }),
      },
      nodes: {
        getNodes: jest.fn().mockResolvedValue([
          { title: 'Phase A', node_type: 'phase', status: 'not_started', children: [
            { title: 'Task A1', node_type: 'task', status: 'in_progress', children: [] },
          ] },
        ]),
      },
      context: {
        getPlanContext: jest.fn().mockResolvedValue({ phases: [{ title: 'Phase A', completed_tasks: 0, total_tasks: 1 }] }),
        getNodeContext: jest.fn().mockResolvedValue({
          node: {
            title: 'Task A1',
            status: 'in_progress',
            description: 'Do the thing\n\nAcceptance criteria:\n- Works\n- Tested',
            context: 'Important implementation detail',
            agent_instructions: 'Keep it simple',
          },
          ancestry: [{ node_type: 'phase', title: 'Phase A', status: 'not_started' }],
          knowledge: [{ content: 'Relevant fact' }],
        }),
      },
    });

    await localClient.materializeContext({ dir: tempDir, planId: 'plan-1', nodeId: 'node-1' });

    const stateDir = path.join(tempDir, '.agentplanner');
    expect(fs.existsSync(path.join(stateDir, 'context.json'))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, 'plan-tree.md'))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, 'current-task.md'))).toBe(true);

    const context = JSON.parse(fs.readFileSync(path.join(stateDir, 'context.json'), 'utf8'));
    expect(context.selection).toEqual({ planId: 'plan-1', nodeId: 'node-1' });

    const currentTask = fs.readFileSync(path.join(stateDir, 'current-task.md'), 'utf8');
    expect(currentTask).toContain('# Task A1');
    expect(currentTask).toContain('## Acceptance criteria');
    expect(currentTask).toContain('- Works');
    expect(currentTask).toContain('## Suggested loop');
  });

  test('updateStatus falls back to workspace context selection', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { ensureDir, writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret' });

    const stateDir = path.join(tempDir, '.agentplanner');
    ensureDir(stateDir);
    fs.writeFileSync(path.join(stateDir, 'context.json'), JSON.stringify({ selection: { planId: 'plan-1', nodeId: 'node-1' } }));

    const updateNodeStatus = jest.fn().mockResolvedValue({});
    const addLogEntry = jest.fn().mockResolvedValue({});
    createApiClient.mockReturnValue({
      nodes: { updateNodeStatus },
      logs: { addLogEntry },
    });

    const result = await localClient.updateStatus('blocked', { dir: tempDir, message: 'Need a decision' });

    expect(updateNodeStatus).toHaveBeenCalledWith('plan-1', 'node-1', 'blocked');
    expect(addLogEntry).toHaveBeenCalledWith('plan-1', 'node-1', {
      content: 'Need a decision',
      log_type: 'challenge',
    });
    expect(result.logged).toBe(true);
  });

  test('login stores defaultPlanId when --plan-id is provided', async () => {
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));

    createApiClient.mockReturnValue({
      plans: { getPlans: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]) },
    });

    const result = await localClient.login({
      token: 'test-token',
      apiUrl: 'https://agentplanner.io/api',
      planId: 'p1',
    });

    expect(result.defaultPlanId).toBe('p1');
    const { readConfig } = require('../src/cli/config');
    const saved = readConfig();
    expect(saved.defaultPlanId).toBe('p1');
  });

  test('login auto-selects plan when exactly one is accessible', async () => {
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));

    createApiClient.mockReturnValue({
      plans: { getPlans: jest.fn().mockResolvedValue([{ id: 'only-plan' }]) },
    });

    const result = await localClient.login({
      token: 'test-token',
      apiUrl: 'https://agentplanner.io/api',
    });

    expect(result.defaultPlanId).toBe('only-plan');
  });

  test('login does not set defaultPlanId when multiple plans and no --plan-id', async () => {
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));

    createApiClient.mockReturnValue({
      plans: { getPlans: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]) },
    });

    const result = await localClient.login({
      token: 'test-token',
      apiUrl: 'https://agentplanner.io/api',
    });

    expect(result.defaultPlanId).toBeNull();
  });

  test('resolveSelection uses defaultPlanId from config as fallback', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret', defaultPlanId: 'default-plan' });

    const selection = localClient.resolveSelection({ nodeId: 'n1' }, tempDir);
    expect(selection.planId).toBe('default-plan');
    expect(selection.nodeId).toBe('n1');
  });

  test('getMyTasks calls users.getMyTasks with plan_id filter', async () => {
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret', defaultPlanId: 'dp1' });

    const mockTasks = [
      { id: 'n1', title: 'Task 1', status: 'in_progress', plan_id: 'dp1' },
      { id: 'n2', title: 'Task 2', status: 'not_started', plan_id: 'dp1' },
    ];
    const getMyTasksMock = jest.fn().mockResolvedValue(mockTasks);
    createApiClient.mockReturnValue({ users: { getMyTasks: getMyTasksMock } });

    const result = await localClient.getMyTasks({});
    expect(getMyTasksMock).toHaveBeenCalledWith({ plan_id: 'dp1' });
    expect(result.tasks).toEqual(mockTasks);
    expect(result.planId).toBe('dp1');
  });

  test('getMyTasks filters cross-plan results client-side when API ignores plan_id', async () => {
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret', defaultPlanId: 'dp1' });

    const getMyTasksMock = jest.fn().mockResolvedValue([
      { id: 'n1', title: 'Task 1', status: 'in_progress', plan_id: 'dp1' },
      { id: 'n2', title: 'Other plan task', status: 'not_started', plan_id: 'dp2' },
    ]);
    createApiClient.mockReturnValue({ users: { getMyTasks: getMyTasksMock } });

    const result = await localClient.getMyTasks({});
    expect(result.tasks).toEqual([
      { id: 'n1', title: 'Task 1', status: 'in_progress', plan_id: 'dp1' },
    ]);
  });

  test('getMyTasks uses explicit --plan-id over defaultPlanId', async () => {
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret', defaultPlanId: 'dp1' });

    const getMyTasksMock = jest.fn().mockResolvedValue([]);
    createApiClient.mockReturnValue({ users: { getMyTasks: getMyTasksMock } });

    await localClient.getMyTasks({ planId: 'explicit-plan' });
    expect(getMyTasksMock).toHaveBeenCalledWith({ plan_id: 'explicit-plan' });
  });

  test('getNextTask selects in_progress task first', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret' });

    const mockTasks = [
      { id: 'n1', title: 'Waiting', status: 'not_started', plan_id: 'plan-1' },
      { id: 'n2', title: 'Active', status: 'in_progress', plan_id: 'plan-1' },
    ];
    createApiClient.mockReturnValue({
      users: { getMyTasks: jest.fn().mockResolvedValue(mockTasks) },
      plans: { getPlan: jest.fn().mockResolvedValue({ id: 'plan-1', title: 'P' }) },
      nodes: { getNodes: jest.fn().mockResolvedValue([]) },
      context: {
        getPlanContext: jest.fn().mockResolvedValue({ phases: [] }),
        getNodeContext: jest.fn().mockResolvedValue({ node: { title: 'Active', status: 'in_progress' }, ancestry: [], knowledge: [] }),
      },
    });

    const result = await localClient.getNextTask({ dir: tempDir, planId: 'plan-1' });
    expect(result.task.id).toBe('n2');
    expect(result.task.status).toBe('in_progress');
  });

  test('getNextTask ignores cross-plan tasks when planId is selected', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret', defaultPlanId: 'plan-1' });

    const mockTasks = [
      { id: 'n1', title: 'Other plan active', status: 'in_progress', plan_id: 'plan-2' },
      { id: 'n2', title: 'Right plan ready', status: 'not_started', plan_id: 'plan-1' },
    ];
    createApiClient.mockReturnValue({
      users: { getMyTasks: jest.fn().mockResolvedValue(mockTasks) },
      plans: { getPlan: jest.fn().mockResolvedValue({ id: 'plan-1', title: 'P' }) },
      nodes: { getNodes: jest.fn().mockResolvedValue([]) },
      context: {
        getPlanContext: jest.fn().mockResolvedValue({ phases: [] }),
        getNodeContext: jest.fn().mockResolvedValue({ node: { title: 'Right plan ready', status: 'not_started' }, ancestry: [], knowledge: [] }),
      },
    });

    const result = await localClient.getNextTask({ dir: tempDir });
    expect(result.task.id).toBe('n2');
    expect(result.planId).toBe('plan-1');
  });

  test('getNextTask falls back to not_started when no in_progress', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret' });

    const mockTasks = [
      { id: 'n1', title: 'Ready', status: 'not_started', plan_id: 'plan-1' },
    ];
    createApiClient.mockReturnValue({
      users: { getMyTasks: jest.fn().mockResolvedValue(mockTasks) },
      plans: { getPlan: jest.fn().mockResolvedValue({ id: 'plan-1', title: 'P' }) },
      nodes: { getNodes: jest.fn().mockResolvedValue([]) },
      context: {
        getPlanContext: jest.fn().mockResolvedValue({ phases: [] }),
        getNodeContext: jest.fn().mockResolvedValue({ node: { title: 'Ready', status: 'not_started' }, ancestry: [], knowledge: [] }),
      },
    });

    const result = await localClient.getNextTask({ dir: tempDir, planId: 'plan-1' });
    expect(result.task.id).toBe('n1');
  });

  test('getNextTask throws when queue is empty', async () => {
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret' });

    createApiClient.mockReturnValue({
      users: { getMyTasks: jest.fn().mockResolvedValue([]) },
    });

    await expect(localClient.getNextTask({})).rejects.toThrow('No actionable tasks');
  });

  test('renderCurrentTask includes goals when present in context', () => {
    const selection = { planId: 'p1', nodeId: 'n1' };
    const plan = { id: 'p1', title: 'Plan' };
    const nodeContext = {
      node: { title: 'Task', status: 'in_progress', description: 'Do it' },
      ancestry: [],
      knowledge: [],
      goals: [{ id: 'g1', title: 'Ship v2', status: 'active' }],
    };
    const planContext = { phases: [], goals: [{ id: 'g2', title: 'Revenue target', status: 'active' }] };

    const md = localClient.renderCurrentTask(selection, plan, nodeContext, planContext);
    expect(md).toContain('## Linked goals');
    expect(md).toContain('Ship v2 [active]');
    expect(md).toContain('Revenue target [active]');
  });

  test('renderCurrentTask omits goals section when none present', () => {
    const selection = { planId: 'p1', nodeId: 'n1' };
    const plan = { id: 'p1', title: 'Plan' };
    const nodeContext = {
      node: { title: 'Task', status: 'in_progress', description: 'Do it' },
      ancestry: [],
      knowledge: [],
    };
    const planContext = { phases: [] };

    const md = localClient.renderCurrentTask(selection, plan, nodeContext, planContext);
    expect(md).not.toContain('## Linked goals');
  });

  test('renderCurrentTask surfaces plan health when quality_score present', () => {
    const selection = { planId: 'p1', nodeId: 'n1' };
    const plan = {
      id: 'p1',
      title: 'Plan',
      quality_score: 0.62,
      quality_rationale: 'Few explicit dependencies between tasks.',
      coherence_checked_at: '2026-04-20T10:00:00Z',
    };
    const nodeContext = {
      node: { title: 'Task', status: 'in_progress', description: 'Do it' },
      ancestry: [],
      knowledge: [],
    };
    const planContext = { phases: [] };

    const md = localClient.renderCurrentTask(selection, plan, nodeContext, planContext);
    expect(md).toContain('## Plan health');
    expect(md).toContain('Quality score: 0.62');
    expect(md).toContain('Few explicit dependencies');
    expect(md).toContain('Last coherence check: 2026-04-20T10:00:00Z');
  });

  test('renderCurrentTask flags coherence_status contradiction_detected', () => {
    const selection = { planId: 'p1', nodeId: 'n1' };
    const plan = { id: 'p1', title: 'Plan' };
    const nodeContext = {
      node: { title: 'Task', status: 'in_progress', description: 'Do it', coherence_status: 'contradiction_detected' },
      ancestry: [],
      knowledge: [],
    };
    const planContext = { phases: [] };

    const md = localClient.renderCurrentTask(selection, plan, nodeContext, planContext);
    expect(md).toContain('## Coherence warning');
    expect(md).toContain('contradiction_detected');
    expect(md).toContain('check_contradictions');
  });

  test('renderCurrentTask flags coherence_status stale_beliefs', () => {
    const selection = { planId: 'p1', nodeId: 'n1' };
    const plan = { id: 'p1', title: 'Plan' };
    const nodeContext = {
      node: { title: 'Task', status: 'in_progress', description: 'Do it', coherence_status: 'stale_beliefs' },
      ancestry: [],
      knowledge: [],
    };
    const planContext = { phases: [] };

    const md = localClient.renderCurrentTask(selection, plan, nodeContext, planContext);
    expect(md).toContain('## Coherence warning');
    expect(md).toContain('stale_beliefs');
    expect(md).toContain('recall_knowledge');
  });

  test('renderCurrentTask omits coherence warning when status is clean or unchecked', () => {
    const selection = { planId: 'p1', nodeId: 'n1' };
    const plan = { id: 'p1', title: 'Plan' };
    const nodeContext = {
      node: { title: 'Task', status: 'in_progress', description: 'Do it', coherence_status: 'unchecked' },
      ancestry: [],
      knowledge: [],
    };
    const planContext = { phases: [] };

    const md = localClient.renderCurrentTask(selection, plan, nodeContext, planContext);
    expect(md).not.toContain('## Coherence warning');
  });

  test('renderCurrentTask renders detected contradictions when present in nodeContext', () => {
    const selection = { planId: 'p1', nodeId: 'n1' };
    const plan = { id: 'p1', title: 'Plan' };
    const nodeContext = {
      node: { title: 'Task', status: 'in_progress', description: 'Do it' },
      ancestry: [],
      knowledge: [],
      contradictions: [
        { summary: 'Auth uses both OAuth and SAML — pick one' },
        { summary: 'Deployment target conflicts: K8s vs ECS' },
      ],
    };
    const planContext = { phases: [] };

    const md = localClient.renderCurrentTask(selection, plan, nodeContext, planContext);
    expect(md).toContain('## Detected contradictions');
    expect(md).toContain('OAuth and SAML');
    expect(md).toContain('K8s vs ECS');
  });

  test('renderCurrentTask surfaces task_mode when not free', () => {
    const selection = { planId: 'p1', nodeId: 'n1' };
    const plan = { id: 'p1', title: 'Plan' };
    const nodeContext = {
      node: { title: 'Task', status: 'in_progress', description: 'Do it', task_mode: 'implement' },
      ancestry: [],
      knowledge: [],
    };
    const planContext = { phases: [] };

    const md = localClient.renderCurrentTask(selection, plan, nodeContext, planContext);
    expect(md).toContain('Task mode: implement');
  });

  test('getNextTask resumes in_progress task before consulting suggest_next_tasks', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret', defaultPlanId: 'plan-1' });

    const suggestNextTasks = jest.fn();
    const claimTask = jest.fn().mockResolvedValue({});
    const getMyTasks = jest.fn().mockResolvedValue([
      { id: 'active-1', title: 'Active work', status: 'in_progress', plan_id: 'plan-1' },
    ]);

    createApiClient.mockReturnValue({
      users: { getMyTasks },
      nodes: { suggestNextTasks, claimTask, getNodes: jest.fn().mockResolvedValue([]) },
      plans: { getPlan: jest.fn().mockResolvedValue({ id: 'plan-1', title: 'P' }) },
      context: {
        getPlanContext: jest.fn().mockResolvedValue({ phases: [] }),
        getNodeContext: jest.fn().mockResolvedValue({ node: { title: 'Active work', status: 'in_progress' }, ancestry: [], knowledge: [] }),
      },
    });

    const result = await localClient.getNextTask({ dir: tempDir, planId: 'plan-1' });
    expect(result.task.id).toBe('active-1');
    expect(result.source).toBe('resume_in_progress');
    expect(suggestNextTasks).not.toHaveBeenCalled();
  });

  test('getNextTask uses suggest_next_tasks when no in_progress exists', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret', defaultPlanId: 'plan-1' });

    const suggestNextTasks = jest.fn().mockResolvedValue([
      { id: 'suggested-1', title: 'Dependency-aware pick', status: 'not_started', task_mode: 'implement' },
    ]);
    const claimTask = jest.fn().mockResolvedValue({});
    const getMyTasks = jest.fn().mockResolvedValue([
      { id: 'queue-1', title: 'Pending', status: 'not_started', plan_id: 'plan-1' },
    ]);

    createApiClient.mockReturnValue({
      users: { getMyTasks },
      nodes: { suggestNextTasks, claimTask, getNodes: jest.fn().mockResolvedValue([]) },
      plans: { getPlan: jest.fn().mockResolvedValue({ id: 'plan-1', title: 'P' }) },
      context: {
        getPlanContext: jest.fn().mockResolvedValue({ phases: [] }),
        getNodeContext: jest.fn().mockResolvedValue({ node: { title: 'Dependency-aware pick', status: 'not_started' }, ancestry: [], knowledge: [] }),
      },
    });

    const result = await localClient.getNextTask({ dir: tempDir, planId: 'plan-1' });
    expect(suggestNextTasks).toHaveBeenCalledWith('plan-1', 5);
    expect(result.task.id).toBe('suggested-1');
    expect(result.source).toBe('suggest_next_tasks');
    expect(claimTask).toHaveBeenCalledWith('plan-1', 'suggested-1', 'ap-cli', 30);
  });

  test('getNextTask --fresh skips in_progress and uses suggest_next_tasks', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret', defaultPlanId: 'plan-1' });

    const suggestNextTasks = jest.fn().mockResolvedValue([
      { id: 'suggested-1', title: 'Fresh pick', status: 'not_started' },
    ]);
    const getMyTasks = jest.fn();

    createApiClient.mockReturnValue({
      users: { getMyTasks },
      nodes: { suggestNextTasks, claimTask: jest.fn().mockResolvedValue({}), getNodes: jest.fn().mockResolvedValue([]) },
      plans: { getPlan: jest.fn().mockResolvedValue({ id: 'plan-1', title: 'P' }) },
      context: {
        getPlanContext: jest.fn().mockResolvedValue({ phases: [] }),
        getNodeContext: jest.fn().mockResolvedValue({ node: { title: 'Fresh pick', status: 'not_started' }, ancestry: [], knowledge: [] }),
      },
    });

    const result = await localClient.getNextTask({ dir: tempDir, planId: 'plan-1', fresh: true });
    expect(getMyTasks).not.toHaveBeenCalled();
    expect(result.task.id).toBe('suggested-1');
    expect(result.source).toBe('suggest_next_tasks');
  });

  test('getNextTask falls back to not_started in queue when no in_progress and no suggestions', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret', defaultPlanId: 'plan-1' });

    createApiClient.mockReturnValue({
      users: {
        getMyTasks: jest.fn().mockResolvedValue([
          { id: 'queue-1', title: 'Pending', status: 'not_started', plan_id: 'plan-1' },
        ]),
      },
      nodes: {
        suggestNextTasks: jest.fn().mockResolvedValue([]),
        claimTask: jest.fn().mockResolvedValue({}),
        getNodes: jest.fn().mockResolvedValue([]),
      },
      plans: { getPlan: jest.fn().mockResolvedValue({ id: 'plan-1', title: 'P' }) },
      context: {
        getPlanContext: jest.fn().mockResolvedValue({ phases: [] }),
        getNodeContext: jest.fn().mockResolvedValue({ node: { title: 'Pending', status: 'not_started' }, ancestry: [], knowledge: [] }),
      },
    });

    const result = await localClient.getNextTask({ dir: tempDir, planId: 'plan-1' });
    expect(result.task.id).toBe('queue-1');
    expect(result.source).toBe('my_tasks_fallback');
  });

  test('getNextTask continues when claim fails (claim is best-effort)', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret', defaultPlanId: 'plan-1' });

    createApiClient.mockReturnValue({
      users: { getMyTasks: jest.fn() },
      nodes: {
        suggestNextTasks: jest.fn().mockResolvedValue([{ id: 'n1', title: 'T', status: 'not_started' }]),
        claimTask: jest.fn().mockRejectedValue(new Error('Already claimed')),
        getNodes: jest.fn().mockResolvedValue([]),
      },
      plans: { getPlan: jest.fn().mockResolvedValue({ id: 'plan-1', title: 'P' }) },
      context: {
        getPlanContext: jest.fn().mockResolvedValue({ phases: [] }),
        getNodeContext: jest.fn().mockResolvedValue({ node: { title: 'T', status: 'not_started' }, ancestry: [], knowledge: [] }),
      },
    });

    const result = await localClient.getNextTask({ dir: tempDir, planId: 'plan-1' });
    expect(result.task.id).toBe('n1');
    expect(result.claimed).toBe(false);
  });

  test('updateStatus start claims the task', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { ensureDir, writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret' });

    const stateDir = path.join(tempDir, '.agentplanner');
    ensureDir(stateDir);
    fs.writeFileSync(path.join(stateDir, 'context.json'), JSON.stringify({ selection: { planId: 'plan-1', nodeId: 'node-1' } }));

    const claimTask = jest.fn().mockResolvedValue({});
    createApiClient.mockReturnValue({
      nodes: { updateNodeStatus: jest.fn().mockResolvedValue({}), claimTask },
      logs: { addLogEntry: jest.fn() },
    });

    const result = await localClient.updateStatus('start', { dir: tempDir });
    expect(claimTask).toHaveBeenCalledWith('plan-1', 'node-1', 'ap-cli', 30);
    expect(result.claimed).toBe(true);
  });

  test('updateStatus blocked releases the claim', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { ensureDir, writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret' });

    const stateDir = path.join(tempDir, '.agentplanner');
    ensureDir(stateDir);
    fs.writeFileSync(path.join(stateDir, 'context.json'), JSON.stringify({ selection: { planId: 'plan-1', nodeId: 'node-1' } }));

    const releaseTask = jest.fn().mockResolvedValue({});
    createApiClient.mockReturnValue({
      nodes: { updateNodeStatus: jest.fn().mockResolvedValue({}), releaseTask },
      logs: { addLogEntry: jest.fn().mockResolvedValue({}) },
    });

    const result = await localClient.updateStatus('blocked', { dir: tempDir, message: 'waiting' });
    expect(releaseTask).toHaveBeenCalledWith('plan-1', 'node-1', 'ap-cli');
    expect(result.released).toBe(true);
  });

  test('updateStatus done with --message writes a learning episode', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { ensureDir, writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret' });

    const stateDir = path.join(tempDir, '.agentplanner');
    ensureDir(stateDir);
    fs.writeFileSync(path.join(stateDir, 'context.json'), JSON.stringify({
      selection: { planId: 'plan-1', nodeId: 'node-1' },
      nodeContext: { node: { title: 'Add login flow' } },
    }));

    const addEpisode = jest.fn().mockResolvedValue({});
    const releaseTask = jest.fn().mockResolvedValue({});
    createApiClient.mockReturnValue({
      nodes: { updateNodeStatus: jest.fn().mockResolvedValue({}), releaseTask },
      logs: { addLogEntry: jest.fn().mockResolvedValue({}) },
      graphiti: { addEpisode },
    });

    const result = await localClient.updateStatus('done', { dir: tempDir, message: 'Picked JWT — simpler than session cookies for our SPA' });
    expect(addEpisode).toHaveBeenCalledWith({
      content: 'Picked JWT — simpler than session cookies for our SPA',
      name: '[done] Add login flow',
      plan_id: 'plan-1',
      node_id: 'node-1',
      metadata: { entry_type: 'learning', source: 'ap-cli' },
    });
    expect(result.learned).toBe(true);
    expect(result.released).toBe(true);
  });

  test('updateStatus done without --message does not write learning', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { ensureDir, writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret' });

    const stateDir = path.join(tempDir, '.agentplanner');
    ensureDir(stateDir);
    fs.writeFileSync(path.join(stateDir, 'context.json'), JSON.stringify({ selection: { planId: 'plan-1', nodeId: 'node-1' } }));

    const addEpisode = jest.fn();
    createApiClient.mockReturnValue({
      nodes: { updateNodeStatus: jest.fn().mockResolvedValue({}), releaseTask: jest.fn().mockResolvedValue({}) },
      logs: { addLogEntry: jest.fn() },
      graphiti: { addEpisode },
    });

    const result = await localClient.updateStatus('done', { dir: tempDir });
    expect(addEpisode).not.toHaveBeenCalled();
    expect(result.learned).toBe(false);
  });

  test('updateStatus done with --message tolerates learning write failure', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workspace-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    const { ensureDir, writeConfig } = require('../src/cli/config');
    writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret' });

    const stateDir = path.join(tempDir, '.agentplanner');
    ensureDir(stateDir);
    fs.writeFileSync(path.join(stateDir, 'context.json'), JSON.stringify({ selection: { planId: 'plan-1', nodeId: 'node-1' } }));

    createApiClient.mockReturnValue({
      nodes: { updateNodeStatus: jest.fn().mockResolvedValue({}), releaseTask: jest.fn().mockResolvedValue({}) },
      logs: { addLogEntry: jest.fn().mockResolvedValue({}) },
      graphiti: { addEpisode: jest.fn().mockRejectedValue(new Error('Graphiti unavailable')) },
    });

    const result = await localClient.updateStatus('done', { dir: tempDir, message: 'shipped it' });
    expect(result.status).toBe('completed');
    expect(result.learned).toBe(false);
    expect(result.logged).toBe(true);
  });
});
