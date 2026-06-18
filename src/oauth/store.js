/**
 * OAuth state store — thin HTTP client over the AgentPlanner backend's
 * secret-guarded /internal/oauth endpoints. The MCP server has no database of
 * its own; DCR clients and one-time PKCE codes live in the backend's Postgres.
 *
 * There is no token storage: the OAuth access_token is the user's AP JWT, so a
 * restart never drops authenticated connections.
 */
const axios = require('axios');

// Map a backend (camelCase) client row → the SDK's OAuthClientInformationFull
// (snake_case) shape that mcpAuthRouter / the provider expect.
function toSdkClient(row) {
  if (!row) return undefined;
  return {
    client_id: row.clientId,
    ...(row.clientSecret ? { client_secret: row.clientSecret, client_secret_expires_at: 0 } : {}),
    client_name: row.clientName || undefined,
    redirect_uris: row.redirectUris || [],
    grant_types: row.grantTypes || [],
    response_types: row.responseTypes || [],
    scope: row.scope || undefined,
    token_endpoint_auth_method: row.tokenEndpointAuthMethod || 'client_secret_basic',
    client_id_issued_at: row.clientIdIssuedAt ? Math.floor(new Date(row.clientIdIssuedAt).getTime() / 1000) : undefined,
  };
}

class BackendOAuthStore {
  constructor({ apiUrl, internalSecret }) {
    this.base = `${(apiUrl || 'http://localhost:3000').replace(/\/$/, '')}/internal/oauth`;
    this.http = axios.create({
      timeout: 10000,
      headers: { 'X-Internal-Token': internalSecret || '' },
    });
  }

  async getClient(clientId) {
    try {
      const { data } = await this.http.get(`${this.base}/clients/${encodeURIComponent(clientId)}`);
      return toSdkClient(data);
    } catch (err) {
      if (err.response?.status === 404) return undefined;
      throw err;
    }
  }

  // SDK passes the client minus client_id (snake_case). Backend mints id/secret.
  async registerClient(client) {
    const { data } = await this.http.post(`${this.base}/clients`, client);
    return toSdkClient(data);
  }

  // Stores the code bound to the authenticated user (no AP credential at rest).
  async createCode({ clientId, codeChallenge, redirectUri, scopes, userId }) {
    const { data } = await this.http.post(`${this.base}/codes`, {
      client_id: clientId,
      code_challenge: codeChallenge,
      redirect_uri: redirectUri,
      scopes: scopes || [],
      user_id: userId || null,
    });
    return data.code;
  }

  // Peek (no consume) for the PKCE challenge lookup.
  async getCode(code) {
    try {
      const { data } = await this.http.get(`${this.base}/codes/${encodeURIComponent(code)}`);
      return { clientId: data.client_id, codeChallenge: data.code_challenge, redirectUri: data.redirect_uri };
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  // One-time consume → backend validates client/redirect, mints + returns the
  // OAuth token set (access JWT + opaque refresh). Null if the code is invalid.
  async consumeCode(code, { clientId, redirectUri } = {}) {
    try {
      const { data } = await this.http.post(`${this.base}/codes/${encodeURIComponent(code)}/consume`, {
        client_id: clientId,
        redirect_uri: redirectUri,
      });
      return data; // { access_token, token_type, expires_in, refresh_token, scope }
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 400) return null;
      throw err;
    }
  }

  // Rotate a refresh token → new token set (bound to client_id).
  async refresh(refreshToken, clientId) {
    try {
      const { data } = await this.http.post(`${this.base}/refresh`, {
        refresh_token: refreshToken,
        client_id: clientId,
      });
      return data;
    } catch (err) {
      if (err.response?.status === 400) return null;
      throw err;
    }
  }

  // Revoke a refresh token (RFC 7009) — kills the connection.
  async revoke(token) {
    await this.http.post(`${this.base}/revoke`, { token });
  }
}

module.exports = { BackendOAuthStore, toSdkClient };
