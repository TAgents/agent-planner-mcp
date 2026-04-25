/**
 * Shared helpers for BDI tool implementations.
 */

function asOf() {
  return new Date().toISOString();
}

function formatResponse(data) {
  if (data && data.error) {
    return {
      isError: true,
      content: [{ type: 'text', text: data.error }],
    };
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function errorResponse(error_type, message, extra = {}) {
  return formatResponse({ error: message, error_type, ...extra });
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = { asOf, formatResponse, errorResponse, safeArray };
