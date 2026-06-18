/**
 * OAuthServerProvider for the hosted MCP authorization server.
 *
 * Plugs into the MCP SDK's mcpAuthRouter (discovery metadata, DCR, /authorize,
 * /token, /revoke, PKCE validation). Persistence is delegated to the backend
 * via BackendOAuthStore.
 *
 * Token model: the OAuth access_token is a short-lived (1h) AgentPlanner JWT
 * minted from the consenting user (validated statelessly on /mcp). The refresh
 * token is opaque, revocable, and bound to the client — backed by the backend's
 * oauth_refresh_tokens table. Revoking it kills the connection within the
 * access-token TTL. No AP credential is stored at rest.
 */
const { renderConsentPage } = require('./consent');

class ApOAuthProvider {
  constructor({ store }) {
    this._store = store;

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

  // Backend consume validates client/redirect/PKCE-bound code, mints + returns
  // the token set (short-lived access JWT + opaque, revocable refresh token).
  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri) {
    const tokens = await this._store.consumeCode(authorizationCode, {
      clientId: client.client_id,
      redirectUri,
    });
    if (!tokens || !tokens.access_token) {
      throw new Error('invalid_grant: authorization code is invalid or expired');
    }
    return tokens;
  }

  // Rotate the opaque refresh token (bound to client_id) for a fresh token set.
  async exchangeRefreshToken(client, refreshToken, _scopes) {
    const tokens = await this._store.refresh(refreshToken, client.client_id);
    if (!tokens || !tokens.access_token) {
      throw new Error('invalid_grant: refresh token is invalid or expired');
    }
    return tokens;
  }

  // RFC 7009 revocation — revoke the (opaque) refresh token, killing the
  // connection. Enables /oauth/revoke so connectors can disconnect.
  async revokeToken(_client, request) {
    if (request?.token) await this._store.revoke(request.token);
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
