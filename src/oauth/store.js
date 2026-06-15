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

  // `ap` = { accessToken, refreshToken, userId } captured at consent.
  async createCode({ clientId, codeChallenge, redirectUri, scopes, ap }) {
    const { data } = await this.http.post(`${this.base}/codes`, {
      client_id: clientId,
      code_challenge: codeChallenge,
      redirect_uri: redirectUri,
      scopes: scopes || [],
      user_id: ap?.userId || null,
      ap_access_token: ap?.accessToken,
      ap_refresh_token: ap?.refreshToken || null,
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

  // One-time consume → returns the bound AP credential.
  async consumeCode(code) {
    try {
      const { data } = await this.http.post(`${this.base}/codes/${encodeURIComponent(code)}/consume`);
      return {
        clientId: data.client_id,
        codeChallenge: data.code_challenge,
        redirectUri: data.redirect_uri,
        scopes: data.scopes || [],
        ap: { accessToken: data.ap_access_token, refreshToken: data.ap_refresh_token, userId: data.user_id },
      };
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }
}

module.exports = { BackendOAuthStore, toSdkClient };
