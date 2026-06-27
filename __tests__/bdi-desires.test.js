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

  it('passes success_criteria as a plain array (preferred backend shape)', async () => {
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
        successCriteria: ['First customer signed', 'NPS > 30'],
      }),
    );
  });
});

describe('create_goal tool — top-level goal creation', () => {
  function makeClient(createResult = { id: NEW_GOAL_ID, title: 'Ship v2', status: 'active' }) {
    return { goals: { create: jest.fn().mockResolvedValue(createResult) } };
  }

  it('exports the tool, requiring only title (no parent)', () => {
    const tool = desires.definitions.find((d) => d.name === 'create_goal');
    expect(tool).toBeDefined();
    expect(tool.inputSchema.required).toEqual(['title']);
    expect(tool.inputSchema.properties.parent_goal_id).toBeUndefined();
  });

  it('creates a top-level goal (active, no parentGoalId) by default', async () => {
    const apiClient = makeClient();
    const result = await desires.handlers.create_goal({ title: 'Ship v2' }, apiClient);

    const payload = apiClient.goals.create.mock.calls[0][0];
    expect(payload).toEqual(expect.objectContaining({ title: 'Ship v2', type: 'outcome', status: 'active' }));
    expect(payload).not.toHaveProperty('parentGoalId');
    const body = parseResponse(result);
    expect(body.goal_id).toBe(NEW_GOAL_ID);
    expect(body.is_draft).toBe(false);
  });

  it('accepts status=draft when proposing without direction', async () => {
    const apiClient = makeClient({ id: NEW_GOAL_ID, title: 'Maybe', status: 'draft' });
    const result = await desires.handlers.create_goal({ title: 'Maybe', status: 'draft' }, apiClient);
    expect(apiClient.goals.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
    expect(parseResponse(result).is_draft).toBe(true);
  });

  it('forwards success_criteria as a plain array and forwards workspace_id', async () => {
    const apiClient = makeClient();
    await desires.handlers.create_goal(
      { title: 'G', success_criteria: ['Launched'], workspace_id: 'ws-1' },
      apiClient,
    );
    expect(apiClient.goals.create).toHaveBeenCalledWith(
      expect.objectContaining({ successCriteria: ['Launched'], workspaceId: 'ws-1' }),
    );
  });

  it('surfaces upstream create failures', async () => {
    const apiClient = { goals: { create: jest.fn().mockRejectedValue({ response: { data: { error: 'db down' } } }) } };
    const result = await desires.handlers.create_goal({ title: 'G' }, apiClient);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/db down/);
  });
});

describe('update_goal tool — committed vocabulary (ring-3 alignment)', () => {
  function parse(resp) { return JSON.parse(resp.content[0].text); }

  it('maps committed:true onto the backend commitment write', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'g1' });
    const apiClient = { goals: { update } };
    await desires.handlers.update_goal(
      { goal_id: 'g1', changes: { committed: true } },
      apiClient,
    );
    expect(update).toHaveBeenCalledWith('g1', expect.objectContaining({ goalType: 'intention' }));
  });

  it('maps committed:false onto an aspirational write', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'g1' });
    const apiClient = { goals: { update } };
    await desires.handlers.update_goal(
      { goal_id: 'g1', changes: { committed: false } },
      apiClient,
    );
    expect(update).toHaveBeenCalledWith('g1', expect.objectContaining({ goalType: 'desire' }));
  });

  it('no longer exposes the desire/intention goal_type input', () => {
    const def = desires.definitions.find((d) => d.name === 'update_goal');
    const changeProps = def.inputSchema.properties.changes.properties;
    expect(changeProps.goal_type).toBeUndefined();
    expect(changeProps.promote_to_intention).toBeUndefined();
    expect(changeProps.committed).toEqual({ type: 'boolean' });
  });

  it('camelCases success_criteria and sends the array shape (backend schema is strict)', async () => {
    // Regression: the handler sent snake_case success_criteria, which the strict
    // backend schema rejected with a 400 — every success_criteria write failed
    // while same-named fields (description) succeeded. The array is now sent
    // unwrapped (the backend's preferred shape); the old { criteria: [...] }
    // wrap made the backend mis-count and skip per-criterion knowledge grounding.
    const update = jest.fn().mockResolvedValue({ id: 'g1' });
    const apiClient = { goals: { update, get: jest.fn().mockResolvedValue({ id: 'g1' }) } };
    await desires.handlers.update_goal(
      { goal_id: 'g1', changes: { success_criteria: ['Ship it', 'Reach 50 users'] } },
      apiClient,
    );
    const sent = update.mock.calls[0][1];
    expect(sent).not.toHaveProperty('success_criteria');
    expect(sent.successCriteria).toEqual(['Ship it', 'Reach 50 users']);
  });

  it('passes a pre-shaped object success_criteria through unchanged under the camelCase key', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'g1' });
    const apiClient = { goals: { update, get: jest.fn().mockResolvedValue({ id: 'g1' }) } };
    await desires.handlers.update_goal(
      { goal_id: 'g1', changes: { success_criteria: { criteria: ['x'] } } },
      apiClient,
    );
    expect(update.mock.calls[0][1].successCriteria).toEqual({ criteria: ['x'] });
  });

  it('surfaces the backend field-level error on a failed direct write', async () => {
    const err = new Error('Request failed with status code 400');
    err.response = { data: { error: 'Validation failed', message: 'successCriteria: Invalid' } };
    const apiClient = { goals: { update: jest.fn().mockRejectedValue(err), get: jest.fn().mockResolvedValue(null) } };
    const res = await desires.handlers.update_goal(
      { goal_id: 'g1', changes: { title: 'X' } },
      apiClient,
    );
    const body = JSON.parse(res.content[0].text);
    expect(body.failures[0].error).toMatch(/successCriteria: Invalid/);
  });
});
