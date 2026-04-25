/**
 * BDI intentions mutation tool tests (v1.0):
 *  - update_plan
 *  - update_node
 *  - move_node
 *  - delete_plan
 *  - delete_node
 */

const intentions = require('../src/tools/bdi/intentions');

const PLAN_ID = 'plan-uuid';
const NODE_ID = 'node-uuid';

function parseResponse(response) {
  return JSON.parse(response.content[0].text);
}

describe('update_plan tool', () => {
  it('exports the tool', () => {
    const def = intentions.definitions.find((d) => d.name === 'update_plan');
    expect(def).toBeDefined();
  });

  it('updates plan fields', async () => {
    const client = {
      plans: {
        getPlan: jest.fn().mockResolvedValue({ id: PLAN_ID, status: 'active', visibility: 'private' }),
        updatePlan: jest.fn().mockResolvedValue({}),
        updateVisibility: jest.fn().mockResolvedValue({}),
      },
    };
    const handler = intentions.handlers.update_plan;

    const result = await handler(
      { plan_id: PLAN_ID, title: 'Renamed', status: 'completed' },
      client,
    );

    expect(client.plans.updatePlan).toHaveBeenCalledWith(
      PLAN_ID,
      expect.objectContaining({ title: 'Renamed', status: 'completed' }),
    );
    const body = parseResponse(result);
    expect(body.applied_changes).toEqual(expect.arrayContaining(['title', 'status']));
  });

  it('blocks un-archiving without restore=true', async () => {
    const client = {
      plans: {
        getPlan: jest.fn().mockResolvedValue({ id: PLAN_ID, status: 'archived' }),
        updatePlan: jest.fn(),
        updateVisibility: jest.fn(),
      },
    };
    const handler = intentions.handlers.update_plan;

    const result = await handler(
      { plan_id: PLAN_ID, status: 'active' },
      client,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/restore_required|restore=true/);
    expect(client.plans.updatePlan).not.toHaveBeenCalled();
  });

  it('allows un-archiving with restore=true', async () => {
    const client = {
      plans: {
        getPlan: jest.fn().mockResolvedValue({ id: PLAN_ID, status: 'archived' }),
        updatePlan: jest.fn().mockResolvedValue({}),
        updateVisibility: jest.fn(),
      },
    };
    const handler = intentions.handlers.update_plan;

    await handler(
      { plan_id: PLAN_ID, status: 'active', restore: true },
      client,
    );

    expect(client.plans.updatePlan).toHaveBeenCalledWith(
      PLAN_ID,
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('routes visibility changes through the visibility endpoint', async () => {
    const client = {
      plans: {
        getPlan: jest.fn().mockResolvedValue({ id: PLAN_ID, status: 'active' }),
        updatePlan: jest.fn().mockResolvedValue({}),
        updateVisibility: jest.fn().mockResolvedValue({}),
      },
    };
    const handler = intentions.handlers.update_plan;

    await handler(
      { plan_id: PLAN_ID, visibility: 'public' },
      client,
    );

    expect(client.plans.updateVisibility).toHaveBeenCalledWith(PLAN_ID, { visibility: 'public' });
  });
});

describe('update_node tool', () => {
  it('exports the tool', () => {
    const def = intentions.definitions.find((d) => d.name === 'update_node');
    expect(def).toBeDefined();
  });

  it('updates node fields', async () => {
    const client = {
      nodes: {
        updateNode: jest.fn().mockResolvedValue({ result: { id: NODE_ID, title: 'New' } }),
      },
    };
    const handler = intentions.handlers.update_node;

    await handler(
      { node_id: NODE_ID, plan_id: PLAN_ID, title: 'New', agent_instructions: 'Do X' },
      client,
    );

    expect(client.nodes.updateNode).toHaveBeenCalledWith(
      PLAN_ID,
      NODE_ID,
      expect.objectContaining({ title: 'New', agent_instructions: 'Do X' }),
    );
  });

  it('rejects empty payload', async () => {
    const client = { nodes: { updateNode: jest.fn() } };
    const handler = intentions.handlers.update_node;

    const result = await handler(
      { node_id: NODE_ID, plan_id: PLAN_ID },
      client,
    );

    expect(result.isError).toBe(true);
    expect(client.nodes.updateNode).not.toHaveBeenCalled();
  });

  it('auto-resolves plan_id from node', async () => {
    const client = {
      axiosInstance: {
        get: jest.fn().mockResolvedValue({ data: { plan_id: PLAN_ID } }),
      },
      nodes: {
        updateNode: jest.fn().mockResolvedValue({ result: { id: NODE_ID } }),
      },
    };
    const handler = intentions.handlers.update_node;

    await handler({ node_id: NODE_ID, title: 'X' }, client);

    expect(client.axiosInstance.get).toHaveBeenCalledWith(`/nodes/${NODE_ID}`);
    expect(client.nodes.updateNode).toHaveBeenCalledWith(PLAN_ID, NODE_ID, expect.any(Object));
  });
});

describe('move_node tool', () => {
  it('exports the tool', () => {
    const def = intentions.definitions.find((d) => d.name === 'move_node');
    expect(def).toBeDefined();
  });

  it('reparents a node', async () => {
    const client = {
      axiosInstance: {
        post: jest.fn().mockResolvedValue({ data: { id: NODE_ID, parent_id: 'new-parent' } }),
      },
    };
    const handler = intentions.handlers.move_node;

    await handler(
      { node_id: NODE_ID, plan_id: PLAN_ID, new_parent_id: 'new-parent', position: 2 },
      client,
    );

    expect(client.axiosInstance.post).toHaveBeenCalledWith(
      `/plans/${PLAN_ID}/nodes/${NODE_ID}/move`,
      { parent_id: 'new-parent', order_index: 2 },
    );
  });
});

describe('delete_plan tool', () => {
  it('exports the tool', () => {
    const def = intentions.definitions.find((d) => d.name === 'delete_plan');
    expect(def).toBeDefined();
  });

  it('soft-deletes via update to status=archived', async () => {
    const client = {
      plans: {
        updatePlan: jest.fn().mockResolvedValue({}),
      },
    };
    const handler = intentions.handlers.delete_plan;

    const result = await handler({ plan_id: PLAN_ID, reason: 'obsolete' }, client);

    expect(client.plans.updatePlan).toHaveBeenCalledWith(PLAN_ID, { status: 'archived' });
    const body = parseResponse(result);
    expect(body.archived).toBe(true);
    expect(body.reason).toBe('obsolete');
    expect(body.next_step).toMatch(/restore.*active.*restore.*true/i);
  });
});

describe('delete_node tool', () => {
  it('exports the tool', () => {
    const def = intentions.definitions.find((d) => d.name === 'delete_node');
    expect(def).toBeDefined();
  });

  it('soft-deletes a node via status=archived', async () => {
    const client = {
      nodes: {
        updateNode: jest.fn().mockResolvedValue({ result: {} }),
      },
    };
    const handler = intentions.handlers.delete_node;

    const result = await handler(
      { node_id: NODE_ID, plan_id: PLAN_ID, reason: 'cancelled' },
      client,
    );

    expect(client.nodes.updateNode).toHaveBeenCalledWith(
      PLAN_ID,
      NODE_ID,
      { status: 'archived' },
    );
    const body = parseResponse(result);
    expect(body.archived).toBe(true);
  });
});
