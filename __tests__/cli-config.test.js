const fs = require('fs');
const os = require('os');
const path = require('path');

describe('cli config helpers', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('writes and reads config from AGENT_PLANNER_CONFIG_DIR override', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = tempDir;

    const config = require('../src/cli/config');
    const configPath = config.writeConfig({ apiUrl: 'https://agentplanner.io/api', token: 'secret-token' });
    const saved = config.readConfig();

    expect(configPath).toBe(path.join(tempDir, 'config.json'));
    expect(saved.apiUrl).toBe('https://agentplanner.io/api');
    expect(saved.token).toBe('secret-token');
  });

  test('resolveApiConfig prefers explicit overrides over env and file config', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-config-'));
    process.env.AGENT_PLANNER_CONFIG_DIR = tempDir;
    process.env.API_URL = 'http://env.example/api';
    process.env.USER_API_TOKEN = 'env-token';

    const config = require('../src/cli/config');
    config.writeConfig({ apiUrl: 'http://file.example/api', token: 'file-token' });

    const resolved = config.resolveApiConfig({ apiUrl: 'http://override/api', token: 'override-token' });
    expect(resolved).toEqual({ apiUrl: 'http://override/api', token: 'override-token' });
  });
});
