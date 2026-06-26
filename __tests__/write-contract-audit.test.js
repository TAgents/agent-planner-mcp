/**
 * Contract-audit fixes — the MCP write tools must match the backend's strict
 * schemas. These three were found by auditing every write handler:
 *   1. resolve_decision: createNode is strict with no acceptance_criteria →
 *      fold it into description (was 400ing approved subtasks).
 *   2. update_task: log_type 'blocker'/'completion' aren't valid backend types →
 *      map to challenge/progress.
 *   3. add_learning: entry_type/source_description were dropped (endpoint only
 *      persists metadata) → carry them in metadata.
 */
const intentions = require('../src/tools/bdi/intentions');

describe('resolve_decision — proposed_subtask creation (no acceptance_criteria key)', () => {
  it('folds acceptance_criteria into description, never sends the strict-rejected key', async () => {
    const createNode = jest.fn().mockResolvedValue({ id: 'n1' });
    const get = jest.fn().mockResolvedValue({
      data: { metadata: { proposed_subtasks: [
        { parent_id: 'p1', title: 'Build', description: 'Do the thing', acceptance_criteria: 'tests pass' },
      ] } },
    });
    const post = jest.fn().mockResolvedValue({ data: { id: 'dec-1', status: 'decided' } });

    await intentions.handlers.resolve_decision(
      { decision_id: 'dec-1', plan_id: 'plan-1', action: 'approve' },
      { axiosInstance: { get, post }, nodes: { createNode } },
    );

    const body = createNode.mock.calls[0][1];
    expect(body).not.toHaveProperty('acceptance_criteria');
    expect(body.description).toContain('Do the thing');
    expect(body.description).toContain('Acceptance criteria: tests pass');
  });
});

describe('update_task — log_type alias mapping', () => {
  function legacyClient() {
    const updateNode = jest.fn().mockResolvedValue({});
    const addLogEntry = jest.fn().mockResolvedValue({ id: 'log-1' });
    return {
      updateNode, addLogEntry,
      client: {
        // no v1 → legacy fan-out
        axiosInstance: { get: jest.fn().mockResolvedValue({ data: { plan_id: 'plan-1' } }) },
        nodes: { updateNode },
        logs: { addLogEntry },
      },
    };
  }

  it("maps legacy 'blocker' → 'challenge'", async () => {
    const { addLogEntry, client } = legacyClient();
    await intentions.handlers.update_task(
      { task_id: 'n1', plan_id: 'plan-1', log_message: 'stuck', log_type: 'blocker' },
      client,
    );
    expect(addLogEntry).toHaveBeenCalledWith('plan-1', 'n1', expect.objectContaining({ log_type: 'challenge' }));
  });

  it("maps legacy 'completion' → 'progress'", async () => {
    const { addLogEntry, client } = legacyClient();
    await intentions.handlers.update_task(
      { task_id: 'n1', plan_id: 'plan-1', log_message: 'done', log_type: 'completion' },
      client,
    );
    expect(addLogEntry).toHaveBeenCalledWith('plan-1', 'n1', expect.objectContaining({ log_type: 'progress' }));
  });

  it('passes a valid log_type through unchanged', async () => {
    const { addLogEntry, client } = legacyClient();
    await intentions.handlers.update_task(
      { task_id: 'n1', plan_id: 'plan-1', log_message: 'note', log_type: 'reasoning' },
      client,
    );
    expect(addLogEntry).toHaveBeenCalledWith('plan-1', 'n1', expect.objectContaining({ log_type: 'reasoning' }));
  });

  it('only advertises backend-valid log types in the schema', () => {
    const def = intentions.definitions.find((d) => d.name === 'update_task');
    const valid = ['comment', 'progress', 'reasoning', 'decision', 'challenge'];
    for (const t of def.inputSchema.properties.log_type.enum) {
      expect(valid).toContain(t);
    }
  });
});

describe('add_learning — entry_type persisted in metadata', () => {
  it('carries entry_type + source_description in metadata (was dropped)', async () => {
    const addEpisode = jest.fn().mockResolvedValue({ uuid: 'ep-1' });
    await intentions.handlers.add_learning(
      { content: 'X works', entry_type: 'decision', source_description: 'spike' },
      { graphiti: { addEpisode } },
    );
    const body = addEpisode.mock.calls[0][0];
    expect(body.metadata).toEqual({ entry_type: 'decision', source_description: 'spike' });
  });
});
