jest.mock('axios');
const axios = require('axios');
const { makeConsentHandler } = require('../src/oauth/consent');
const { ApOAuthProvider } = require('../src/oauth/provider');
const params = { client_id: 'client', redirect_uri: 'https://claude.ai/callback', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256', state: 'opaque-state', scope: 'agentplanner' };
const response = () => { const r = {}; for (const k of ['status', 'set', 'send', 'json', 'redirect']) r[k] = jest.fn().mockReturnValue(r); return r; };
let store;
beforeEach(() => {
  jest.resetAllMocks();
  store = { getClient: jest.fn().mockResolvedValue({ client_name: 'Claude', redirect_uris: [params.redirect_uri] }), createCode: jest.fn().mockResolvedValue('code') };
  axios.get.mockResolvedValue({ data: { id: 'verified-user' } });
});
const req = () => ({ body: { ...params, user_id: 'untrusted-user' }, headers: { authorization: 'Bearer synthetic' }, is: () => true });
test.each(['getClient', 'createCode'])('%s failure returns recoverable 503 without rejecting', async (method) => {
  store[method].mockRejectedValue(new Error('private backend detail'));
  const res = response();
  await expect(makeConsentHandler({ store, apiUrl: 'http://api' })(req(), res)).resolves.toBeDefined();
  expect(res.status).toHaveBeenCalledWith(503);
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('private backend detail');
});
test('uses verified browser session, not password or user-supplied identity; returns callback without following it', async () => {
  const res = response();
  await makeConsentHandler({ store, apiUrl: 'http://api' })(req(), res);
  expect(axios.get).toHaveBeenCalledWith('http://api/auth/profile', expect.objectContaining({ headers: { Authorization: 'Bearer synthetic' } }));
  expect(axios.post).not.toHaveBeenCalled();
  expect(store.createCode).toHaveBeenCalledWith(expect.objectContaining({ userId: 'verified-user' }));
  expect(res.json).toHaveBeenCalledWith({ redirect_url: 'https://claude.ai/callback?code=code&state=opaque-state' });
  expect(res.redirect).not.toHaveBeenCalled();
});
test('expired browser session yields 401, never creates a code', async () => {
  axios.get.mockRejectedValue({ response: { status: 401 } });
  const res = response();
  await makeConsentHandler({ store, apiUrl: 'http://api' })(req(), res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(store.createCode).not.toHaveBeenCalled();
});
test('rejects missing PKCE before authenticating', async () => {
  const request = req(); delete request.body.code_challenge;
  const res = response();
  await makeConsentHandler({ store, apiUrl: 'http://api' })(request, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(axios.get).not.toHaveBeenCalled();
  expect(store.createCode).not.toHaveBeenCalled();
});
test('authorization enters normal protected web login with OAuth state intact', async () => {
  const res = response();
  await new ApOAuthProvider({ store }).authorize({ client_id: 'client' }, { redirectUri: params.redirect_uri, codeChallenge: params.code_challenge, state: params.state, scopes: ['agentplanner'] }, res);
  expect(res.redirect).toHaveBeenCalledWith(302, expect.stringMatching(/^\/connect\/authorize\?/));
  const url = new URL(res.redirect.mock.calls[0][1], 'https://agentplanner.io');
  expect(url.searchParams.get('state')).toBe(params.state);
  expect(url.searchParams.get('code_challenge')).toBe(params.code_challenge);
});
test('metadata is validated without logging in or issuing codes', async () => {
  const res = response();
  await makeConsentHandler({ store, apiUrl: 'http://api', infoOnly: true })({ query: params }, res);
  expect(res.json).toHaveBeenCalledWith({ client_name: 'Claude', redirect_uri: params.redirect_uri });
  expect(axios.get).not.toHaveBeenCalled();
  expect(store.createCode).not.toHaveBeenCalled();
});
test.each([['scope', 'admin'], ['code_challenge_method', 'plain'], ['redirect_uri', 'https://attacker.invalid/cb']])('rejects tampered %s before authentication', async (field, value) => {
  const request = req(); request.body[field] = value;
  const res = response();
  await makeConsentHandler({ store, apiUrl: 'http://api' })(request, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(axios.get).not.toHaveBeenCalled();
  expect(store.createCode).not.toHaveBeenCalled();
});
test('throttled login returns actionable 429', async () => {
  axios.get.mockRejectedValue({ response: { status: 429 } });
  const res = response();
  await makeConsentHandler({ store, apiUrl: 'http://api' })(req(), res);
  expect(res.status).toHaveBeenCalledWith(429);
  expect(store.createCode).not.toHaveBeenCalled();
});
test('legacy form code-store failure is caught and renders retry guidance', async () => {
  axios.post.mockResolvedValue({ data: { user: { id: 'u' }, session: { access_token: 'synthetic' } } });
  store.createCode.mockRejectedValue(new Error('private database detail'));
  const request = req(); request.is = () => false;
  const res = response();
  await makeConsentHandler({ store, apiUrl: 'http://api' })(request, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Authorization is temporarily unavailable'));
});
