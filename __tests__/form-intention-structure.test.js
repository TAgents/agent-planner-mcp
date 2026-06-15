/**
 * form_intention dependency-structure contract (v1.5):
 *  - inline depends_on creates 'blocks' edges (server + legacy paths)
 *  - multi-task plans with zero edges are flagged created_without_dependencies
 *  - get_started reports the MCP version
 *
 * The product invariant: an agent cannot silently ship a valid-looking tree
 * with no executable ordering — the tool surfaces it.
 */

const intentions = require('../src/tools/bdi/intentions');
const utility = require('../src/tools/bdi/utility');
const pkg = require('../package.json');

const GOAL_ID = 'goal-uuid';
const PLAN_ID = 'plan-uuid';

function parse(response) {
  return JSON.parse(response.content[0].text);
}

// Legacy (no agentLoop) client — forces the client-side fan-out + edge wiring.
function legacyClient(overrides = {}) {
  let n = 0;
  return {
    axiosInstance: {
      get: jest.fn().mockResolvedValue({ data: { plan_id: PLAN_ID } }),
      post: jest.fn().mockResolvedValue({ data: {} }),
    },
    plans: {
      createPlan: jest.fn().mockResolvedValue({ id: PLAN_ID, status: 'active', visibility: 'private' }),
      updateVisibility: jest.fn().mockResolvedValue({}),
      ...overrides.plans,
    },
    nodes: {
      createNode: jest.fn().mockImplementation((planId, data) => {
        n += 1;
        return Promise.resolve({ result: { id: `node-${n}`, title: data.title, node_type: data.node_type || 'task' } });
      }),
      ...overrides.nodes,
    },
    goals: {
      get: jest.fn().mockResolvedValue({ id: GOAL_ID }),
      linkPlan: jest.fn().mockResolvedValue({}),
      ...overrides.goals,
    },
  };
}

describe('form_intention — inline dependencies (server path)', () => {
  it('passes depends_on through to createIntention and surfaces the backend structure/warning', async () => {
    const client = {
      agentLoop: {
        createIntention: jest.fn().mockResolvedValue({
          plan: { id: PLAN_ID, status: 'active' },
          tree: [{ id: 'n1' }, { id: 'n2' }],
          structure: { task_count: 2, dependency_edges: 0, created_without_dependencies: true },
          warning: 'Plan has 2 tasks but no dependency edges — execution order is implicit only.',
          next_required_action: 'Call link_intentions to add blocking edges, or confirm the tasks are order-independent.',
        }),
      },
      goals: { get: jest.fn() },
      plans: { createPlan: jest.fn() },
      nodes: { createNode: jest.fn() },
    };
    const tree = [
      { title: 'Design', ref: 'design', node_type: 'task' },
      { title: 'Build', node_type: 'task', depends_on: ['design'] },
    ];

    const result = await intentions.handlers.form_intention(
      { goal_id: GOAL_ID, title: 'P', rationale: 'r', tree },
      client,
    );
    const body = parse(result);

    // The tree (with ref/depends_on) reaches the server unchanged.
    expect(client.agentLoop.createIntention).toHaveBeenCalledWith(expect.objectContaining({ tree }));
    // No client-side fan-out when the server path handles it.
    expect(client.plans.createPlan).not.toHaveBeenCalled();
    // Backend structure + warning flow through.
    expect(body.structure.created_without_dependencies).toBe(true);
    expect(body.warning).toMatch(/no dependency edges/i);
    expect(body.next_required_action).toMatch(/link_intentions/);
  });
});

describe('form_intention — inline dependencies (legacy path)', () => {
  it('creates a blocks edge for a depends_on ref', async () => {
    const client = legacyClient();
    const tree = [
      { title: 'Design', ref: 'design', node_type: 'task' }, // node-1
      { title: 'Build', node_type: 'task', depends_on: ['design'] }, // node-2
    ];

    const result = await intentions.handlers.form_intention(
      { goal_id: GOAL_ID, title: 'P', rationale: 'r', tree },
      client,
    );
    const body = parse(result);

    expect(client.axiosInstance.post).toHaveBeenCalledWith('/dependencies', {
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      dependency_type: 'blocks',
    });
    expect(body.structure.dependency_edges).toBe(1);
    expect(body.structure.created_without_dependencies).toBe(false);
    expect(body.warning).toBeUndefined();
  });

  it('resolves depends_on by title when no ref is given', async () => {
    const client = legacyClient();
    const tree = [
      { title: 'Design', node_type: 'task' },
      { title: 'Build', node_type: 'task', depends_on: ['Design'] },
    ];

    await intentions.handlers.form_intention(
      { goal_id: GOAL_ID, title: 'P', rationale: 'r', tree },
      client,
    );

    expect(client.axiosInstance.post).toHaveBeenCalledWith('/dependencies', {
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      dependency_type: 'blocks',
    });
  });

  it('flags created_without_dependencies for a multi-task plan with no edges', async () => {
    const client = legacyClient();
    const tree = [
      { title: 'Task A', node_type: 'task' },
      { title: 'Task B', node_type: 'task' },
    ];

    const result = await intentions.handlers.form_intention(
      { goal_id: GOAL_ID, title: 'P', rationale: 'r', tree },
      client,
    );
    const body = parse(result);

    expect(client.axiosInstance.post).not.toHaveBeenCalledWith('/dependencies', expect.anything());
    expect(body.structure.task_count).toBe(2);
    expect(body.structure.dependency_edges).toBe(0);
    expect(body.structure.created_without_dependencies).toBe(true);
    expect(body.warning).toMatch(/no dependency edges/i);
    expect(body.next_required_action).toMatch(/link_intentions/);
  });

  it('records a warning for an unresolved depends_on reference without failing the plan', async () => {
    const client = legacyClient();
    const tree = [
      { title: 'Task A', node_type: 'task' },
      { title: 'Task B', node_type: 'task', depends_on: ['does-not-exist'] },
    ];

    const result = await intentions.handlers.form_intention(
      { goal_id: GOAL_ID, title: 'P', rationale: 'r', tree },
      client,
    );
    const body = parse(result);

    expect(body.nodes_created).toBe(2); // plan still created
    expect(client.axiosInstance.post).not.toHaveBeenCalledWith('/dependencies', expect.anything());
    expect(body.structure.dependency_warnings[0]).toMatch(/does-not-exist/);
  });
});

describe('form_intention — provenance stamp', () => {
  const TAG = `agent-planner-mcp@${pkg.version}`;

  it('sends client_version to createIntention on the server path', async () => {
    const client = {
      agentLoop: { createIntention: jest.fn().mockResolvedValue({ plan: { id: PLAN_ID, status: 'active' }, tree: [], structure: {} }) },
      goals: { get: jest.fn() },
      plans: { createPlan: jest.fn() },
      nodes: { createNode: jest.fn() },
    };

    await intentions.handlers.form_intention(
      { goal_id: GOAL_ID, title: 'P', rationale: 'r', tree: [{ title: 'A', node_type: 'task' }] },
      client,
    );

    expect(client.agentLoop.createIntention).toHaveBeenCalledWith(expect.objectContaining({ client_version: TAG }));
  });

  it('stamps created_by into plan metadata and structure on the legacy path', async () => {
    const client = legacyClient();

    const result = await intentions.handlers.form_intention(
      { goal_id: GOAL_ID, title: 'P', rationale: 'r', tree: [{ title: 'A', node_type: 'task' }] },
      client,
    );
    const body = parse(result);

    expect(client.plans.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { created_by: TAG } }),
    );
    expect(body.structure.created_by).toBe(TAG);
  });
});

describe('get_started — version reporting', () => {
  it('reports the running MCP version', async () => {
    const result = await utility.handlers.get_started({});
    expect(parse(result).mcp_version).toBe(pkg.version);
  });
});
