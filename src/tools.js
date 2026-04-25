/**
 * MCP Tools — v0.9.0 BDI-aligned surface.
 *
 * 15 tools across Belief / Desire / Intention / Utility namespaces. The legacy
 * 63-tool CRUD-shaped surface was removed in v0.9.0 — see ../docs/MIGRATION_v0.9.md
 * for the mapping from old tool names to new ones, and ../docs/MCP_REDESIGN_PLAN.md
 * for the design rationale.
 */

const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const defaultApiClient = require('./api-client');
const { bdiToolDefinitions, bdiToolHandler, bdiToolNames } = require('./tools/bdi');

/**
 * Wire BDI tools into an MCP server.
 * @param {Server} server - MCP server instance
 * @param {Object} [apiClientOverride] - Per-session API client (HTTP mode); falls back to default (stdio mode)
 */
function setupTools(server, apiClientOverride) {
  const apiClient = apiClientOverride || defaultApiClient;

  if (process.env.NODE_ENV === 'development') {
    console.error(`Setting up MCP tools (${bdiToolDefinitions.length} BDI tools)`);
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: bdiToolDefinitions };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (process.env.NODE_ENV === 'development') {
      console.error(`Calling tool: ${name}`);
    }

    if (!bdiToolNames.has(name)) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `Unknown tool: ${name}. v0.9.0 ships 15 BDI tools. Run get_started to see them, or check ../docs/MIGRATION_v0.9.md for the legacy → BDI mapping.`,
        }],
      };
    }

    try {
      return await bdiToolHandler(name, args, apiClient);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`Tool ${name} threw:`, err);
      }
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `Tool ${name} failed: ${err.message || String(err)}`,
        }],
      };
    }
  });
}

module.exports = { setupTools };
