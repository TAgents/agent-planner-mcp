/**
 * add_learning must return the identifier the API actually gave it.
 *
 * The API responds { episode: <raw bridge payload>, episode_id, pending, ... }
 * and episode_id is NEVER null — when Graphiti's async add_memory yields no
 * uuid the API mints a `pending:<uuid>` correlation id and writes that same id
 * into episode_node_links, so the caller can correlate the two.
 *
 * This handler read only `result.episode?.uuid`, which is empty on the async
 * path — so every add_learning call reported episode_id: null while reporting
 * "Knowledge recorded". A success message with no retrievable identifier is
 * exactly the failure this plan exists to remove.
 */
const intentions = require('../src/tools/bdi/intentions');

function parseResponse(response) {
  return JSON.parse(response.content[0].text);
}

const handler = intentions.handlers.add_learning;

function clientReturning(payload) {
  return { graphiti: { addEpisode: jest.fn().mockResolvedValue(payload) } };
}

describe('add_learning episode_id', () => {
  it('returns the pending correlation id rather than null', async () => {
    const client = clientReturning({
      episode: { message: "Episode 'x' queued for processing" },
      episode_id: 'pending:11111111-2222-3333-4444-555555555555',
      pending: true,
      coherence_warnings: [],
    });

    const out = parseResponse(await handler({ content: 'a thing I learned' }, client));

    expect(out.episode_id).toBe('pending:11111111-2222-3333-4444-555555555555');
    expect(out.pending).toBe(true);
  });

  it('does not claim the write is settled while ingestion is queued', async () => {
    const client = clientReturning({
      episode: {},
      episode_id: 'pending:abc',
      pending: true,
    });

    const out = parseResponse(await handler({ content: 'x' }, client));

    expect(out.message).toBe('Knowledge queued for ingestion');
  });

  it('returns the real uuid when Graphiti resolved one synchronously', async () => {
    const client = clientReturning({
      episode: { uuid: 'real-uuid' },
      episode_id: 'real-uuid',
      pending: false,
    });

    const out = parseResponse(await handler({ content: 'x' }, client));

    expect(out.episode_id).toBe('real-uuid');
    expect(out.pending).toBe(false);
    expect(out.message).toBe('Knowledge recorded');
  });

  it('infers pending from the id prefix when the API omits the flag', async () => {
    // A self-hosted backend predating the `pending` field still encodes the
    // state in the id itself; do not report it as settled.
    const out = parseResponse(
      await handler({ content: 'x' }, clientReturning({ episode_id: 'pending:zzz' })),
    );

    expect(out.pending).toBe(true);
  });

  it('falls back to the legacy nested uuid for older backends', async () => {
    const out = parseResponse(
      await handler({ content: 'x' }, clientReturning({ episode: { uuid: 'legacy-uuid' } })),
    );

    expect(out.episode_id).toBe('legacy-uuid');
    expect(out.pending).toBe(false);
  });

  it('passes coherence warnings straight through', async () => {
    const warning = { node_id: 'n1', title: 'T', conflict_type: 'contradicted', message: 'm' };
    const out = parseResponse(
      await handler(
        { content: 'x', scope: { plan_id: 'p1' } },
        clientReturning({ episode_id: 'pending:q', coherence_warnings: [warning] }),
      ),
    );

    expect(out.coherence_warnings).toEqual([warning]);
  });
});

describe('add_learning scope linkage', () => {
  it('reports what actually landed for a scoped write', async () => {
    const client = clientReturning({
      episode_id: 'pending:x',
      pending: true,
      ingestion_status: 'queued',
      links_created: [{ node_id: 'n1', link_type: 'informs' }],
      links_failed: [],
    });

    const out = parseResponse(await handler({ content: 'x', scope: { plan_id: 'p1' } }, client));

    expect(out.links_created).toEqual([{ node_id: 'n1', link_type: 'informs' }]);
    expect(out.ingestion_status).toBe('queued');
  });

  it('refuses to call a write successful when its scope link failed', async () => {
    const client = clientReturning({
      episode_id: 'pending:x',
      pending: true,
      links_created: [],
      links_failed: [{ plan_id: 'p1', reason: 'plan has no root node to attach to' }],
    });

    const out = parseResponse(await handler({ content: 'x', scope: { plan_id: 'p1' } }, client));

    expect(out.message).toMatch(/NOT retrievable by that scope/);
    expect(out.links_failed).toHaveLength(1);
  });

  it('omits link fields entirely for an unscoped write', async () => {
    const out = parseResponse(
      await handler({ content: 'x' }, clientReturning({ episode_id: 'pending:x', pending: true })),
    );

    expect(out).not.toHaveProperty('links_created');
    expect(out).not.toHaveProperty('links_failed');
  });
});
