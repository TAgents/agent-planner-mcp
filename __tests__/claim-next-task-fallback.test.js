const intentions = require('../src/tools/bdi/intentions');

// claim_next_task has three layers (intentions.js:claimNextTaskHandler):
//   1. v1  : POST /v1/tasks/claim-next        (preferred)
//   2. facade: POST /agent/work-sessions      (same server handler)
//   3. legacy local fan-out                   (only if BOTH 1 and 2 throw)
//
// Layers 1/2 fail closed server-side. These tests pin the contract of layer 3
// — the degraded path that runs against an ancient self-hosted API — so it
// (a) calls the REAL /context/suggest endpoint, not the never-existed
// /plans/:id/suggest-next-tasks, and (b) fails closed instead of handing out a
// dependency-blind not_started task.

function parseResponse(response) {
  return JSON.parse(response.content[0].text);
}

// Build a fake apiClient whose v1 + work-sessions paths both fail, forcing the
// legacy fan-out. Callers supply the legacy-layer mocks.
function legacyOnlyClient({ getMyTasks, axiosGet, claimTask }) {
  return {
    // No `v1` property → skip layer 1 entirely.
    axiosInstance: {
      post: jest.fn().mockRejectedValue(new Error('work-sessions unavailable')),
      get: jest.fn(axiosGet),
    },
    users: { getMyTasks: jest.fn(getMyTasks) },
    nodes: { claimTask: jest.fn(claimTask) },
  };
}

describe('claim_next_task — primary path', () => {
  it('uses /v1/tasks/claim-next when apiClient.v1 is present and never touches the legacy fan-out', async () => {
    const client = {
      v1: {
        claimNext: jest.fn().mockResolvedValue({
          as_of: '2026-06-15T00:00:00Z',
          session_id: 'sess-1',
          task: { id: 'node-1' },
          claim: { id: 'claim-1' },
        }),
      },
      axiosInstance: { post: jest.fn(), get: jest.fn() },
      users: { getMyTasks: jest.fn() },
      nodes: { claimTask: jest.fn() },
    };

    const result = await intentions.handlers.claim_next_task(
      { scope: { plan_id: 'plan-1' }, context_depth: 3 },
      client,
    );
    const body = parseResponse(result);

    expect(client.v1.claimNext).toHaveBeenCalledWith(
      expect.objectContaining({ plan_id: 'plan-1', depth: 3, agent_id: 'mcp-agent' }),
    );
    expect(body.session_id).toBe('sess-1');
    // Server handler owns selection — no client-side fan-out.
    expect(client.axiosInstance.post).not.toHaveBeenCalled();
    expect(client.axiosInstance.get).not.toHaveBeenCalled();
    expect(client.nodes.claimTask).not.toHaveBeenCalled();
  });
});

describe('claim_next_task — legacy fan-out fails closed', () => {
  it('returns blocked_on_dep (and does NOT claim) when /context/suggest is reachable but empty while not_started work remains', async () => {
    const client = legacyOnlyClient({
      // resume step: no in-progress work; fail-closed gate: not_started exists
      getMyTasks: async () => ({ tasks: [{ id: 'blocked-1', status: 'not_started', plan_id: 'plan-1' }] }),
      axiosGet: async (url) => {
        if (url.startsWith('/context/suggest')) return { data: { suggestions: [], count: 0 } };
        throw new Error(`unexpected GET ${url}`);
      },
      claimTask: async () => { throw new Error('must not claim a blocked task'); },
    });

    const result = await intentions.handlers.claim_next_task(
      { scope: { plan_id: 'plan-1' } },
      client,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/blocked on incomplete dependencies/i);
    expect(client.nodes.claimTask).not.toHaveBeenCalled();
    // Hits the real endpoint, never the phantom one.
    const urls = client.axiosInstance.get.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.startsWith('/context/suggest'))).toBe(true);
    expect(urls.some((u) => u.includes('suggest-next-tasks'))).toBe(false);
  });

  it('claims the dependency-ready task returned by /context/suggest', async () => {
    const client = legacyOnlyClient({
      getMyTasks: async () => ({ tasks: [] }), // no in-progress to resume
      axiosGet: async (url) => {
        if (url.startsWith('/context/suggest')) {
          return { data: { suggestions: [{ id: 'ready-1', title: 'Implement', status: 'not_started', plan_id: 'plan-1', task_mode: 'implement' }] } };
        }
        if (url.startsWith('/context/progressive')) return { data: { task: { id: 'ready-1' } } };
        throw new Error(`unexpected GET ${url}`);
      },
      claimTask: async () => ({ claimed_at: '2026-06-15T00:00:00Z', expires_at: '2026-06-15T00:30:00Z' }),
    });

    const result = await intentions.handlers.claim_next_task(
      { scope: { plan_id: 'plan-1' } },
      client,
    );
    const body = parseResponse(result);

    expect(body.source).toBe('suggest_next_tasks');
    expect(client.nodes.claimTask).toHaveBeenCalledWith('plan-1', 'ready-1', 'mcp-agent', 30);
  });

  it('scopes resume to the requested plan (the discarded-filter bug)', async () => {
    const client = legacyOnlyClient({
      // getMyTasks returns cross-plan in-progress work; only plan-1 should win.
      getMyTasks: async () => ({
        tasks: [
          { id: 'other-plan-task', status: 'in_progress', plan_id: 'plan-OTHER' },
          { id: 'my-task', status: 'in_progress', plan_id: 'plan-1' },
        ],
      }),
      axiosGet: async (url) => {
        if (url.startsWith('/context/progressive')) return { data: { task: { id: 'my-task' } } };
        throw new Error(`unexpected GET ${url}`);
      },
      claimTask: async () => ({ claimed_at: '2026-06-15T00:00:00Z' }),
    });

    const result = await intentions.handlers.claim_next_task(
      { scope: { plan_id: 'plan-1' } },
      client,
    );
    const body = parseResponse(result);

    expect(body.source).toBe('resume_in_progress');
    expect(client.nodes.claimTask).toHaveBeenCalledWith('plan-1', 'my-task', 'mcp-agent', 30);
  });

  it('only blind-picks first not_started when /context/suggest is unreachable (truly ancient API)', async () => {
    const client = legacyOnlyClient({
      getMyTasks: async () => ({ tasks: [{ id: 'fallback-1', status: 'not_started', plan_id: 'plan-1' }] }),
      axiosGet: async (url) => {
        if (url.startsWith('/context/suggest')) throw new Error('404 no such route');
        if (url.startsWith('/context/progressive')) return { data: { task: { id: 'fallback-1' } } };
        throw new Error(`unexpected GET ${url}`);
      },
      claimTask: async () => ({ claimed_at: '2026-06-15T00:00:00Z' }),
    });

    const result = await intentions.handlers.claim_next_task(
      { scope: { plan_id: 'plan-1' } },
      client,
    );
    const body = parseResponse(result);

    expect(body.source).toBe('my_tasks_fallback');
    expect(client.nodes.claimTask).toHaveBeenCalledWith('plan-1', 'fallback-1', 'mcp-agent', 30);
  });
});
