const fs = require('fs');
const os = require('os');
const path = require('path');

function getConfigDir() {
  if (process.env.AGENT_PLANNER_CONFIG_DIR) {
    return process.env.AGENT_PLANNER_CONFIG_DIR;
  }

  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'agent-planner');
  }

  return path.join(os.homedir(), '.config', 'agent-planner');
}

function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function writeConfig(config) {
  const configDir = getConfigDir();
  ensureDir(configDir);
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  return configPath;
}

function resolveApiConfig(overrides = {}) {
  const config = readConfig();
  return {
    apiUrl: overrides.apiUrl || process.env.API_URL || config.apiUrl || 'http://localhost:3000',
    token: overrides.token || process.env.USER_API_TOKEN || process.env.API_TOKEN || config.token || null,
  };
}

function mergeConfig(partial) {
  const existing = readConfig();
  return writeConfig({ ...existing, ...partial, updatedAt: new Date().toISOString() });
}

module.exports = {
  ensureDir,
  getConfigDir,
  getConfigPath,
  readConfig,
  writeConfig,
  mergeConfig,
  resolveApiConfig,
};
