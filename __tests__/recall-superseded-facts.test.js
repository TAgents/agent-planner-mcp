const { handlers } = require('../src/tools/bdi/beliefs');

// recall_knowledge returned superseded facts (expired_at / past invalid_at)
// inline with current ones, undistinguished — an agent could act on stale
// knowledge. Each fact must now carry status current|superseded, sorted
// current-first, with a superseded_fact_count in meta.
function parse(res) {
  return JSON.parse(res.content[0].text);
}

const CURRENT = { uuid: 'c1', fact: 'X is true', valid_at: '2026-06-26T00:00:00Z', expired_at: null, invalid_at: null };
const EXPIRED = { uuid: 's1', fact: 'X was true', valid_at: '2026-06-18T00:00:00Z', expired_at: '2026-06-18T11:48:00Z', invalid_at: '2026-06-18T11:48:00Z' };
const PAST_INVALID = { uuid: 's2', fact: 'Y was true', valid_at: '2026-01-01T00:00:00Z', expired_at: null, invalid_at: '2026-02-01T00:00:00Z' };

describe('recall_knowledge — superseded fact flagging (v1 facade path)', () => {
  function v1Client(facts) {
    return { v1: { knowledgeSearch: jest.fn().mockResolvedValue({ facts, entities: [], episodes: [] }) } };
  }

  it('tags expired/past-invalid facts superseded and current facts current', async () => {
    const res = await handlers.recall_knowledge({ query: 'X' }, v1Client([CURRENT, EXPIRED, PAST_INVALID]));
    const body = parse(res);
    const byUuid = Object.fromEntries(body.facts.map((f) => [f.uuid, f.status]));
    expect(byUuid.c1).toBe('current');
    expect(byUuid.s1).toBe('superseded');
    expect(byUuid.s2).toBe('superseded');
    expect(body.meta.superseded_fact_count).toBe(2);
  });

  it('sorts current facts before superseded ones', async () => {
    const res = await handlers.recall_knowledge({ query: 'X' }, v1Client([EXPIRED, CURRENT]));
    const body = parse(res);
    expect(body.facts[0].status).toBe('current');
    expect(body.facts[body.facts.length - 1].status).toBe('superseded');
  });
});

describe('recall_knowledge — superseded fact flagging (legacy fan-out path)', () => {
  it('annotates facts from the graphiti fan-out too', async () => {
    const client = {
      graphiti: {
        graphSearch: jest.fn().mockResolvedValue({ facts: [CURRENT, EXPIRED] }),
        searchEntities: jest.fn().mockResolvedValue({ entities: [] }),
        getEpisodes: jest.fn().mockResolvedValue({ episodes: [] }),
      },
    };
    const res = await handlers.recall_knowledge({ query: 'X', result_kind: 'facts' }, client);
    const body = parse(res);
    expect(body.facts.find((f) => f.uuid === 's1').status).toBe('superseded');
    expect(body.meta.superseded_fact_count).toBe(1);
  });
});
