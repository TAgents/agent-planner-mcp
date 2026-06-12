/**
 * Phase 4 of the API v1 consolidation: tool handlers call the server-side
 * /v1 facades first (one call replaces the client-side fan-out) and fall
 * back to the legacy fan-out only when the backend has no /v1 surface.
 */

const beliefs = require('../src/tools/bdi/beliefs');
const intentions = require('../src/tools/bdi/intentions');

const GOAL_ID = 'goal-uuid';
const PLAN_ID = 'plan-uuid';
const TASK_ID = 'task-uuid';

function parseResponse(response) {
  return JSON.parse(response.content[0].text);
}

/** Axios-shaped error with a structured JSON body. */
function httpError(status, data) {
  const err = new Error(`Request failed with status code ${status}`);
  err.response = { status, data };
  return err;
}

/** Bare 404 (HTML body) — what an old backend returns for unknown routes. */
function routeMissError() {
  const err = new Error('Request failed with status code 404');
  err.response = { status: 404, data: '<!DOCTYPE html>Cannot GET /v1/...' };
  return err;
}

describe('goal_state — v1 facade first', () => {
  it('returns the facade payload in one call', async () => {
    const facadePayload = { as_of: 'now', goal: { id: GOAL_ID }, quality: { score: 0.8 } };
    const client = { v1: { goalState: jest.fn().mockResolvedValue(facadePayload) } };

    const result = await beliefs.handlers.goal_state({ goal_id: GOAL_ID }, client);

    expect(client.v1.goalState).toHaveBeenCalledWith(GOAL_ID);
    expect(parseResponse(result)).toEqual(facadePayload);
  });

  it('maps a structured 404 to not_found without falling back', async () => {
    const client = {
      v1: { goalState: jest.fn().mockRejectedValue(httpError(404, { error: 'Goal not found' })) },
      goals: { get: jest.fn() },
    };

    const result = await beliefs.handlers.goal_state({ goal_id: GOAL_ID }, client);

    expect(result.isError).toBe(true);
    expect(client.goals.get).not.toHaveBeenCalled();
  });

  it('falls back to the legacy fan-out on a bare 404 (old backend)', async () => {
    const client = {
      v1: { goalState: jest.fn().mockRejectedValue(routeMissError()) },
      goals: {
        get: jest.fn().mockResolvedValue({ id: GOAL_ID, title: 'G', links: [] }),
        getQuality: jest.fn().mockResolvedValue({}),
        getProgress: jest.fn().mockResolvedValue({}),
        getKnowledgeGaps: jest.fn().mockResolvedValue({ gaps: [] }),
        getPath: jest.fn().mockResolvedValue({ tasks: [] }),
      },
    };

    const result = await beliefs.handlers.goal_state({ goal_id: GOAL_ID }, client);

    expect(client.goals.get).toHaveBeenCalledWith(GOAL_ID);
    expect(parseResponse(result).goal.id).toBe(GOAL_ID);
  });
});

describe('recall_knowledge — v1 facade first', () => {
  it('sends the full query through the facade', async () => {
    const facadePayload = { as_of: 'now', available: true, facts: [{ fact: 'x' }], entities: [], episodes: [] };
    const client = { v1: { knowledgeSearch: jest.fn().mockResolvedValue(facadePayload) } };

    const result = await beliefs.handlers.recall_knowledge(
      { query: 'deploy', max_results: 5, include_contradictions: true },
      client,
    );

    expect(client.v1.knowledgeSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'deploy', max_results: 5, include_contradictions: true }),
    );
    expect(parseResponse(result).facts).toHaveLength(1);
  });
});

describe('update_task — v1 facade first', () => {
  it('applies the atomic update through the facade', async () => {
    const facadePayload = {
      as_of: 'now',
      task_id: TASK_ID,
      plan_id: PLAN_ID,
      applied: { status_changed: true, log_added: true, claim_released: true, learning_recorded: false },
      failures: [],
    };
    const client = { v1: { updateTask: jest.fn().mockResolvedValue(facadePayload) } };

    const result = await intentions.handlers.update_task(
      { task_id: TASK_ID, status: 'completed', log_message: 'done' },
      client,
    );

    expect(client.v1.updateTask).toHaveBeenCalledWith(
      TASK_ID,
      expect.objectContaining({ status: 'completed', log_message: 'done' }),
    );
    expect(parseResponse(result).applied.status_changed).toBe(true);
  });

  it('prefers the work-session endpoint when session_id is given', async () => {
    const client = {
      axiosInstance: { post: jest.fn().mockResolvedValue({ data: { session_id: 's1', claim_released: true } }) },
      v1: { updateTask: jest.fn() },
    };

    await intentions.handlers.update_task(
      { task_id: TASK_ID, status: 'completed', session_id: 's1' },
      client,
    );

    expect(client.axiosInstance.post).toHaveBeenCalledWith(
      '/agent/work-sessions/s1/complete',
      expect.any(Object),
    );
    expect(client.v1.updateTask).not.toHaveBeenCalled();
  });
});

describe('share_plan — v1 facade first', () => {
  it('applies visibility + collaborators in one call', async () => {
    const facadePayload = { as_of: 'now', plan_id: PLAN_ID, applied_changes: ['visibility:public'], failures: [] };
    const client = { v1: { sharePlan: jest.fn().mockResolvedValue(facadePayload) } };

    const result = await intentions.handlers.share_plan(
      { plan_id: PLAN_ID, visibility: 'public' },
      client,
    );

    expect(client.v1.sharePlan).toHaveBeenCalledWith(
      PLAN_ID,
      expect.objectContaining({ visibility: 'public' }),
    );
    expect(parseResponse(result).applied_changes).toContain('visibility:public');
  });
});

describe('briefing / claim_next_task — v1 path first', () => {
  it('briefing uses GET /v1/briefing', async () => {
    const payload = { as_of: 'now', goal_health: { summary: {}, goals: [] } };
    const client = { v1: { briefing: jest.fn().mockResolvedValue(payload) } };

    const result = await beliefs.handlers.briefing({ scope: 'mission_control' }, client);

    expect(client.v1.briefing).toHaveBeenCalled();
    expect(parseResponse(result).goal_health).toBeDefined();
  });

  it('claim_next_task uses POST /v1/tasks/claim-next', async () => {
    const payload = { as_of: 'now', session_id: 's1', task: { id: TASK_ID } };
    const client = { v1: { claimNext: jest.fn().mockResolvedValue(payload) } };

    const result = await intentions.handlers.claim_next_task({ scope: { plan_id: PLAN_ID } }, client);

    expect(client.v1.claimNext).toHaveBeenCalledWith(
      expect.objectContaining({ plan_id: PLAN_ID }),
    );
    expect(parseResponse(result).session_id).toBe('s1');
  });
});

describe('api-client exposes the v1 module', () => {
  it('default export and per-session factory both have v1 facades', () => {
    const apiClient = require('../src/api-client');
    const expected = ['goalState', 'planAnalysis', 'knowledgeSearch', 'updateTask', 'sharePlan', 'briefing', 'claimNext'];
    for (const fn of expected) {
      expect(typeof apiClient.v1[fn]).toBe('function');
    }
    const session = apiClient.createApiClient('test-token');
    for (const fn of expected) {
      expect(typeof session.v1[fn]).toBe('function');
    }
  });
});
