/**
 * OAuth unit tests (opaque, revocable tokens).
 *
 * The access token is a short-lived AP JWT minted by the backend; the refresh
 * token is opaque + revocable. The MCP store is a thin HTTP client over the
 * backend /internal/oauth endpoints. Tests mock axios.
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
const TOKEN_SET = { access_token: fakeJwt({ sub: 'u1', exp: 9999999999 }), token_type: 'Bearer', expires_in: 3600, refresh_token: 'apop_r_xyz', scope: 'agentplanner' };

describe('BackendOAuthStore', () => {
  let http;
  beforeEach(() => {
    http = { get: jest.fn(), post: jest.fn() };
    axios.create.mockReturnValue(http);
  });

  it('toSdkClient maps backend row → SDK snake_case', () => {
    const sdk = toSdkClient({ clientId: 'c1', redirectUris: ['https://x/cb'], tokenEndpointAuthMethod: 'none' });
    expect(sdk.client_id).toBe('c1');
    expect(sdk.client_secret).toBeUndefined();
  });

  it('createCode posts user_id and no AP credentials', async () => {
    const store = new BackendOAuthStore({ apiUrl: 'http://api.test', internalSecret: 's' });
    http.post.mockResolvedValue({ data: { code: 'CODE1' } });
    const code = await store.createCode({ clientId: 'c1', codeChallenge: 'ch', redirectUri: 'https://x/cb', scopes: ['agentplanner'], userId: 'u1' });
    expect(code).toBe('CODE1');
    const body = http.post.mock.calls[0][1];
    expect(body).toEqual({ client_id: 'c1', code_challenge: 'ch', redirect_uri: 'https://x/cb', scopes: ['agentplanner'], user_id: 'u1' });
    expect(body.ap_access_token).toBeUndefined();
  });

  it('consumeCode returns the token set; 400/404 → null', async () => {
    const store = new BackendOAuthStore({ apiUrl: 'http://api.test', internalSecret: 's' });
    http.post.mockResolvedValue({ data: TOKEN_SET });
    const t = await store.consumeCode('code', { clientId: 'c1', redirectUri: 'https://x/cb' });
    expect(t.access_token).toBe(TOKEN_SET.access_token);
    expect(http.post).toHaveBeenCalledWith('http://api.test/internal/oauth/codes/code/consume', { client_id: 'c1', redirect_uri: 'https://x/cb' });
    http.post.mockRejectedValue({ response: { status: 400 } });
    expect(await store.consumeCode('bad', {})).toBeNull();
  });

  it('refresh posts the token + client_id and returns the new set', async () => {
    const store = new BackendOAuthStore({ apiUrl: 'http://api.test', internalSecret: 's' });
    http.post.mockResolvedValue({ data: TOKEN_SET });
    const t = await store.refresh('apop_r_old', 'c1');
    expect(http.post).toHaveBeenCalledWith('http://api.test/internal/oauth/refresh', { refresh_token: 'apop_r_old', client_id: 'c1' });
    expect(t.refresh_token).toBe('apop_r_xyz');
  });

  it('revoke posts the token', async () => {
    const store = new BackendOAuthStore({ apiUrl: 'http://api.test', internalSecret: 's' });
    http.post.mockResolvedValue({ data: { revoked: true } });
    await store.revoke('apop_r_xyz');
    expect(http.post).toHaveBeenCalledWith('http://api.test/internal/oauth/revoke', { token: 'apop_r_xyz' });
  });
});

describe('ApOAuthProvider', () => {
  const client = { client_id: 'c1', client_name: 'Claude', redirect_uris: ['https://claude.ai/cb'] };
  let store, provider;
  beforeEach(() => {
    store = { getClient: jest.fn(), registerClient: jest.fn(), getCode: jest.fn(), consumeCode: jest.fn(), refresh: jest.fn(), revoke: jest.fn() };
    provider = new ApOAuthProvider({ store });
  });

  it('challengeForAuthorizationCode returns the stored challenge (client must match)', async () => {
    store.getCode.mockResolvedValue({ clientId: 'c1', codeChallenge: 'CHAL' });
    expect(await provider.challengeForAuthorizationCode(client, 'code')).toBe('CHAL');
    store.getCode.mockResolvedValue({ clientId: 'other', codeChallenge: 'X' });
    await expect(provider.challengeForAuthorizationCode(client, 'code')).rejects.toThrow(/invalid_grant/);
  });

  it('exchangeAuthorizationCode passes client+redirect to consume and returns the token set', async () => {
    store.consumeCode.mockResolvedValue(TOKEN_SET);
    const t = await provider.exchangeAuthorizationCode(client, 'code', 'verifier', 'https://claude.ai/cb');
    expect(store.consumeCode).toHaveBeenCalledWith('code', { clientId: 'c1', redirectUri: 'https://claude.ai/cb' });
    expect(t.access_token).toBe(TOKEN_SET.access_token);
    expect(t.refresh_token).toBe('apop_r_xyz');
  });

  it('exchangeAuthorizationCode throws when the backend rejects the code', async () => {
    store.consumeCode.mockResolvedValue(null);
    await expect(provider.exchangeAuthorizationCode(client, 'bad', 'v', 'https://claude.ai/cb')).rejects.toThrow(/invalid_grant/);
  });

  it('exchangeRefreshToken rotates via the store (bound to client_id)', async () => {
    store.refresh.mockResolvedValue(TOKEN_SET);
    const t = await provider.exchangeRefreshToken(client, 'apop_r_old');
    expect(store.refresh).toHaveBeenCalledWith('apop_r_old', 'c1');
    expect(t.access_token).toBe(TOKEN_SET.access_token);
    store.refresh.mockResolvedValue(null);
    await expect(provider.exchangeRefreshToken(client, 'bad')).rejects.toThrow(/invalid_grant/);
  });

  it('revokeToken revokes via the store', async () => {
    await provider.revokeToken(client, { token: 'apop_r_xyz' });
    expect(store.revoke).toHaveBeenCalledWith('apop_r_xyz');
  });

  it('verifyAccessToken decodes a valid AP JWT and rejects garbage/expired', async () => {
    const info = await provider.verifyAccessToken(fakeJwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 }));
    expect(info.extra.userId).toBe('u1');
    await expect(provider.verifyAccessToken('nope')).rejects.toThrow(/invalid_token/);
    await expect(provider.verifyAccessToken(fakeJwt({ sub: 'u1', exp: 1 }))).rejects.toThrow(/expired/);
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
    store = { getClient: jest.fn().mockResolvedValue(client), createCode: jest.fn().mockResolvedValue('CODE1') };
    handler = makeConsentHandler({ store, apiUrl: 'http://api.test' });
    axios.post.mockReset();
  });
  const reqWith = (body) => ({ body: { client_id: 'c1', redirect_uri: 'https://claude.ai/cb', code_challenge: 'C', state: 'st', scope: 'agentplanner', ...body } });

  it('logs in, creates a code bound to user_id (no AP creds), redirects with code+state', async () => {
    axios.post.mockResolvedValue({ data: { user: { id: 'u1' }, session: { access_token: 'jwt' } } });
    const res = resMock();
    await handler(reqWith({ email: 'a@b.co', password: 'pw' }), res);
    expect(store.createCode).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'c1', userId: 'u1' }));
    expect(store.createCode.mock.calls[0][0].ap).toBeUndefined();
    expect(res.redirect.mock.calls[0][1]).toBe('https://claude.ai/cb?code=CODE1&state=st');
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
});
