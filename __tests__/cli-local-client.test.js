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

    await expect(localClient.getNextTask({})).rejects.toThrow('No tasks in the queue');
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
});
