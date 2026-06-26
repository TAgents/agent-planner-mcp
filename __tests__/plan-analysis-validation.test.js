const { handlers } = require('../src/tools/bdi/beliefs');

// The hosted MCP transport doesn't enforce `required`, so a missing `type`
// used to fall through every branch and return a silent `{results:{}}` with no
// `type` echoed and no error — indistinguishable from a real empty result.
// plan_analysis must validate its own args and explain empty flat-plan results.
function parse(res) {
  return JSON.parse(res.content[0].text);
}

const PLAN = '3c80ae9f-11f0-4c87-aa7b-33866c14dee5';

describe('plan_analysis — argument validation', () => {
  it('missing type → clear invalid_arg error, no API call', async () => {
    const get = jest.fn();
    const res = await handlers.plan_analysis({ plan_id: PLAN }, { axiosInstance: { get } });
    expect(get).not.toHaveBeenCalled();
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/type/i);
    expect(res.content[0].text).toMatch(/critical_path/);
  });

  it('unknown type → clear invalid_arg error', async () => {
    const get = jest.fn();
    const res = await handlers.plan_analysis({ plan_id: PLAN, type: 'nonsense' }, { axiosInstance: { get } });
    expect(get).not.toHaveBeenCalled();
    expect(res.isError).toBe(true);
  });

  it('missing plan_id → clear invalid_arg error', async () => {
    const res = await handlers.plan_analysis({ type: 'critical_path' }, { axiosInstance: { get: jest.fn() } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/plan_id/);
  });
});

describe('plan_analysis — flat-plan hint', () => {
  it('empty critical_path gets a note explaining the plan may be flat', async () => {
    const get = jest.fn().mockResolvedValue({ data: { path: [], total_weight: 0, nodes: [] } });
    const res = await handlers.plan_analysis({ plan_id: PLAN, type: 'critical_path' }, { axiosInstance: { get } });
    const body = parse(res);
    expect(body.type).toBe('critical_path');
    expect(body.note).toMatch(/flat|no.*edges/i);
  });

  it('a populated critical_path has NO flat-plan note', async () => {
    const get = jest.fn().mockResolvedValue({ data: { path: ['n1'], total_weight: 1, nodes: [{ id: 'n1' }] } });
    const res = await handlers.plan_analysis({ plan_id: PLAN, type: 'critical_path' }, { axiosInstance: { get } });
    const body = parse(res);
    expect(body.note).toBeUndefined();
  });
});

describe('search / recall_knowledge — query guard', () => {
  it('search with no query → invalid_arg, no API call', async () => {
    const get = jest.fn();
    const res = await handlers.search({ scope: 'global' }, { axiosInstance: { get } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/query/i);
    expect(get).not.toHaveBeenCalled();
  });

  it('search with whitespace-only query → invalid_arg', async () => {
    const res = await handlers.search({ query: '   ' }, { axiosInstance: { get: jest.fn() } });
    expect(res.isError).toBe(true);
  });

  it('recall_knowledge with no query → invalid_arg', async () => {
    const res = await handlers.recall_knowledge({}, { axiosInstance: { get: jest.fn() } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/query/i);
  });
});
