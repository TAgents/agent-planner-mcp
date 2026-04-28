const beliefs = require('../src/tools/bdi/beliefs');
const intentions = require('../src/tools/bdi/intentions');

function parseResponse(response) {
  return JSON.parse(response.content[0].text);
}

describe('MCP agent-loop facade integration', () => {
  it('briefing uses /agent/briefing when available', async () => {
    const client = {
      axiosInstance: {
        get: jest.fn().mockResolvedValue({
          data: {
            as_of: '2026-04-28T00:00:00Z',
            goal_health: { summary: { total: 0 }, goals: [] },
            pending_decisions: [],
          },
        }),
      },
    };

    const result = await beliefs.handlers.briefing({ plan_id: 'plan-1' }, client);
    const body = parseResponse(result);

    expect(client.axiosInstance.get).toHaveBeenCalledWith('/agent/briefing', {
      params: expect.objectContaining({ plan_id: 'plan-1' }),
    });
    expect(body.goal_health.summary.total).toBe(0);
  });

  it('claim_next_task uses /agent/work-sessions when available', async () => {
    const client = {
      axiosInstance: {
        post: jest.fn().mockResolvedValue({
          data: {
            as_of: '2026-04-28T00:00:00Z',
            session_id: 'claim-1',
            task: { id: 'node-1' },
            claim: { id: 'claim-1' },
          },
        }),
      },
    };

    const result = await intentions.handlers.claim_next_task({
      scope: { plan_id: 'plan-1' },
      context_depth: 3,
    }, client);
    const body = parseResponse(result);

    expect(client.axiosInstance.post).toHaveBeenCalledWith('/agent/work-sessions', {
      plan_id: 'plan-1',
      goal_id: undefined,
      ttl_minutes: 30,
      fresh: false,
      dry_run: false,
      depth: 3,
      agent_id: 'mcp-agent',
    });
    expect(body.session_id).toBe('claim-1');
  });

  it('update_task uses session complete endpoint when session_id is supplied', async () => {
    const client = {
      axiosInstance: {
        post: jest.fn().mockResolvedValue({
          data: {
            as_of: '2026-04-28T00:00:00Z',
            session_id: 'claim-1',
            task: { id: 'node-1', status: 'completed' },
          },
        }),
      },
    };

    const result = await intentions.handlers.update_task({
      task_id: 'node-1',
      session_id: 'claim-1',
      status: 'completed',
      log_message: 'Done',
      add_learning: 'Reusable finding',
    }, client);
    const body = parseResponse(result);

    expect(client.axiosInstance.post).toHaveBeenCalledWith('/agent/work-sessions/claim-1/complete', {
      summary: 'Done',
      learning: { content: 'Reusable finding' },
      decision: undefined,
    });
    expect(body.task.status).toBe('completed');
  });

  it('form_intention uses agentLoop.createIntention when available', async () => {
    const client = {
      agentLoop: {
        createIntention: jest.fn().mockResolvedValue({
          as_of: '2026-04-28T00:00:00Z',
          plan: { id: 'plan-1', status: 'draft' },
          tree: [],
        }),
      },
      goals: { get: jest.fn() },
      plans: { createPlan: jest.fn() },
      nodes: { createNode: jest.fn() },
    };

    const result = await intentions.handlers.form_intention({
      goal_id: 'goal-1',
      title: 'Plan',
      rationale: 'Because',
      status: 'draft',
      tree: [],
    }, client);
    const body = parseResponse(result);

    expect(client.agentLoop.createIntention).toHaveBeenCalledWith(expect.objectContaining({
      goal_id: 'goal-1',
      title: 'Plan',
      status: 'draft',
    }));
    expect(client.plans.createPlan).not.toHaveBeenCalled();
    expect(body.plan_id).toBe('plan-1');
    expect(body.is_draft).toBe(true);
  });
});
