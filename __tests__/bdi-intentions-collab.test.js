/**
 * BDI intentions collaboration tool tests (v1.0):
 *  - share_plan
 *  - invite_member
 *  - update_member_role
 *  - remove_member
 */

const intentions = require('../src/tools/bdi/intentions');

const PLAN_ID = 'plan-uuid';
const ORG_ID = 'org-uuid';
const USER_ID = 'user-uuid';
const MEMBERSHIP_ID = 'membership-uuid';

function parseResponse(response) {
  return JSON.parse(response.content[0].text);
}

describe('share_plan tool', () => {
  it('exports the tool', () => {
    const def = intentions.definitions.find((d) => d.name === 'share_plan');
    expect(def).toBeDefined();
  });

  it('changes visibility and adds collaborators', async () => {
    const client = {
      plans: {
        updateVisibility: jest.fn().mockResolvedValue({}),
      },
      axiosInstance: {
        post: jest.fn().mockResolvedValue({ data: {} }),
        delete: jest.fn(),
      },
    };
    const handler = intentions.handlers.share_plan;

    const result = await handler(
      {
        plan_id: PLAN_ID,
        visibility: 'unlisted',
        add_collaborators: [{ user_id: USER_ID, role: 'editor' }],
      },
      client,
    );

    expect(client.plans.updateVisibility).toHaveBeenCalledWith(PLAN_ID, { visibility: 'unlisted' });
    expect(client.axiosInstance.post).toHaveBeenCalledWith(
      `/plans/${PLAN_ID}/collaborators`,
      { user_id: USER_ID, role: 'editor' },
    );
    const body = parseResponse(result);
    expect(body.applied_changes).toEqual(expect.arrayContaining(['visibility:unlisted']));
  });

  it('removes collaborators by user_id', async () => {
    const client = {
      plans: { updateVisibility: jest.fn() },
      axiosInstance: {
        post: jest.fn(),
        delete: jest.fn().mockResolvedValue({ data: {} }),
      },
    };
    const handler = intentions.handlers.share_plan;

    await handler(
      { plan_id: PLAN_ID, remove_collaborators: [USER_ID] },
      client,
    );

    expect(client.axiosInstance.delete).toHaveBeenCalledWith(`/plans/${PLAN_ID}/collaborators/${USER_ID}`);
  });

  it('continues on partial failures and reports them', async () => {
    const client = {
      plans: { updateVisibility: jest.fn().mockResolvedValue({}) },
      axiosInstance: {
        post: jest.fn().mockRejectedValue({ response: { data: { error: 'already collaborator' } } }),
        delete: jest.fn(),
      },
    };
    const handler = intentions.handlers.share_plan;

    const result = await handler(
      {
        plan_id: PLAN_ID,
        visibility: 'public',
        add_collaborators: [{ user_id: USER_ID, role: 'viewer' }],
      },
      client,
    );

    const body = parseResponse(result);
    expect(body.applied_changes).toContain('visibility:public');
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].step).toMatch(USER_ID);
  });
});

describe('invite_member tool', () => {
  it('exports the tool', () => {
    const def = intentions.definitions.find((d) => d.name === 'invite_member');
    expect(def).toBeDefined();
  });

  it('invites by user_id', async () => {
    const client = {
      organizations: {
        addMember: jest.fn().mockResolvedValue({
          id: MEMBERSHIP_ID,
          role: 'member',
          user: { id: USER_ID, email: 'a@b.c', name: 'A' },
        }),
      },
    };
    const handler = intentions.handlers.invite_member;

    const result = await handler(
      { organization_id: ORG_ID, user_id: USER_ID },
      client,
    );

    expect(client.organizations.addMember).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ user_id: USER_ID, role: 'member' }),
    );
    const body = parseResponse(result);
    expect(body.member.membership_id).toBe(MEMBERSHIP_ID);
  });

  it('invites by email when user_id absent', async () => {
    const client = {
      organizations: {
        addMember: jest.fn().mockResolvedValue({ id: MEMBERSHIP_ID, role: 'admin', user: { email: 'x@y.z' } }),
      },
    };
    const handler = intentions.handlers.invite_member;

    await handler(
      { organization_id: ORG_ID, email: 'x@y.z', role: 'admin' },
      client,
    );

    expect(client.organizations.addMember).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ email: 'x@y.z', role: 'admin' }),
    );
  });

  it('rejects when neither user_id nor email provided', async () => {
    const client = { organizations: { addMember: jest.fn() } };
    const handler = intentions.handlers.invite_member;

    const result = await handler({ organization_id: ORG_ID }, client);

    expect(result.isError).toBe(true);
    expect(client.organizations.addMember).not.toHaveBeenCalled();
  });

  it('maps 404 to user_not_found', async () => {
    const client = {
      organizations: {
        addMember: jest.fn().mockRejectedValue({ response: { status: 404, data: { error: 'User not found' } } }),
      },
    };
    const handler = intentions.handlers.invite_member;

    const result = await handler(
      { organization_id: ORG_ID, email: 'missing@x.y' },
      client,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Failed to invite member/i);
  });
});

describe('update_member_role tool', () => {
  it('exports the tool', () => {
    const def = intentions.definitions.find((d) => d.name === 'update_member_role');
    expect(def).toBeDefined();
  });

  it('updates a role via PUT', async () => {
    const client = {
      axiosInstance: {
        put: jest.fn().mockResolvedValue({ data: { id: MEMBERSHIP_ID, role: 'admin' } }),
      },
    };
    const handler = intentions.handlers.update_member_role;

    await handler(
      { organization_id: ORG_ID, membership_id: MEMBERSHIP_ID, new_role: 'admin' },
      client,
    );

    expect(client.axiosInstance.put).toHaveBeenCalledWith(
      `/organizations/${ORG_ID}/members/${MEMBERSHIP_ID}/role`,
      { role: 'admin' },
    );
  });
});

describe('remove_member tool', () => {
  it('exports the tool', () => {
    const def = intentions.definitions.find((d) => d.name === 'remove_member');
    expect(def).toBeDefined();
  });

  it('removes a member', async () => {
    const client = {
      organizations: {
        removeMember: jest.fn().mockResolvedValue({}),
      },
    };
    const handler = intentions.handlers.remove_member;

    const result = await handler(
      { organization_id: ORG_ID, membership_id: MEMBERSHIP_ID, reason: 'left team' },
      client,
    );

    expect(client.organizations.removeMember).toHaveBeenCalledWith(ORG_ID, MEMBERSHIP_ID);
    const body = parseResponse(result);
    expect(body.removed).toBe(true);
    expect(body.reason).toBe('left team');
  });
});
