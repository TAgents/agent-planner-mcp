/**
 * BDI-aligned MCP tool surface (v0.9.0).
 *
 * Tools grouped by Belief / Desire / Intention namespaces. Each tool answers
 * one whole agentic question, replaces multiple legacy calls, and emits an
 * `as_of` ISO 8601 timestamp on success.
 *
 * See ../../../docs/MCP_REDESIGN_PLAN.md for full specs and rationale.
 */

const beliefs = require('./beliefs');
const intentions = require('./intentions');

const definitions = [
  ...beliefs.definitions,
  ...intentions.definitions,
];

const handlers = {
  ...beliefs.handlers,
  ...intentions.handlers,
};

const names = new Set(definitions.map((t) => t.name));

/**
 * Dispatch a BDI tool call.
 * @returns formatted MCP response, or undefined if the name isn't a BDI tool.
 */
async function bdiToolHandler(name, args, apiClient) {
  if (!names.has(name)) return undefined;
  const handler = handlers[name];
  return handler(args || {}, apiClient);
}

module.exports = {
  bdiToolDefinitions: definitions,
  bdiToolHandler,
  bdiToolNames: names,
};
