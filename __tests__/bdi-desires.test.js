/**
 * BDI desires tool tests — focuses on derive_subgoal (v1.0 creation surface).
 */

const desires = require('../src/tools/bdi/desires');

const PARENT_ID = 'parent-goal-uuid';
const NEW_GOAL_ID = 'new-goal-uuid';
const ORG_ID = 'org-uuid';

function makeApiClient(overrides = {}) {
  return {
    goals: {
      get: jest.fn().mockResolvedValue({
        id: PARENT_ID,
        title: 'Parent Goal',
        organization_id: ORG_ID,
      }),
      create: jest.fn().mockResolvedValue({
        id: NEW_GOAL_ID,
        title: 'Sub-goal',
        status: 'active',
      }),
      ...overrides.goals,
    },
  };
}

function parseResponse(response) {
  // Tool handlers return { content: [{ type: 'text', text: '...' }] }.
  // Body is JSON stringified inside the text field.
  return JSON.parse(response.content[0].text);
}

describe('derive_subgoal tool', () => {
  it('exports the tool in definitions', () => {
    const tool = desires.definitions.find((d) => d.name === 'derive_subgoal');
    expect(tool).toBeDefined();
    expect(tool.inputSchema.required).toEqual(
      expect.arrayContaining(['parent_goal_id', 'title', 'rationale']),
    );
  });

  it('creates a sub-goal with status=active by default', async () => {
    const apiClient = makeApiClient();
    const handler = desires.handlers.derive_subgoal;

    const result = await handler(
      { parent_goal_id: PARENT_ID, title: 'Sub', rationale: 'because' },
      apiClient,
    );

    expect(apiClient.goals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Sub',
        status: 'active',
        parentGoalId: PARENT_ID,
        organizationId: ORG_ID,
        type: 'outcome',
        description: 'because',
      }),
    );
    const body = parseResponse(result);
    expect(body.goal_id).toBe(NEW_GOAL_ID);
    expect(body.is_draft).toBe(false);
  });

  it('accepts status=draft for autonomous loops', async () => {
    const apiClient = makeApiClient({
      goals: {
        get: jest.fn().mockResolvedValue({ id: PARENT_ID, title: 'P', organization_id: ORG_ID }),
        create: jest.fn().mockResolvedValue({ id: NEW_GOAL_ID, title: 'Sub', status: 'draft' }),
      },
    });
    const handler = desires.handlers.derive_subgoal;

    const result = await handler(
      { parent_goal_id: PARENT_ID, title: 'Sub', rationale: 'autonomous proposal', status: 'draft' },
      apiClient,
    );

    expect(apiClient.goals.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' }),
    );
    const body = parseResponse(result);
    expect(body.is_draft).toBe(true);
    expect(body.next_step).toMatch(/draft.*pending queue/i);
  });

  it('composes description from rationale + optional description', async () => {
    const apiClient = makeApiClient();
    const handler = desires.handlers.derive_subgoal;

    await handler(
      {
        parent_goal_id: PARENT_ID,
        title: 'Sub',
        rationale: 'why this matters',
        description: 'extra context here',
      },
      apiClient,
    );

    expect(apiClient.goals.create).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'why this matters\n\nextra context here' }),
    );
  });

  it('rejects when parent goal not found', async () => {
    const apiClient = makeApiClient({
      goals: {
        get: jest.fn().mockRejectedValue(new Error('404')),
        create: jest.fn(),
      },
    });
    const handler = desires.handlers.derive_subgoal;

    const result = await handler(
      { parent_goal_id: 'missing', title: 'Sub', rationale: 'x' },
      apiClient,
    );

    expect(apiClient.goals.create).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Parent goal missing not found/);
  });

  it('surfaces upstream create failures', async () => {
    const apiClient = makeApiClient({
      goals: {
        get: jest.fn().mockResolvedValue({ id: PARENT_ID, title: 'P', organization_id: ORG_ID }),
        create: jest.fn().mockRejectedValue({ response: { data: { error: 'db down' } } }),
      },
    });
    const handler = desires.handlers.derive_subgoal;

    const result = await handler(
      { parent_goal_id: PARENT_ID, title: 'Sub', rationale: 'x' },
      apiClient,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/db down/);
  });

  it('passes success_criteria as wrapped object', async () => {
    const apiClient = makeApiClient();
    const handler = desires.handlers.derive_subgoal;

    await handler(
      {
        parent_goal_id: PARENT_ID,
        title: 'Sub',
        rationale: 'x',
        success_criteria: ['First customer signed', 'NPS > 30'],
      },
      apiClient,
    );

    expect(apiClient.goals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        successCriteria: { criteria: ['First customer signed', 'NPS > 30'] },
      }),
    );
  });
});
