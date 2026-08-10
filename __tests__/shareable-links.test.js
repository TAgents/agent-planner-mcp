/**
 * Shareable links must be resolvable by someone who isn't inside our container
 * network.
 *
 * form_intention returned `url: "http://api:3000/app/plans/<id>"` and a
 * next_step that literally told the agent to paste that into Slack. `api:3000`
 * is the Docker Compose service name — it resolves for nobody outside the
 * compose network, so every one of those links was dead on arrival.
 */
const ORIGINAL_ENV = { ...process.env };

function freshShared(env = {}) {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, ...env };
  delete process.env.AGENTPLANNER_WEB_URL;
  delete process.env.API_URL;
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  // eslint-disable-next-line global-require
  return require('../src/tools/bdi/_shared');
}

afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

const PLAN = '5d5a543f-baff-463c-bf89-1c645a1f7fc3';

describe('planUrl — never emits an unreachable host', () => {
  it.each([
    ['the Docker service name that shipped', 'http://api:3000'],
    ['a service name with an /api suffix', 'http://api:3000/api'],
    ['localhost', 'http://localhost:3000'],
    ['loopback IP', 'http://127.0.0.1:3000'],
    ['a private 10.x address', 'http://10.1.2.3:3000'],
    ['a private 192.168.x address', 'http://192.168.1.50:3000'],
    ['a private 172.16-31.x address', 'http://172.20.0.5:3000'],
    ['any bare hostname', 'http://backend'],
  ])('returns null for %s', (_label, apiUrl) => {
    const { planUrl } = freshShared({ API_URL: apiUrl });
    expect(planUrl(PLAN)).toBeNull();
  });

  it('builds a link from a real public API_URL', () => {
    const { planUrl } = freshShared({ API_URL: 'https://agentplanner.io/api' });
    expect(planUrl(PLAN)).toBe(`https://agentplanner.io/app/plans/${PLAN}`);
  });

  it('trusts an explicit AGENTPLANNER_WEB_URL, even a local one', () => {
    // Setting it is a deliberate act — a developer sharing with themselves is
    // fine. What must never happen is INFERRING a local address and calling it
    // shareable.
    const { planUrl } = freshShared({
      AGENTPLANNER_WEB_URL: 'http://localhost:3001',
      API_URL: 'http://api:3000',
    });
    expect(planUrl(PLAN)).toBe(`http://localhost:3001/app/plans/${PLAN}`);
  });

  it('falls back to the hosted app when nothing is configured', () => {
    const { planUrl } = freshShared({});
    expect(planUrl(PLAN)).toBe(`https://agentplanner.io/app/plans/${PLAN}`);
  });

  it('returns null without a plan id', () => {
    const { planUrl } = freshShared({ API_URL: 'https://agentplanner.io/api' });
    expect(planUrl(null)).toBeNull();
  });
});

describe('activePlanNextStep — the text agents actually paste', () => {
  it('never contains an internal host', () => {
    const { activePlanNextStep } = freshShared({ API_URL: 'http://api:3000' });
    const text = activePlanNextStep(PLAN);

    expect(text).not.toContain('api:3000');
    expect(text).not.toContain('localhost');
    expect(text).not.toMatch(/https?:\/\//);          // no URL at all, rather than a broken one
    expect(text).toContain('AGENTPLANNER_WEB_URL');   // says how to fix it
  });

  it('includes the link when the origin is public', () => {
    const { activePlanNextStep } = freshShared({ API_URL: 'https://agentplanner.io/api' });
    expect(activePlanNextStep(PLAN)).toContain(`https://agentplanner.io/app/plans/${PLAN}`);
  });

  it('still tells the agent what to do next either way', () => {
    for (const apiUrl of ['http://api:3000', 'https://agentplanner.io/api']) {
      const { activePlanNextStep } = freshShared({ API_URL: apiUrl });
      expect(activePlanNextStep(PLAN)).toContain('claim_next_task');
    }
  });
});

describe('isNonRoutableHost', () => {
  it('rejects unparseable input rather than assuming it is fine', () => {
    const { isNonRoutableHost } = freshShared({});
    expect(isNonRoutableHost('not a url')).toBe(true);
    expect(isNonRoutableHost('')).toBe(true);
  });

  it('accepts ordinary public hosts, including self-hosted domains', () => {
    const { isNonRoutableHost } = freshShared({});
    expect(isNonRoutableHost('https://agentplanner.io')).toBe(false);
    expect(isNonRoutableHost('https://plans.example.co.uk:8443')).toBe(false);
  });
});
