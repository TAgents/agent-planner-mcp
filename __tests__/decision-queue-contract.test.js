/**
 * queue_decision / resolve_decision must speak the backend's decision schema.
 * The agent-facing vocabulary differs from storage, and the body used to be
 * rejected wholesale with a generic "Validation failed":
 *   - urgency: low/normal/high  →  blocking/can_continue/informational
 *   - options: {label,description}  →  strict {option, recommendation?}
 *   - no top-level `recommendation` (strict schema)
 *   - resolve: {decision, rationale}, NOT {resolution, message, selected_option}
 * These tests pin the mapping so the hero feature can't silently break again.
 */
const intentions = require('../src/tools/bdi/intentions');

const PLAN_ID = 'plan-uuid';

function parse(res) {
  return JSON.parse(res.content[0].text);
}

describe('queue_decision — backend contract mapping', () => {
  function capturingClient() {
    const post = jest.fn().mockResolvedValue({ data: { id: 'dec-1', status: 'pending', title: 'T' } });
    return { post, client: { axiosInstance: { post } } };
  }

  it('maps urgency, options, and recommendation to the strict backend shape', async () => {
    const { post, client } = capturingClient();
    await intentions.handlers.queue_decision({
      plan_id: PLAN_ID,
      title: 'Pick a path',
      context: 'why it matters',
      smallest_input_needed: 'approve',
      urgency: 'high',
      recommendation: 'Option A is safest',
      options: [
        { label: 'Option A', description: 'the safe one' },
        { label: 'Option B', description: 'the risky one' },
      ],
    }, client);

    const [, body] = post.mock.calls[0];
    expect(body.urgency).toBe('blocking'); // high → blocking
    // options become {option, recommendation?}, never {label}
    expect(body.options[0]).toEqual({ option: 'Option A — the safe one', recommendation: true });
    expect(body.options[1]).toEqual({ option: 'Option B — the risky one' });
    // no top-level recommendation key (strict schema would reject it)
    expect(body).not.toHaveProperty('recommendation');
    // free-text recommendation + ask preserved in metadata
    expect(body.metadata.recommendation).toBe('Option A is safest');
    expect(body.metadata.smallest_input_needed).toBe('approve');
  });

  it('defaults urgency to can_continue when omitted', async () => {
    const { post, client } = capturingClient();
    await intentions.handlers.queue_decision(
      { plan_id: PLAN_ID, title: 'T', context: 'c', smallest_input_needed: 'approve' },
      client,
    );
    expect(post.mock.calls[0][1].urgency).toBe('can_continue');
  });

  it('surfaces the backend field-level validation message, not the generic top line', async () => {
    const err = new Error('Request failed');
    err.response = { data: { error: 'Validation failed', message: 'urgency: must be one of ...' } };
    const client = { axiosInstance: { post: jest.fn().mockRejectedValue(err) } };
    const res = await intentions.handlers.queue_decision(
      { plan_id: PLAN_ID, title: 'T', context: 'c', smallest_input_needed: 'approve' },
      client,
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/urgency: must be one of/);
  });
});

describe('resolve_decision — backend contract mapping', () => {
  it('sends {decision, rationale}, encoding action + selected_option', async () => {
    const post = jest.fn().mockResolvedValue({ data: { id: 'dec-1', status: 'decided' } });
    const get = jest.fn().mockResolvedValue({ data: { metadata: {} } });
    await intentions.handlers.resolve_decision({
      decision_id: 'dec-1', plan_id: PLAN_ID, action: 'approve',
      selected_option: 'Option A', message: 'looks good',
    }, { axiosInstance: { post, get } });

    const resolveCall = post.mock.calls.find((c) => String(c[0]).includes('/resolve'));
    expect(resolveCall[1]).toEqual({ decision: 'approve — Option A', rationale: 'looks good' });
  });
});
