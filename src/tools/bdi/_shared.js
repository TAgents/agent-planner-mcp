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
 * Extract the most actionable message from an axios error. The AP backend's
 * validation errors carry a field-level `message` (e.g. "urgency: must be one
 * of ...; options.0: Unrecognized key") plus a `details` array — far more
 * useful than the generic top-line `error` ("Validation failed"), which is all
 * most handlers surfaced. Prefer message → error → err.message.
 */
function apiErrorMessage(err) {
  const data = err?.response?.data;
  if (data) {
    if (data.message && data.message !== data.error) return data.message;
    if (typeof data.error === 'string') return data.error;
  }
  return err?.message || 'unknown error';
}

/**
 * The web app origin (where /app/plans/:id lives), for building shareable plan
 * links agents can post (e.g. to Slack). Derived from API_URL — the web app
 * shares the origin and the API sits under /api behind nginx — with an explicit
 * AGENTPLANNER_WEB_URL override for local/self-hosted setups where the UI is on
 * a different host/port.
 */
function webOrigin() {
  if (process.env.AGENTPLANNER_WEB_URL) return process.env.AGENTPLANNER_WEB_URL.replace(/\/+$/, '');
  const api = process.env.API_URL || 'https://agentplanner.io/api';
  return api.replace(/\/+$/, '').replace(/\/api$/, '') || 'https://agentplanner.io';
}

/** Shareable web link to a plan (set the plan's visibility to unlisted/public for a rich unfurl). */
function planUrl(planId) {
  return planId ? `${webOrigin()}/app/plans/${planId}` : null;
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

module.exports = { asOf, formatResponse, errorResponse, safeArray, apiErrorMessage, isV1Unavailable, webOrigin, planUrl };
