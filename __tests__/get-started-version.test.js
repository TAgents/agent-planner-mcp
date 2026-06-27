/**
 * get_started surfaces both the MCP version and the live backend API version,
 * and its tool-namespace map stays in sync with the actual tool set.
 */
const utility = require('../src/tools/bdi/utility');
const { version: MCP_VERSION } = require('../package.json');

function parse(resp) {
  return JSON.parse(resp.content[0].text);
}

describe('get_started — version reporting', () => {
  it('reports mcp_version and the fetched api_version', async () => {
    const apiClient = {
      system: { version: jest.fn().mockResolvedValue({ version: '1.2.3', commit: 'abc123' }) },
    };
    const body = parse(await utility.handlers.get_started({}, apiClient));
    expect(body.mcp_version).toBe(MCP_VERSION);
    expect(body.api_version).toBe('1.2.3');
    expect(body.api_build).toEqual({ commit: 'abc123', started_at: undefined });
    expect(body.api_url).toBeDefined();
  });

  it('degrades to api_version=unavailable when the backend cannot be reached', async () => {
    const apiClient = { system: { version: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) } };
    const body = parse(await utility.handlers.get_started({}, apiClient));
    expect(body.mcp_version).toBe(MCP_VERSION);
    expect(body.api_version).toBe('unavailable');
  });

  it('degrades cleanly when no apiClient is provided', async () => {
    const body = parse(await utility.handlers.get_started({}));
    expect(body.api_version).toBe('unavailable');
  });

  it('keeps the workspaces namespace map in sync (includes delete_blueprint)', async () => {
    const body = parse(await utility.handlers.get_started({}, {}));
    expect(body.tools_by_namespace.workspaces).toContain('delete_blueprint');
  });

  it('namespace map is derived — every BDI tool (except get_started) appears exactly once', async () => {
    const { bdiToolDefinitions } = require('../src/tools/bdi');
    const body = parse(await utility.handlers.get_started({}, {}));
    const mapped = Object.values(body.tools_by_namespace).flat().sort();
    const expected = bdiToolDefinitions
      .map((t) => t.name)
      .filter((n) => n !== 'get_started')
      .sort();
    expect(mapped).toEqual(expected); // no missing tools, no stale entries
  });
});
