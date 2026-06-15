/**
 * OAuthServerProvider for the hosted MCP authorization server.
 *
 * Plugs into the MCP SDK's mcpAuthRouter (discovery metadata, DCR, /authorize,
 * /token, /revoke, PKCE validation). Persistence is delegated to the backend
 * via BackendOAuthStore.
 *
 * Token model: the OAuth access_token IS the user's AgentPlanner JWT (captured
 * at consent). So /mcp validates it statelessly, restarts don't log anyone out,
 * and there is no token table. Refresh maps to the AP /auth/refresh flow.
 */
const axios = require('axios');
const { renderConsentPage } = require('./consent');

// AP JWTs carry their own exp; this is the advertised OAuth lifetime hint.
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

class ApOAuthProvider {
  constructor({ store, apiUrl }) {
    this._store = store;
    this._apiUrl = (apiUrl || 'http://localhost:3000').replace(/\/$/, '');

    this.clientsStore = {
      getClient: (clientId) => this._store.getClient(clientId),
      registerClient: (client) => this._store.registerClient(client),
    };
  }

  // Render the consent/login page. mcpAuthRouter's /authorize handler has
  // already validated redirect_uri against the registered client.
  async authorize(client, params, res) {
    res.status(200).set('Content-Type', 'text/html').send(renderConsentPage({
      client_id: client.client_id,
      redirect_uri: params.redirectUri,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
      state: params.state,
      scope: (params.scopes || []).join(' '),
      resource: params.resource ? params.resource.toString() : '',
    }, { clientName: client.client_name }));
  }

  async challengeForAuthorizationCode(client, authorizationCode) {
    const rec = await this._store.getCode(authorizationCode);
    if (!rec || rec.clientId !== client.client_id) {
      throw new Error('invalid_grant: unknown authorization code');
    }
    return rec.codeChallenge;
  }

  // The issued access/refresh tokens ARE the user's AP JWT + refresh token.
  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri) {
    const rec = await this._store.consumeCode(authorizationCode);
    if (!rec || rec.clientId !== client.client_id) {
      throw new Error('invalid_grant: authorization code is invalid or expired');
    }
    if (redirectUri && redirectUri !== rec.redirectUri) {
      throw new Error('invalid_grant: redirect_uri mismatch');
    }
    return {
      access_token: rec.ap.accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: rec.ap.refreshToken || undefined,
      scope: (rec.scopes || []).join(' ') || undefined,
    };
  }

  // OAuth refresh → AP /auth/refresh (the OAuth refresh_token is the AP one).
  async exchangeRefreshToken(_client, refreshToken, scopes) {
    let session;
    try {
      const { data } = await axios.post(`${this._apiUrl}/auth/refresh`, { refresh_token: refreshToken }, { timeout: 10000 });
      session = data?.session || data;
    } catch (err) {
      throw new Error('invalid_grant: refresh token is invalid or expired');
    }
    if (!session?.access_token) throw new Error('invalid_grant: refresh failed');
    return {
      access_token: session.access_token,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: session.refresh_token || refreshToken,
      scope: (scopes || []).join(' ') || undefined,
    };
  }

  // Access tokens are AP JWTs; the MCP doesn't hold JWT_SECRET, so this is a
  // structural/expiry decode only — the AP API performs real validation when it
  // receives the JWT. /mcp itself uses the server-http auth middleware, not this.
  async verifyAccessToken(token) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('invalid_token');
    let payload;
    try {
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
      throw new Error('invalid_token');
    }
    if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error('invalid_token: expired');
    return {
      token,
      clientId: payload.client_id || 'agentplanner',
      scopes: ['agentplanner'],
      expiresAt: payload.exp,
      extra: { apToken: token, userId: payload.sub || payload.userId },
    };
  }
}

module.exports = { ApOAuthProvider };
