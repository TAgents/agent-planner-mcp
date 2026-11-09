/**
 * Consent + login surface for the OAuth authorization step.
 *
 * provider.authorize() renders this page (GET /authorize handled by the SDK).
 * The form POSTs to /oauth/consent, which authenticates against the existing
 * AgentPlanner /auth/login endpoint and, on success, mints a one-time
 * authorization code bound to the user's AP credential, then redirects back to
 * the client's redirect_uri with code + state.
 */
const axios = require('axios');

const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function renderConsentPage(params, { clientName = 'an application', error = null } = {}) {
  const hidden = (name) => `<input type="hidden" name="${name}" value="${esc(params[name])}">`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect AgentPlanner</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0f1115;color:#e7e9ee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  .card{background:#171a21;border:1px solid #262b36;border-radius:14px;padding:32px;width:360px;box-shadow:0 10px 40px rgba(0,0,0,.4)}
  h1{font-size:18px;margin:0 0 4px}p{color:#9aa3b2;font-size:13px;margin:0 0 20px;line-height:1.5}
  label{display:block;font-size:12px;color:#9aa3b2;margin:14px 0 6px}
  input[type=email],input[type=password]{width:100%;box-sizing:border-box;padding:10px 12px;background:#0f1115;border:1px solid #2b3140;border-radius:8px;color:#e7e9ee;font-size:14px}
  button{margin-top:22px;width:100%;padding:11px;background:#e0a96d;color:#1a1205;border:0;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer}
  .err{background:#3a1d1d;border:1px solid #6b2b2b;color:#f3b6b6;padding:9px 12px;border-radius:8px;font-size:12px;margin-bottom:14px}
  .grant{color:#cfd5e1;font-size:12px;margin-top:16px}.grant b{color:#e7e9ee}
</style></head><body>
<div class="card">
  <h1>Connect AgentPlanner</h1>
  <p><b>${esc(clientName)}</b> wants to access your AgentPlanner plans, goals, and knowledge on your behalf.</p>
  ${error ? `<div class="err">${esc(error)}</div>` : ''}
  <form method="POST" action="/oauth/consent">
    ${hidden('client_id')}${hidden('redirect_uri')}${hidden('code_challenge')}${hidden('code_challenge_method')}${hidden('state')}${hidden('scope')}${hidden('resource')}
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="username" required>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Sign in &amp; authorize</button>
  </form>
  <div class="grant">Signing in authorizes this connection only. You can disconnect <b>${esc(clientName)}</b> anytime from its connector settings, or from AgentPlanner → Settings → Connections.</div>
</div></body></html>`;
}

// Builds the POST /oauth/consent handler. `apiUrl` is the AgentPlanner REST base.
function makeConsentHandler({ store, apiUrl, infoOnly = false }) {
  return async (req, res) => {
    const b = (infoOnly ? req.query : req.body) || {};
    const json = infoOnly || !!req.is?.('application/json');
    res.set('Cache-Control', 'no-store');
    const params = {
      client_id: b.client_id,
      redirect_uri: b.redirect_uri,
      code_challenge: b.code_challenge,
      code_challenge_method: b.code_challenge_method,
      state: b.state,
      scope: b.scope,
      resource: b.resource,
    };

    let client;
    const fail = (status, message) => json
      ? res.status(status).json({ error: message })
      : res.status(status).send(renderConsentPage(params, { clientName: client?.client_name, error: message }));
    try {
      if (typeof b.client_id !== 'string' || typeof b.redirect_uri !== 'string' ||
          typeof b.code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(b.code_challenge) ||
          b.code_challenge_method !== 'S256' ||
          (b.scope && (typeof b.scope !== 'string' || b.scope.split(' ').filter(Boolean).some(s => s !== 'agentplanner'))) ||
          (b.state !== undefined && typeof b.state !== 'string')) {
        return fail(400, 'Invalid authorization request. Please reconnect from your connector settings.');
      }
      client = await store.getClient(b.client_id);
      if (!client) {
        return fail(400, 'Unknown client. Please reconnect from your connector settings.');
      }
      // Defense-in-depth: redirect_uri must be one the client registered.
      if (!Array.isArray(client.redirect_uris) || !client.redirect_uris.includes(b.redirect_uri)) {
        return fail(400, 'Invalid redirect_uri.');
      }
      if (infoOnly) return res.json({ client_name: client.client_name || 'an application', redirect_uri: b.redirect_uri });

      let userId;
      try {
        if (json) {
          const authorization = req.headers?.authorization;
          if (typeof authorization !== 'string' || !/^Bearer \S+$/i.test(authorization)) {
            return fail(401, 'Please sign in to AgentPlanner again.');
          }
          const resp = await axios.get(`${apiUrl}/auth/profile`, { headers: { Authorization: authorization }, timeout: 10000 });
          userId = resp.data?.id;
        } else {
          const resp = await axios.post(`${apiUrl}/auth/login`, { email: b.email, password: b.password }, { timeout: 10000 });
          if (resp.data?.session?.access_token) userId = resp.data?.user?.id;
        }
      } catch (err) {
        const status = err.response?.status;
        if (status === 401) return fail(json ? 401 : 200, json ? 'Please sign in to AgentPlanner again.' : 'Invalid email or password.');
        if (status === 429) return fail(429, 'Too many sign-in attempts. Please wait a minute and try again.');
        return fail(503, 'Sign-in is temporarily unavailable. Please try again.');
      }

      if (!userId) {
        return fail(503, 'Sign-in is temporarily unavailable. Please try again.');
      }

      const code = await store.createCode({
        clientId: b.client_id,
        codeChallenge: b.code_challenge,
        redirectUri: b.redirect_uri,
        scopes: (b.scope || '').split(' ').filter(Boolean),
        userId,
      });

      const url = new URL(b.redirect_uri);
      url.searchParams.set('code', code);
      if (b.state) url.searchParams.set('state', b.state);
      if (json) return res.json({ redirect_url: url.toString() });
      return res.redirect(302, url.toString());
    } catch {
      // Express 4 does not forward rejected async handlers. Do not log axios
      // errors here: their config may contain credentials or internal secrets.
      return fail(503, 'Authorization is temporarily unavailable. Please try again.');
    }
  };
}

module.exports = { renderConsentPage, makeConsentHandler, esc };
