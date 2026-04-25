/**
 * BDI intentions dependency tool tests (v1.0):
 *  - link_intentions
 *  - unlink_intentions
 */

const intentions = require('../src/tools/bdi/intentions');

const PLAN_ID = 'plan-uuid';
const FROM_TASK = 'task-from';
const TO_TASK = 'task-to';
const DEP_ID = 'dep-uuid';

function parseResponse(response) {
  return JSON.parse(response.content[0].text);
}

describe('link_intentions tool', () => {
  it('exports the tool', () => {
    const def = intentions.definitions.find((d) => d.name === 'link_intentions');
    expect(def).toBeDefined();
    expect(def.inputSchema.required).toEqual(
      expect.arrayContaining(['from_task_id', 'to_task_id', 'rationale']),
    );
  });

  it('creates a blocks edge between two tasks in the same plan', async () => {
    const client = {
      axiosInstance: {
        get: jest.fn()
          .mockResolvedValueOnce({ data: { plan_id: PLAN_ID } })
          .mockResolvedValueOnce({ data: { plan_id: PLAN_ID } }),
        post: jest.fn().mockResolvedValue({ data: { id: DEP_ID } }),
      },
    };
    const handler = intentions.handlers.link_intentions;

    const result = await handler(
      { from_task_id: FROM_TASK, to_task_id: TO_TASK, rationale: 'B needs A output' },
      client,
    );

    expect(client.axiosInstance.post).toHaveBeenCalledWith(
      `/plans/${PLAN_ID}/dependencies`,
      expect.objectContaining({
        source_node_id: FROM_TASK,
        target_node_id: TO_TASK,
        dependency_type: 'blocks',
      }),
    );
    const body = parseResponse(result);
    expect(body.dependency_id).toBe(DEP_ID);
    expect(body.relation).toBe('blocks');
  });

  it('rejects self-loop', async () => {
    const client = { axiosInstance: { get: jest.fn(), post: jest.fn() } };
    const handler = intentions.handlers.link_intentions;

    const result = await handler(
      { from_task_id: FROM_TASK, to_task_id: FROM_TASK, rationale: 'r' },
      client,
    );

    expect(result.isError).toBe(true);
    expect(client.axiosInstance.get).not.toHaveBeenCalled();
  });

  it('rejects when tasks are in different plans', async () => {
    const client = {
      axiosInstance: {
        get: jest.fn()
          .mockResolvedValueOnce({ data: { plan_id: 'plan-a' } })
          .mockResolvedValueOnce({ data: { plan_id: 'plan-b' } }),
        post: jest.fn(),
      },
    };
    const handler = intentions.handlers.link_intentions;

    const result = await handler(
      { from_task_id: FROM_TASK, to_task_id: TO_TASK, rationale: 'r' },
      client,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/cross.plan|same plan/i);
    expect(client.axiosInstance.post).not.toHaveBeenCalled();
  });

  it('surfaces cycle detection (409) cleanly', async () => {
    const client = {
      axiosInstance: {
        get: jest.fn().mockResolvedValue({ data: { plan_id: PLAN_ID } }),
        post: jest.fn().mockRejectedValue({
          response: { status: 409, data: { error: 'Would create cycle A→B→A' } },
        }),
      },
    };
    const handler = intentions.handlers.link_intentions;

    const result = await handler(
      { from_task_id: FROM_TASK, to_task_id: TO_TASK, rationale: 'r' },
      client,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/cycle/i);
  });

  it('respects relation override', async () => {
    const client = {
      axiosInstance: {
        get: jest.fn().mockResolvedValue({ data: { plan_id: PLAN_ID } }),
        post: jest.fn().mockResolvedValue({ data: { id: DEP_ID } }),
      },
    };
    const handler = intentions.handlers.link_intentions;

    await handler(
      { from_task_id: FROM_TASK, to_task_id: TO_TASK, rationale: 'r', relation: 'requires' },
      client,
    );

    expect(client.axiosInstance.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ dependency_type: 'requires' }),
    );
  });
});

describe('unlink_intentions tool', () => {
  it('exports the tool', () => {
    const def = intentions.definitions.find((d) => d.name === 'unlink_intentions');
    expect(def).toBeDefined();
  });

  it('removes a dependency by id', async () => {
    const client = {
      axiosInstance: {
        delete: jest.fn().mockResolvedValue({ data: { ok: true } }),
      },
    };
    const handler = intentions.handlers.unlink_intentions;

    const result = await handler(
      { dependency_id: DEP_ID, plan_id: PLAN_ID, reason: 'stale' },
      client,
    );

    expect(client.axiosInstance.delete).toHaveBeenCalledWith(`/plans/${PLAN_ID}/dependencies/${DEP_ID}`);
    const body = parseResponse(result);
    expect(body.removed).toBe(true);
    expect(body.reason).toBe('stale');
  });

  it('returns not_found cleanly when missing', async () => {
    const client = {
      axiosInstance: {
        delete: jest.fn().mockRejectedValue({ response: { status: 404, data: { error: 'gone' } } }),
      },
    };
    const handler = intentions.handlers.unlink_intentions;

    const result = await handler(
      { dependency_id: 'missing', plan_id: PLAN_ID },
      client,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/i);
  });
});
