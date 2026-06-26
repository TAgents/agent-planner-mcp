// planUrl builds the shareable web link agents post (e.g. to Slack). Derived
// from API_URL (strip /api → web origin), overridable via AGENTPLANNER_WEB_URL.
function freshShared() {
  delete require.cache[require.resolve('../src/tools/bdi/_shared')];
  return require('../src/tools/bdi/_shared');
}

describe('planUrl', () => {
  const orig = { API_URL: process.env.API_URL, WEB: process.env.AGENTPLANNER_WEB_URL };
  afterEach(() => {
    process.env.API_URL = orig.API_URL;
    if (orig.WEB === undefined) delete process.env.AGENTPLANNER_WEB_URL;
    else process.env.AGENTPLANNER_WEB_URL = orig.WEB;
  });

  it('derives the web origin from a hosted API_URL (strips /api)', () => {
    process.env.API_URL = 'https://agentplanner.io/api';
    delete process.env.AGENTPLANNER_WEB_URL;
    expect(freshShared().planUrl('p1')).toBe('https://agentplanner.io/app/plans/p1');
  });

  it('honors AGENTPLANNER_WEB_URL override', () => {
    process.env.API_URL = 'http://localhost:3000';
    process.env.AGENTPLANNER_WEB_URL = 'https://my.host/';
    expect(freshShared().planUrl('p1')).toBe('https://my.host/app/plans/p1');
  });

  it('returns null without a plan id', () => {
    expect(freshShared().planUrl(null)).toBeNull();
  });
});
