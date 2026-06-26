const { handlers } = require('../src/tools/bdi/beliefs');

// Regression: task_context historically required `task_id`, while every other
// tool and the skill docs use `node_id`. Calling it with `node_id` silently
// forwarded `node_id=undefined` to the API → generic 500 "Failed to assemble
// context". It must accept both names and reject neither-supplied clearly.
function fakeClient() {
  const get = jest.fn().mockResolvedValue({ data: { task: { id: 'n-1' } } });
  return { get, client: { axiosInstance: { get } } };
}

const NODE = '11111111-1111-1111-1111-111111111111';

describe('task_context — node_id / task_id parameter', () => {
  it('accepts node_id (canonical) and forwards it as node_id', async () => {
    const { get, client } = fakeClient();
    await handlers.task_context({ node_id: NODE, depth: 2 }, client);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toContain(`node_id=${NODE}`);
    expect(get.mock.calls[0][0]).not.toContain('node_id=undefined');
  });

  it('still accepts task_id as a back-compat alias', async () => {
    const { get, client } = fakeClient();
    await handlers.task_context({ task_id: NODE }, client);
    expect(get.mock.calls[0][0]).toContain(`node_id=${NODE}`);
  });

  it('returns a clear error (not a forwarded undefined) when neither is supplied', async () => {
    const { get, client } = fakeClient();
    const res = await handlers.task_context({ depth: 2 }, client);
    expect(get).not.toHaveBeenCalled();
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/node_id/i);
  });
});
