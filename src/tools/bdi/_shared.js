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

/**
 * True when an error means the backend has no /v1 surface (pre-consolidation
 * self-hosted API). Express returns a default 404 with no structured body for
 * unmatched routes, whereas v1 handlers always return JSON with an `error`
 * field — so a bare 404 means "route missing", not "resource missing".
 */
function isV1Unavailable(err) {
  if (err.response?.status !== 404) return false;
  const body = err.response.data;
  return !(body && typeof body === 'object' && body.error);
}

module.exports = { asOf, formatResponse, errorResponse, safeArray, isV1Unavailable };
