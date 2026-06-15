/**
 * OAuth unit tests (backend-backed store).
 *
 * The MCP OAuth store is now a thin HTTP client over the backend's
 * /internal/oauth endpoints, and access tokens are AP JWTs (no local token
 * store). Tests mock axios: axios.create() → the store's http client;
 * top-level axios.post → AP /auth/login (consent) and /auth/refresh (provider).
 */
jest.mock('axios');
const axios = require('axios');

const { BackendOAuthStore, toSdkClient } = require('../src/oauth/store');
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

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = (payload) => `h.${b64(payload)}.sig`;

describe('BackendOAuthStore (HTTP client over /internal/oauth)', () => {
  let http;
  beforeEach(() => {
    http = { get: jest.fn(), post: jest.fn() };
    axios.create.mockReturnValue(http);
  });

  it('maps a backend client row to the SDK snake_case shape', () => {
    const sdk = toSdkClient({ clientId: 'c1', clientName: 'Claude', redirectUris: ['https://x/cb'], tokenEndpointAuthMethod: 'none' });
    expect(sdk.client_id).toBe('c1');
    expect(sdk.redirect_uris).toEqual(['https://x/cb']);
    expect(sdk.client_secret).toBeUndefined();
  });

  it('getClient returns undefined on 404', async () => {
    const store = new BackendOAuthStore({ apiUrl: 'http://api.test', internalSecret: 's' });
    http.get.mockRejectedValue({ response: { status: 404 } });
    expect(await store.getClient('nope')).toBeUndefined();
  });

  it('createCode posts the AP credential and returns the code', async () => {
    const store = new BackendOAuthStore({ apiUrl: 'http://api.test', internalSecret: 's' });
    http.post.mockResolvedValue({ data: { code: 'CODE123' } });
    const code = await store.createCode({
      clientId: 'c1', codeChallenge: 'ch', redirectUri: 'https://x/cb', scopes: ['agentplanner'],
      ap: { accessToken: 'ap-jwt', refreshToken: 'ap-ref', userId: 'u1' },
    });
    expect(code).toBe('CODE123');
    expect(http.post).toHaveBeenCalledWith('http://api.test/internal/oauth/codes', expect.objectContaining({
      client_id: 'c1', ap_access_token: 'ap-jwt', ap_refresh_token: 'ap-ref', user_id: 'u1',
    }));
  });

  it('sends the internal secret header', () => {
    new BackendOAuthStore({ apiUrl: 'http://api.test', internalSecret: 'sekret' });
    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({ 'X-Internal-Token': 'sekret' }),
    }));
  });

  it('consumeCode returns null on 404 (already used/expired)', async () => {
    const store = new BackendOAuthStore({ apiUrl: 'http://api.test', internalSecret: 's' });
    http.post.mockRejectedValue({ response: { status: 404 } });
    expect(await store.consumeCode('gone')).toBeNull();
  });
});

describe('ApOAuthProvider', () => {
  const client = { client_id: 'c1', client_name: 'Claude', redirect_uris: ['https://claude.ai/cb'] };
  let store, provider;
  beforeEach(() => {
    store = { getClient: jest.fn(), registerClient: jest.fn(), getCode: jest.fn(), consumeCode: jest.fn() };
    provider = new ApOAuthProvider({ store, apiUrl: 'http://api.test' });
  });

  it('challengeForAuthorizationCode returns the stored challenge (client must match)', async () => {
    store.getCode.mockResolvedValue({ clientId: 'c1', codeChallenge: 'CHAL', redirectUri: 'https://claude.ai/cb' });
    expect(await provider.challengeForAuthorizationCode(client, 'code')).toBe('CHAL');
    store.getCode.mockResolvedValue({ clientId: 'other', codeChallenge: 'X' });
    await expect(provider.challengeForAuthorizationCode(client, 'code')).rejects.toThrow(/invalid_grant/);
  });

  it('exchangeAuthorizationCode returns the AP JWT as the access token', async () => {
    store.consumeCode.mockResolvedValue({ clientId: 'c1', redirectUri: 'https://claude.ai/cb', scopes: ['agentplanner'], ap: { accessToken: 'ap-jwt-xyz', refreshToken: 'ap-ref' } });
    const tokens = await provider.exchangeAuthorizationCode(client, 'code', 'verifier', 'https://claude.ai/cb');
    expect(tokens.access_token).toBe('ap-jwt-xyz');
    expect(tokens.refresh_token).toBe('ap-ref');
    expect(tokens.token_type).toBe('Bearer');
  });

  it('exchangeAuthorizationCode rejects a redirect_uri mismatch', async () => {
    store.consumeCode.mockResolvedValue({ clientId: 'c1', redirectUri: 'https://claude.ai/cb', scopes: [], ap: {} });
    await expect(provider.exchangeAuthorizationCode(client, 'code', 'v', 'https://evil/cb')).rejects.toThrow(/redirect_uri/);
  });

  it('exchangeAuthorizationCode rejects an invalid/used code', async () => {
    store.consumeCode.mockResolvedValue(null);
    await expect(provider.exchangeAuthorizationCode(client, 'code')).rejects.toThrow(/invalid_grant/);
  });

  it('exchangeRefreshToken refreshes via AP /auth/refresh', async () => {
    axios.post.mockResolvedValue({ data: { session: { access_token: 'new-jwt', refresh_token: 'new-ref' } } });
    const tokens = await provider.exchangeRefreshToken(client, 'old-ref');
    expect(axios.post).toHaveBeenCalledWith('http://api.test/auth/refresh', { refresh_token: 'old-ref' }, expect.any(Object));
    expect(tokens.access_token).toBe('new-jwt');
  });

  it('exchangeRefreshToken throws on a rejected refresh', async () => {
    axios.post.mockRejectedValue({ response: { status: 401 } });
    await expect(provider.exchangeRefreshToken(client, 'bad')).rejects.toThrow(/invalid_grant/);
  });

  it('verifyAccessToken decodes a valid AP JWT and rejects garbage/expired', async () => {
    const ok = fakeJwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
    const info = await provider.verifyAccessToken(ok);
    expect(info.extra.apToken).toBe(ok);
    expect(info.extra.userId).toBe('u1');
    await expect(provider.verifyAccessToken('not-a-jwt')).rejects.toThrow(/invalid_token/);
    const expired = fakeJwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 10 });
    await expect(provider.verifyAccessToken(expired)).rejects.toThrow(/expired/);
  });

  it('authorize renders the consent page', async () => {
    const res = resMock();
    await provider.authorize(client, { redirectUri: 'https://claude.ai/cb', codeChallenge: 'C', state: 's', scopes: ['agentplanner'] }, res);
    expect(res.send.mock.calls[0][0]).toMatch(/Connect AgentPlanner/);
  });
});

describe('consent handler', () => {
  const client = { client_id: 'c1', client_name: 'Claude', redirect_uris: ['https://claude.ai/cb'] };
  let store, handler;
  beforeEach(() => {
    store = { getClient: jest.fn().mockResolvedValue(client), createCode: jest.fn().mockResolvedValue('CODE123') };
    handler = makeConsentHandler({ store, apiUrl: 'http://api.test' });
    axios.post.mockReset();
  });

  function reqWith(body) {
    return { body: { client_id: 'c1', redirect_uri: 'https://claude.ai/cb', code_challenge: 'C', state: 'st', scope: 'agentplanner', ...body } };
  }

  it('logs in via AP, persists a code, and redirects with code+state', async () => {
    axios.post.mockResolvedValue({ data: { user: { id: 'u1' }, session: { access_token: 'ap-jwt', refresh_token: 'r' } } });
    const res = resMock();
    await handler(reqWith({ email: 'a@b.co', password: 'pw' }), res);

    expect(axios.post).toHaveBeenCalledWith('http://api.test/auth/login', { email: 'a@b.co', password: 'pw' }, expect.any(Object));
    expect(store.createCode).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'c1', ap: expect.objectContaining({ accessToken: 'ap-jwt', userId: 'u1' }),
    }));
    expect(res.redirect.mock.calls[0][1]).toBe('https://claude.ai/cb?code=CODE123&state=st');
  });

  it('re-renders on bad credentials without issuing a code', async () => {
    axios.post.mockRejectedValue({ response: { status: 401 } });
    const res = resMock();
    await handler(reqWith({ email: 'a@b.co', password: 'wrong' }), res);
    expect(store.createCode).not.toHaveBeenCalled();
    expect(res.send.mock.calls[0][0]).toMatch(/Invalid email or password/);
  });

  it('rejects a redirect_uri the client did not register', async () => {
    const res = resMock();
    await handler(reqWith({ redirect_uri: 'https://evil/cb', email: 'a@b.co', password: 'pw' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('rejects an unknown client', async () => {
    store.getClient.mockResolvedValue(undefined);
    const res = resMock();
    await handler(reqWith({ email: 'a@b.co', password: 'pw' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
