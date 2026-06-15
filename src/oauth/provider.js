/**
 * OAuthServerProvider implementation for the hosted MCP authorization server.
 *
 * Plugs into the MCP SDK's mcpAuthRouter (which serves discovery metadata,
 * Dynamic Client Registration, /authorize, /token, /revoke and performs PKCE
 * validation). We supply: the clients store, the authorize() consent redirect,
 * the PKCE challenge lookup, code/refresh exchange, and access-token verify.
 *
 * Identity: an issued access token is opaque and maps to the user's AP JWT
 * captured at consent (see consent.js + store.js).
 */
const { renderConsentPage } = require('./consent');

class ApOAuthProvider {
  constructor({ store }) {
    this._store = store;

    // OAuthRegisteredClientsStore — getClient + registerClient (DCR).
    this.clientsStore = {
      getClient: (clientId) => this._store.getClient(clientId),
      registerClient: (client) => {
        // The SDK passes the client minus client_id/client_id_issued_at.
        const { rid } = require('./store');
        const isPublic = client.token_endpoint_auth_method === 'none';
        const full = {
          ...client,
          client_id: rid(16),
          client_id_issued_at: Math.floor(Date.now() / 1000),
          ...(isPublic ? {} : { client_secret: rid(32), client_secret_expires_at: 0 }),
        };
        return this._store.saveClient(full);
      },
    };
  }

  // Render the consent/login page. The SDK's /authorize handler has already
  // validated redirect_uri against the registered client before calling us.
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

  // SDK validates code_verifier against this challenge (PKCE S256) at /token.
  async challengeForAuthorizationCode(client, authorizationCode) {
    const rec = this._store.codes.get(authorizationCode);
    if (!rec || rec.clientId !== client.client_id) {
      throw new Error('invalid_grant: unknown authorization code');
    }
    return rec.codeChallenge;
  }

  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri) {
    const rec = this._store.consumeCode(authorizationCode);
    if (!rec || rec.clientId !== client.client_id) {
      throw new Error('invalid_grant: authorization code is invalid or expired');
    }
    if (redirectUri && redirectUri !== rec.redirectUri) {
      throw new Error('invalid_grant: redirect_uri mismatch');
    }
    return this._store.issueTokens({ clientId: client.client_id, scopes: rec.scopes, ap: rec.ap });
  }

  async exchangeRefreshToken(client, refreshToken, scopes) {
    const rec = this._store.consumeRefreshToken(refreshToken);
    if (!rec || rec.clientId !== client.client_id) {
      throw new Error('invalid_grant: refresh token is invalid');
    }
    return this._store.issueTokens({
      clientId: client.client_id,
      scopes: scopes && scopes.length ? scopes : rec.scopes,
      ap: rec.ap,
    });
  }

  // Returns SDK AuthInfo. `extra.apToken` is the AP JWT the /mcp layer uses to
  // build the per-session API client for this user.
  async verifyAccessToken(token) {
    const rec = this._store.getAccessToken(token);
    if (!rec) {
      throw new Error('invalid_token');
    }
    return {
      token,
      clientId: rec.clientId,
      scopes: rec.scopes || [],
      expiresAt: Math.floor(rec.expiresAt / 1000),
      extra: { apToken: rec.ap.accessToken, userId: rec.ap.userId },
    };
  }

  async revokeToken(client, request) {
    if (request?.token) this._store.revoke(request.token);
  }
}

module.exports = { ApOAuthProvider };
