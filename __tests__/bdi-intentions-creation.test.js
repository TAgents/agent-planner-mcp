/**
 * BDI intentions creation tool tests (v1.0):
 *  - form_intention
 *  - extend_intention
 *  - propose_research_chain
 */

const intentions = require('../src/tools/bdi/intentions');

const GOAL_ID = 'goal-uuid';
const PLAN_ID = 'plan-uuid';
const PARENT_ID = 'parent-node-uuid';

function parseResponse(response) {
  return JSON.parse(response.content[0].text);
}

function makeApiClient(overrides = {}) {
  let nodeCounter = 0;
  return {
    axiosInstance: {
      get: jest.fn().mockResolvedValue({ data: { plan_id: PLAN_ID } }),
      post: jest.fn().mockResolvedValue({ data: {} }),
    },
    plans: {
      createPlan: jest.fn().mockResolvedValue({
        id: PLAN_ID,
        title: 'New Plan',
        status: 'active',
        visibility: 'private',
      }),
      ...overrides.plans,
    },
    nodes: {
      createNode: jest.fn().mockImplementation((planId, data) => {
        nodeCounter += 1;
        return Promise.resolve({
          result: {
            id: `node-${nodeCounter}`,
            title: data.title,
            node_type: data.node_type || 'task',
          },
          created: true,
        });
      }),
      ...overrides.nodes,
    },
    goals: {
      get: jest.fn().mockResolvedValue({ id: GOAL_ID, title: 'Parent Goal' }),
      linkPlan: jest.fn().mockResolvedValue({}),
      ...overrides.goals,
    },
  };
}

describe('form_intention tool', () => {
  it('exports the tool', () => {
    const def = intentions.definitions.find((d) => d.name === 'form_intention');
    expect(def).toBeDefined();
    expect(def.inputSchema.required).toEqual(expect.arrayContaining(['goal_id', 'title', 'rationale']));
  });

  it('creates a plan and links to goal', async () => {
    const client = makeApiClient();
    const handler = intentions.handlers.form_intention;

    await handler(
      { goal_id: GOAL_ID, title: 'P1', rationale: 'because', tree: [] },
      client,
    );

    expect(client.plans.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'P1', status: 'active', visibility: 'private' }),
    );
    expect(client.goals.linkPlan).toHaveBeenCalledWith(GOAL_ID, PLAN_ID);
  });

  it('defaults status to active and creates a flat tree', async () => {
    const client = makeApiClient();
    const handler = intentions.handlers.form_intention;

    const result = await handler(
      {
        goal_id: GOAL_ID,
        title: 'P1',
        rationale: 'r',
        tree: [
          { node_type: 'phase', title: 'Phase A' },
          { node_type: 'task', title: 'Task 1' },
        ],
      },
      client,
    );

    expect(client.nodes.createNode).toHaveBeenCalledTimes(2);
    const body = parseResponse(result);
    expect(body.is_draft).toBe(false);
    expect(body.nodes_created).toBe(2);
    expect(body.node_failures).toHaveLength(0);
  });

  it('creates a nested tree with parent IDs propagated', async () => {
    const client = makeApiClient();
    const handler = intentions.handlers.form_intention;

    await handler(
      {
        goal_id: GOAL_ID,
        title: 'P1',
        rationale: 'r',
        tree: [
          {
            node_type: 'phase',
            title: 'Phase A',
            children: [
              { node_type: 'task', title: 'Task A1' },
              { node_type: 'task', title: 'Task A2' },
            ],
          },
        ],
      },
      client,
    );

    // 1 phase + 2 tasks = 3 createNode calls
    expect(client.nodes.createNode).toHaveBeenCalledTimes(3);

    // Top-level (phase) has no parent_id
    const phaseCall = client.nodes.createNode.mock.calls[0][1];
    expect(phaseCall.parent_id).toBeUndefined();

    // Children of phase reference the phase id
    const childCalls = client.nodes.createNode.mock.calls.slice(1);
    for (const [, payload] of childCalls) {
      expect(payload.parent_id).toBe('node-1'); // phase was created first
    }
  });

  it('accepts status=draft for autonomous proposals', async () => {
    const client = makeApiClient({
      plans: {
        createPlan: jest.fn().mockResolvedValue({ id: PLAN_ID, status: 'draft' }),
      },
    });
    const handler = intentions.handlers.form_intention;

    const result = await handler(
      { goal_id: GOAL_ID, title: 'P1', rationale: 'r', status: 'draft', tree: [] },
      client,
    );

    expect(client.plans.createPlan).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
    const body = parseResponse(result);
    expect(body.is_draft).toBe(true);
    expect(body.next_step).toMatch(/draft.*pending/i);
  });

  it('rejects when goal not found before creating plan', async () => {
    const client = makeApiClient({
      goals: { get: jest.fn().mockRejectedValue(new Error('404')) },
    });
    const handler = intentions.handlers.form_intention;

    const result = await handler(
      { goal_id: 'missing', title: 'P1', rationale: 'r', tree: [] },
      client,
    );

    expect(client.plans.createPlan).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });

  it('rejects invalid tree shapes upfront', async () => {
    const client = makeApiClient();
    const handler = intentions.handlers.form_intention;

    const result = await handler(
      {
        goal_id: GOAL_ID,
        title: 'P1',
        rationale: 'r',
        tree: [{ node_type: 'invalid', title: 'X' }],
      },
      client,
    );

    expect(client.plans.createPlan).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/invalid node_type/);
  });
});

describe('extend_intention tool', () => {
  it('exports the tool', () => {
    const def = intentions.definitions.find((d) => d.name === 'extend_intention');
    expect(def).toBeDefined();
  });

  it('adds children under an existing parent', async () => {
    const client = makeApiClient();
    const handler = intentions.handlers.extend_intention;

    const result = await handler(
      {
        parent_id: PARENT_ID,
        plan_id: PLAN_ID,
        rationale: 'decompose',
        children: [
          { title: 'Subtask 1' },
          { title: 'Subtask 2' },
        ],
      },
      client,
    );

    expect(client.nodes.createNode).toHaveBeenCalledTimes(2);
    expect(client.nodes.createNode.mock.calls[0][1].parent_id).toBe(PARENT_ID);
    const body = parseResponse(result);
    expect(body.nodes_created).toBe(2);
  });

  it('auto-resolves plan_id from parent', async () => {
    const client = makeApiClient();
    const handler = intentions.handlers.extend_intention;

    await handler(
      { parent_id: PARENT_ID, rationale: 'r', children: [{ title: 'T' }] },
      client,
    );

    expect(client.axiosInstance.get).toHaveBeenCalledWith(`/nodes/${PARENT_ID}`);
    expect(client.nodes.createNode).toHaveBeenCalledWith(PLAN_ID, expect.objectContaining({ parent_id: PARENT_ID }));
  });
});

describe('propose_research_chain tool', () => {
  it('exports the tool', () => {
    const def = intentions.definitions.find((d) => d.name === 'propose_research_chain');
    expect(def).toBeDefined();
  });

  it('creates 3 tasks and 2 blocking edges', async () => {
    const client = makeApiClient();
    const handler = intentions.handlers.propose_research_chain;

    const result = await handler(
      {
        parent_id: PARENT_ID,
        plan_id: PLAN_ID,
        research_question: 'Which framework wins?',
        implementation_target: 'Migrate auth to chosen framework',
        rationale: 'Significant unknowns about framework fit',
      },
      client,
    );

    expect(client.nodes.createNode).toHaveBeenCalledTimes(3);

    // Verify task_modes are research / plan / implement
    const modes = client.nodes.createNode.mock.calls.map((c) => c[1].task_mode);
    expect(modes).toEqual(['research', 'plan', 'implement']);

    // Two blocking edges via /dependencies
    expect(client.axiosInstance.post).toHaveBeenCalledTimes(2);
    expect(client.axiosInstance.post.mock.calls[0][1]).toEqual(
      expect.objectContaining({ dependency_type: 'blocks' }),
    );

    const body = parseResponse(result);
    expect(body.research).toBeDefined();
    expect(body.plan).toBeDefined();
    expect(body.implement).toBeDefined();
    expect(body.edges).toHaveLength(2);
  });
});
