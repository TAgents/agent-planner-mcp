/**
 * BDI workspaces tool tests — covers list_workspaces, create_workspace,
 * list_blueprints, fork_blueprint, save_as_blueprint.
 */

const workspaces = require('../src/tools/bdi/workspaces');

const ORG_ID = 'org-uuid';
const WS_ID = 'ws-uuid';
const BP_ID = 'bp-uuid';
const PLAN_ID = 'plan-uuid';
const FORKED_PLAN_ID = 'forked-plan-uuid';

function makeApiClient(overrides = {}) {
  return {
    workspaces: {
      list: jest.fn().mockResolvedValue({ workspaces: [{ id: WS_ID, title: 'Default', isDefault: true }] }),
      create: jest.fn().mockResolvedValue({ id: WS_ID, organizationId: ORG_ID, title: 'New WS', slug: 'new-ws' }),
      ...overrides.workspaces,
    },
    blueprints: {
      list: jest.fn().mockResolvedValue({ blueprints: [{ id: BP_ID, scope: 'plan', title: 'Source' }] }),
      fork: jest.fn().mockResolvedValue({
        id: FORKED_PLAN_ID,
        title: 'Forked Plan',
        forkedFromBlueprintId: BP_ID,
      }),
      saveFromPlan: jest.fn().mockResolvedValue({
        id: BP_ID,
        scope: 'plan',
        visibility: 'private',
        payload: { nodes: [{ key: 'n0' }, { key: 'n1' }, { key: 'n2' }], dependencies: [{ source_key: 'n1', target_key: 'n2' }] },
      }),
      delete: jest.fn().mockResolvedValue(''),
      ...overrides.blueprints,
    },
  };
}

function parse(response) {
  if (response.isError) return { isError: true, text: response.content[0].text };
  return JSON.parse(response.content[0].text);
}

describe('list_workspaces', () => {
  it('requires organization_id and forwards filter', async () => {
    const api = makeApiClient();
    const res = await workspaces.handlers.list_workspaces(
      { organization_id: ORG_ID, include_archived: true },
      api,
    );
    const parsed = parse(res);
    expect(api.workspaces.list).toHaveBeenCalledWith({ organizationId: ORG_ID, includeArchived: true });
    expect(parsed.workspaces).toHaveLength(1);
    expect(parsed.workspaces[0].id).toBe(WS_ID);
    expect(parsed.as_of).toBeDefined();
  });

  it('returns upstream_unavailable on API failure', async () => {
    const api = makeApiClient({ workspaces: { list: jest.fn().mockRejectedValue(new Error('boom')) } });
    const res = await workspaces.handlers.list_workspaces({ organization_id: ORG_ID }, api);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/list_workspaces failed/);
  });
});

describe('create_workspace', () => {
  it('passes title + organization_id and returns new workspace', async () => {
    const api = makeApiClient();
    const res = await workspaces.handlers.create_workspace(
      { organization_id: ORG_ID, title: 'New WS' },
      api,
    );
    const parsed = parse(res);
    expect(api.workspaces.create).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: ORG_ID,
      title: 'New WS',
    }));
    expect(parsed.workspace.id).toBe(WS_ID);
  });

  it('surfaces upstream error message', async () => {
    const api = makeApiClient({ workspaces: { create: jest.fn().mockRejectedValue({ response: { data: { error: 'slug taken' } } }) } });
    const res = await workspaces.handlers.create_workspace({ organization_id: ORG_ID, title: 'x' }, api);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/slug taken/);
  });
});

describe('list_blueprints', () => {
  it('forwards scope and ownership filters', async () => {
    const api = makeApiClient();
    await workspaces.handlers.list_blueprints({ scope: 'plan', owner_only: true }, api);
    expect(api.blueprints.list).toHaveBeenCalledWith({
      scope: 'plan',
      visibility: undefined,
      ownerOnly: true,
    });
  });
});

describe('fork_blueprint', () => {
  it('requires both blueprint_id and workspace_id and returns new plan_id', async () => {
    const api = makeApiClient();
    const res = await workspaces.handlers.fork_blueprint(
      { blueprint_id: BP_ID, workspace_id: WS_ID, title: 'Forked Plan' },
      api,
    );
    const parsed = parse(res);
    expect(api.blueprints.fork).toHaveBeenCalledWith(BP_ID, { workspace_id: WS_ID, title: 'Forked Plan' });
    expect(parsed.plan_id).toBe(FORKED_PLAN_ID);
    expect(parsed.forked_from_blueprint_id).toBe(BP_ID);
    expect(parsed.next_step).toMatch(/draft/);
  });

  it('surfaces upstream error on fork failure', async () => {
    const api = makeApiClient({ blueprints: { fork: jest.fn().mockRejectedValue({ response: { data: { error: 'wrong scope' } } }) } });
    const res = await workspaces.handlers.fork_blueprint(
      { blueprint_id: BP_ID, workspace_id: WS_ID },
      api,
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/wrong scope/);
  });
});

describe('save_as_blueprint', () => {
  it('reports node + dependency counts from payload', async () => {
    const api = makeApiClient();
    const res = await workspaces.handlers.save_as_blueprint({ plan_id: PLAN_ID }, api);
    const parsed = parse(res);
    expect(api.blueprints.saveFromPlan).toHaveBeenCalledWith(PLAN_ID, expect.any(Object));
    expect(parsed.blueprint_id).toBe(BP_ID);
    expect(parsed.node_count).toBe(3);
    expect(parsed.dependency_count).toBe(1);
    expect(parsed.next_step).toMatch(/private/);
  });

  it('hints at sharing when published', async () => {
    const api = makeApiClient({
      blueprints: {
        saveFromPlan: jest.fn().mockResolvedValue({
          id: BP_ID,
          scope: 'plan',
          visibility: 'public',
          payload: { nodes: [], dependencies: [] },
        }),
      },
    });
    const res = await workspaces.handlers.save_as_blueprint({ plan_id: PLAN_ID, visibility: 'public' }, api);
    const parsed = parse(res);
    expect(parsed.next_step).toMatch(/published|fork/);
  });
});

describe('delete_blueprint', () => {
  it('deletes a blueprint by id', async () => {
    const api = makeApiClient();
    const res = await workspaces.handlers.delete_blueprint({ blueprint_id: BP_ID }, api);
    const parsed = parse(res);
    expect(api.blueprints.delete).toHaveBeenCalledWith(BP_ID);
    expect(parsed.deleted).toBe(true);
    expect(parsed.blueprint_id).toBe(BP_ID);
  });

  it('requires blueprint_id', async () => {
    const api = makeApiClient();
    const res = await workspaces.handlers.delete_blueprint({}, api);
    expect(res.isError).toBe(true);
    expect(api.blueprints.delete).not.toHaveBeenCalled();
  });

  it('maps a 403 to a clear owner-only error', async () => {
    const err = new Error('Request failed with status code 403');
    err.response = { status: 403, data: { error: 'Only the owner can delete a blueprint' } };
    const api = makeApiClient({ blueprints: { delete: jest.fn().mockRejectedValue(err) } });
    const res = await workspaces.handlers.delete_blueprint({ blueprint_id: BP_ID }, api);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/owner/i);
  });
});

describe('definitions', () => {
  it('exports 6 tools wired into the bdi index', () => {
    const { bdiToolDefinitions } = require('../src/tools/bdi');
    const names = bdiToolDefinitions.map((t) => t.name);
    for (const name of ['list_workspaces', 'create_workspace', 'list_blueprints', 'fork_blueprint', 'save_as_blueprint', 'delete_blueprint']) {
      expect(names).toContain(name);
    }
  });
});
