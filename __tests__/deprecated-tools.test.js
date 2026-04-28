const { bdiToolDefinitions } = require('../src/tools/bdi');

describe('deprecated MCP tool cleanup', () => {
  it('does not expose legacy CRUD/fan-out tool names', () => {
    const names = bdiToolDefinitions.map(t => t.name);
    expect(names).not.toEqual(expect.arrayContaining([
      'quick_status',
      'quick_plan',
      'quick_task',
      'check_goals_health',
      'get_task_context',
      'suggest_next_tasks',
      'claim_task',
      'run_coherence_check',
      'create_rpi_chain',
    ]));
  });
});
