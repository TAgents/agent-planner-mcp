/**
 * OAuth state store for the hosted MCP authorization server.
 *
 * Holds registered clients (Dynamic Client Registration), short-lived
 * authorization codes, and issued access/refresh tokens. Each token maps back
 * to the user's AgentPlanner credential (AP JWT) so /mcp can act as that user.
 *
 * MVP: in-memory Maps. KNOWN LIMITATION — a process restart invalidates all
 * issued tokens and registered clients, so connected clients must re-auth.
 * The interface is deliberately small so this can be swapped for Redis/Postgres
 * before heavy multi-user load (see the OAuth plan).
 */
const crypto = require('crypto');

const rid = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

class OAuthStore {
  constructor({ codeTtlMs = 5 * 60 * 1000, accessTtlMs = 60 * 60 * 1000 } = {}) {
    this.codeTtlMs = codeTtlMs;
    this.accessTtlMs = accessTtlMs;
    this.clients = new Map();       // client_id → OAuthClientInformationFull
    this.codes = new Map();         // code → { clientId, codeChallenge, redirectUri, scopes, ap, expiresAt }
    this.accessTokens = new Map();  // access_token → { clientId, scopes, ap, expiresAt }
    this.refreshTokens = new Map(); // refresh_token → { clientId, scopes, ap }
  }

  // ── Clients (DCR) ────────────────────────────────────────────────────────
  getClient(clientId) {
    return this.clients.get(clientId);
  }

  saveClient(client) {
    this.clients.set(client.client_id, client);
    return client;
  }

  // ── Authorization codes ──────────────────────────────────────────────────
  // `ap` is { accessToken, refreshToken, userId } — the AgentPlanner credential
  // captured during consent.
  createCode({ clientId, codeChallenge, redirectUri, scopes, ap }) {
    const code = rid();
    this.codes.set(code, {
      clientId, codeChallenge, redirectUri, scopes, ap,
      expiresAt: Date.now() + this.codeTtlMs,
    });
    return code;
  }

  // One-time: consume returns the record and deletes it.
  consumeCode(code) {
    const rec = this.codes.get(code);
    if (!rec) return null;
    this.codes.delete(code);
    if (rec.expiresAt < Date.now()) return null;
    return rec;
  }

  // ── Tokens ────────────────────────────────────────────────────────────────
  issueTokens({ clientId, scopes, ap }) {
    const access_token = rid();
    const refresh_token = rid();
    const expiresAt = Date.now() + this.accessTtlMs;
    this.accessTokens.set(access_token, { clientId, scopes, ap, expiresAt });
    this.refreshTokens.set(refresh_token, { clientId, scopes, ap });
    return {
      access_token,
      token_type: 'Bearer',
      expires_in: Math.floor(this.accessTtlMs / 1000),
      refresh_token,
      scope: scopes.join(' ') || undefined,
    };
  }

  getAccessToken(token) {
    const rec = this.accessTokens.get(token);
    if (!rec) return null;
    if (rec.expiresAt < Date.now()) {
      this.accessTokens.delete(token);
      return null;
    }
    return rec;
  }

  consumeRefreshToken(token) {
    const rec = this.refreshTokens.get(token);
    if (!rec) return null;
    this.refreshTokens.delete(token); // rotate
    return rec;
  }

  revoke(token) {
    this.accessTokens.delete(token);
    this.refreshTokens.delete(token);
  }
}

module.exports = { OAuthStore, rid };
