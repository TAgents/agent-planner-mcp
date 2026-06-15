/**
 * OAuth authorization-server unit tests: store, provider, consent handler.
 * Covers the security-critical paths — one-time codes, PKCE challenge lookup,
 * client/redirect validation, token→AP-credential mapping, refresh rotation.
 */
jest.mock('axios');
const axios = require('axios');

const { OAuthStore } = require('../src/oauth/store');
const { ApOAuthProvider } = require('../src/oauth/provider');
const { makeConsentHandler } = require('../src/oauth/consent');

function resMock() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
}

const AP = { accessToken: 'ap-jwt-xyz', refreshToken: 'ap-refresh', userId: 'user-1' };

describe('OAuthStore', () => {
  it('issues one-time authorization codes that expire', () => {
    const store = new OAuthStore({ codeTtlMs: 50 });
    const code = store.createCode({ clientId: 'c1', codeChallenge: 'ch', redirectUri: 'https://x/cb', scopes: [], ap: AP });
    const rec = store.consumeCode(code);
    expect(rec.clientId).toBe('c1');
    // second consume returns null (one-time)
    expect(store.consumeCode(code)).toBeNull();
  });

  it('rejects an expired code', () => {
    const store = new OAuthStore({ codeTtlMs: -1 }); // already expired
    const code = store.createCode({ clientId: 'c1', codeChallenge: 'ch', redirectUri: 'r', scopes: [], ap: AP });
    expect(store.consumeCode(code)).toBeNull();
  });

  it('issues and verifies access tokens, and expires them', () => {
    const store = new OAuthStore({ accessTtlMs: 60000 });
    const tokens = store.issueTokens({ clientId: 'c1', scopes: ['agentplanner'], ap: AP });
    expect(tokens.token_type).toBe('Bearer');
    expect(store.getAccessToken(tokens.access_token).ap.accessToken).toBe('ap-jwt-xyz');

    const expired = new OAuthStore({ accessTtlMs: -1 });
    const t2 = expired.issueTokens({ clientId: 'c1', scopes: [], ap: AP });
    expect(expired.getAccessToken(t2.access_token)).toBeNull();
  });

  it('rotates refresh tokens (single use)', () => {
    const store = new OAuthStore();
    const { refresh_token } = store.issueTokens({ clientId: 'c1', scopes: [], ap: AP });
    expect(store.consumeRefreshToken(refresh_token).clientId).toBe('c1');
    expect(store.consumeRefreshToken(refresh_token)).toBeNull();
  });
});

describe('ApOAuthProvider — DCR', () => {
  it('registers a public client without a secret', async () => {
    const provider = new ApOAuthProvider({ store: new OAuthStore() });
    const c = await provider.clientsStore.registerClient({ token_endpoint_auth_method: 'none', redirect_uris: ['https://claude.ai/cb'] });
    expect(c.client_id).toBeTruthy();
    expect(c.client_secret).toBeUndefined();
  });

  it('registers a confidential client with a secret', async () => {
    const provider = new ApOAuthProvider({ store: new OAuthStore() });
    const c = await provider.clientsStore.registerClient({ token_endpoint_auth_method: 'client_secret_basic', redirect_uris: ['https://x/cb'] });
    expect(c.client_secret).toBeTruthy();
  });
});

describe('ApOAuthProvider — code/token exchange', () => {
  let store, provider, client;
  beforeEach(async () => {
    store = new OAuthStore();
    provider = new ApOAuthProvider({ store });
    client = await provider.clientsStore.registerClient({ token_endpoint_auth_method: 'none', redirect_uris: ['https://claude.ai/cb'] });
  });

  it('returns the stored PKCE challenge for a code', async () => {
    const code = store.createCode({ clientId: client.client_id, codeChallenge: 'CHAL', redirectUri: 'https://claude.ai/cb', scopes: [], ap: AP });
    expect(await provider.challengeForAuthorizationCode(client, code)).toBe('CHAL');
  });

  it('exchanges a code for tokens bound to the AP credential, one time only', async () => {
    const code = store.createCode({ clientId: client.client_id, codeChallenge: 'CHAL', redirectUri: 'https://claude.ai/cb', scopes: ['agentplanner'], ap: AP });
    const tokens = await provider.exchangeAuthorizationCode(client, code, 'verifier', 'https://claude.ai/cb');
    expect(tokens.access_token).toBeTruthy();
    expect(store.getAccessToken(tokens.access_token).ap.accessToken).toBe('ap-jwt-xyz');
    // code is consumed
    await expect(provider.exchangeAuthorizationCode(client, code)).rejects.toThrow(/invalid_grant/);
  });

  it('rejects a redirect_uri mismatch at exchange', async () => {
    const code = store.createCode({ clientId: client.client_id, codeChallenge: 'CHAL', redirectUri: 'https://claude.ai/cb', scopes: [], ap: AP });
    await expect(provider.exchangeAuthorizationCode(client, code, 'v', 'https://evil/cb')).rejects.toThrow(/redirect_uri/);
  });

  it('rejects a code minted for a different client', async () => {
    const code = store.createCode({ clientId: 'other-client', codeChallenge: 'CHAL', redirectUri: 'https://claude.ai/cb', scopes: [], ap: AP });
    await expect(provider.challengeForAuthorizationCode(client, code)).rejects.toThrow(/invalid_grant/);
  });

  it('verifyAccessToken exposes apToken via extra; rejects unknown tokens', async () => {
    const code = store.createCode({ clientId: client.client_id, codeChallenge: 'C', redirectUri: 'https://claude.ai/cb', scopes: ['agentplanner'], ap: AP });
    const tokens = await provider.exchangeAuthorizationCode(client, code, 'v', 'https://claude.ai/cb');
    const info = await provider.verifyAccessToken(tokens.access_token);
    expect(info.extra.apToken).toBe('ap-jwt-xyz');
    expect(info.clientId).toBe(client.client_id);
    await expect(provider.verifyAccessToken('nope')).rejects.toThrow(/invalid_token/);
  });

  it('renders an HTML consent page from authorize()', async () => {
    const res = resMock();
    await provider.authorize(client, { redirectUri: 'https://claude.ai/cb', codeChallenge: 'C', state: 's', scopes: ['agentplanner'] }, res);
    expect(res.set).toHaveBeenCalledWith('Content-Type', 'text/html');
    const html = res.send.mock.calls[0][0];
    expect(html).toMatch(/Connect AgentPlanner/);
    expect(html).toContain(client.client_id);
  });
});

describe('consent handler', () => {
  let store, client, handler;
  beforeEach(async () => {
    store = new OAuthStore();
    const provider = new ApOAuthProvider({ store });
    client = await provider.clientsStore.registerClient({ token_endpoint_auth_method: 'none', redirect_uris: ['https://claude.ai/cb'] });
    handler = makeConsentHandler({ store, apiUrl: 'http://api.test' });
    axios.post.mockReset();
  });

  function reqWith(body) {
    return { body: { client_id: client.client_id, redirect_uri: 'https://claude.ai/cb', code_challenge: 'C', state: 'st', scope: 'agentplanner', ...body } };
  }

  it('authenticates via AP /auth/login and redirects with a code', async () => {
    axios.post.mockResolvedValue({ data: { user: { id: 'user-1' }, session: { access_token: 'ap-jwt-xyz', refresh_token: 'r' } } });
    const res = resMock();
    await handler(reqWith({ email: 'a@b.co', password: 'pw' }), res);

    expect(axios.post).toHaveBeenCalledWith('http://api.test/auth/login', { email: 'a@b.co', password: 'pw' }, expect.any(Object));
    const target = res.redirect.mock.calls[0][1];
    expect(target).toMatch(/^https:\/\/claude\.ai\/cb\?code=.+&state=st$/);
    // the issued code is bound to the AP credential
    const code = new URL(target).searchParams.get('code');
    expect(store.consumeCode(code).ap.accessToken).toBe('ap-jwt-xyz');
  });

  it('re-renders the login page on bad credentials (no code issued)', async () => {
    axios.post.mockRejectedValue({ response: { status: 401 } });
    const res = resMock();
    await handler(reqWith({ email: 'a@b.co', password: 'wrong' }), res);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.send.mock.calls[0][0]).toMatch(/Invalid email or password/);
  });

  it('rejects an unregistered client', async () => {
    const res = resMock();
    await handler({ body: { client_id: 'ghost', redirect_uri: 'https://claude.ai/cb' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('rejects a redirect_uri the client did not register', async () => {
    const res = resMock();
    await handler(reqWith({ redirect_uri: 'https://evil/cb', email: 'a@b.co', password: 'pw' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(axios.post).not.toHaveBeenCalled();
  });
});
