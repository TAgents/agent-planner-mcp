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
 * True when a URL's host cannot be resolved by anyone outside this machine or
 * container network: a bare Docker service name ("api"), localhost, or a
 * private IP. A "shareable link" pointing at one of these is a dead link the
 * moment it leaves the process that generated it.
 */
function isNonRoutableHost(urlString) {
  let host;
  try {
    host = new URL(urlString).hostname;
  } catch {
    return true; // unparseable is not shareable
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return true;
  // A bare hostname with no dot is a container/service name on some private
  // network (this is how `http://api:3000` reached users).
  if (!host.includes('.')) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

/**
 * The web app origin (where /app/plans/:id lives), for building shareable plan
 * links agents can post (e.g. to Slack).
 *
 * AGENTPLANNER_WEB_URL is the only trusted source: if you set it, we use it
 * verbatim (localhost included — a developer sharing with themselves is fine).
 *
 * Otherwise we derive from API_URL, which works behind nginx where the web app
 * and the API share an origin. But that derivation is only valid when API_URL
 * is itself a public address. In Docker Compose the MCP talks to the API as
 * `http://api:3000`, and this function happily handed that straight back — so
 * form_intention returned "Shareable link: http://api:3000/app/plans/..." and
 * told the agent to paste it into Slack. Returns null rather than a link
 * nobody can open.
 */
function webOrigin() {
  if (process.env.AGENTPLANNER_WEB_URL) return process.env.AGENTPLANNER_WEB_URL.replace(/\/+$/, '');
  const api = process.env.API_URL;
  if (!api) return 'https://agentplanner.io';
  const origin = api.replace(/\/+$/, '').replace(/\/api$/, '');
  if (!origin || isNonRoutableHost(origin)) return null;
  return origin;
}

/**
 * Shareable web link to a plan (set the plan's visibility to unlisted/public
 * for a rich unfurl), or null when no publicly routable origin is known — in
 * which case callers must omit the link rather than emit a broken one.
 */
function planUrl(planId) {
  if (!planId) return null;
  const origin = webOrigin();
  return origin ? `${origin}/app/plans/${planId}` : null;
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

/**
 * The next_step line for a newly-active plan. Mentions a shareable link only
 * when one actually exists — otherwise it says how to enable links instead of
 * instructing the agent to paste a URL that resolves for nobody.
 */
function activePlanNextStep(planId) {
  const base = 'Plan active. Claim a task with claim_next_task({plan_id}) to begin work.';
  const url = planUrl(planId);
  return url
    ? `${base} Shareable link: ${url} (set visibility:'unlisted' for a rich Slack/social preview).`
    : `${base} No shareable link available — set AGENTPLANNER_WEB_URL to this deployment's public web address to include one.`;
}

module.exports = {
  asOf, formatResponse, errorResponse, safeArray, apiErrorMessage, isV1Unavailable,
  webOrigin, planUrl, activePlanNextStep, isNonRoutableHost,
};
