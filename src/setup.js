#!/usr/bin/env node

/**
 * Agent Planner MCP - Automated Setup Wizard
 *
 * This script helps users configure the MCP server for Claude Desktop:
 * 1. Checks API server availability
 * 2. Guides token creation and validates it
 * 3. Creates .env file
 * 4. Detects and updates Claude Desktop config
 * 5. Tests the connection
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');
const axios = require('axios');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, total, message) {
  log(`\nStep ${step}/${total}: ${message}`, 'bright');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'cyan');
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Detect Claude Desktop config location based on OS
function getClaudeConfigPath() {
  const platform = process.platform;
  const homeDir = process.env.HOME || process.env.USERPROFILE;

  if (platform === 'darwin') {
    // macOS
    return path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else if (platform === 'win32') {
    // Windows
    return path.join(homeDir, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
  } else {
    // Linux
    return path.join(homeDir, '.config', 'Claude', 'claude_desktop_config.json');
  }
}

// Check if API server is accessible
async function checkApiHealth(apiUrl) {
  try {
    const response = await axios.get(`${apiUrl}/health`, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

// Validate API token
async function validateToken(apiUrl, token) {
  try {
    const response = await axios.get(`${apiUrl}/plans`, {
      headers: {
        'Authorization': `ApiKey ${token}`
      },
      timeout: 5000
    });
    return response.status === 200;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      return false;
    }
    // If it's another error (like network), we can't validate
    throw new Error(`Cannot validate token: ${error.message}`);
  }
}

// Open URL in default browser
function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' :
                  process.platform === 'win32' ? 'start' : 'xdg-open';

  exec(`${command} ${url}`, (error) => {
    if (error) {
      logInfo(`Could not open browser automatically. Please open: ${url}`);
    }
  });
}

// Create .env file
function createEnvFile(config) {
  const envContent = `# Agent Planner MCP Configuration
# Generated on ${new Date().toISOString()}

API_URL=${config.apiUrl}
USER_API_TOKEN=${config.token}
MCP_SERVER_NAME=planning-system
MCP_SERVER_VERSION=0.2.0
NODE_ENV=production
`;

  const envPath = path.join(__dirname, '..', '.env');
  fs.writeFileSync(envPath, envContent);
  return envPath;
}

// Update Claude Desktop config
function updateClaudeConfig(configPath, mcpServerPath, apiUrl, token) {
  let config = {};

  // Read existing config if it exists
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      config = JSON.parse(content);
    } catch (error) {
      logInfo('Could not parse existing config, creating new one');
    }
  } else {
    // Create directory if it doesn't exist
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  // Ensure mcpServers exists
  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  // Add or update planning-system server
  config.mcpServers['planning-system'] = {
    command: 'node',
    args: [path.join(mcpServerPath, 'src', 'index.js')],
    env: {
      API_URL: apiUrl,
      USER_API_TOKEN: token
    }
  };

  // Write config
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

// Main setup wizard
async function runSetup() {
  log('\n🚀 Agent Planner MCP Setup Wizard\n', 'bright');

  try {
    // Step 1: API Configuration
    logStep(1, 5, 'API Configuration');

    log('\nWhere is your Agent Planner API running?');
    log('1. Local development (localhost)');
    log('2. Google Cloud Run');
    log('3. Custom URL');

    const deploymentType = await question('\nSelect option (1/2/3, default: 1): ');

    let apiUrl;
    let uiUrl;

    if (deploymentType === '2') {
      log('\nFor Cloud Run, you can find your URLs at:');
      log('https://console.cloud.google.com/run?project=ta-agent-planner');

      const apiUrlInput = await question('\nEnter API URL (e.g., https://agent-planner-api-xxx.run.app): ');
      apiUrl = apiUrlInput.trim();

      // Derive UI URL from API URL or ask for it
      const suggestedUiUrl = apiUrl.replace('api-', 'ui-').replace('api.', 'ui.');
      const uiUrlInput = await question(`Enter UI URL (default: ${suggestedUiUrl}): `);
      uiUrl = uiUrlInput.trim() || suggestedUiUrl;
    } else if (deploymentType === '3') {
      const apiUrlInput = await question('\nEnter API URL: ');
      apiUrl = apiUrlInput.trim();

      const uiUrlInput = await question('Enter UI URL: ');
      uiUrl = uiUrlInput.trim();
    } else {
      // Local development (default)
      apiUrl = 'http://localhost:3000';
      uiUrl = 'http://localhost:3001';
    }

    log('Checking API server...');
    const apiAvailable = await checkApiHealth(apiUrl);

    if (!apiAvailable) {
      logError(`Cannot connect to API server at ${apiUrl}`);
      logInfo('Make sure the API server is running: cd agent-planner && npm start');
      process.exit(1);
    }

    logSuccess(`Found API server at ${apiUrl}`);

    // Step 2: API Token Setup
    logStep(2, 5, 'API Token Setup');

    log('\nPlease generate an API token:');
    log('1. Open ' + uiUrl + '/app/settings in your browser');
    log('2. Navigate to the "API Tokens" section');
    log('3. Click "Create MCP Token" or "Create New Token"');
    log('4. Enter a name (e.g., "MCP Server")');
    log('5. Copy the generated token\n');

    logInfo('Opening settings page in your browser...');
    openBrowser(uiUrl + '/app/settings');

    await new Promise(resolve => setTimeout(resolve, 2000));

    const token = await question('\nEnter your API token: ');

    if (!token || token.trim().length < 10) {
      logError('Invalid token provided');
      process.exit(1);
    }

    log('Validating token...');
    try {
      const isValid = await validateToken(apiUrl, token.trim());

      if (!isValid) {
        logError('Token validation failed - please check the token and try again');
        process.exit(1);
      }

      logSuccess('Token validated successfully');
    } catch (error) {
      logError(`Token validation failed: ${error.message}`);
      process.exit(1);
    }

    // Step 3: Environment Configuration
    logStep(3, 5, 'Environment Configuration');

    const envPath = createEnvFile({ apiUrl, token: token.trim() });
    logSuccess(`Created .env file at: ${envPath}`);

    // Step 4: Claude Desktop Configuration
    logStep(4, 5, 'Claude Desktop Configuration');

    const configPath = getClaudeConfigPath();
    const mcpServerPath = path.join(__dirname, '..');

    log(`Detected Claude Desktop config at: ${configPath}`);

    const shouldUpdateConfig = await question('Update Claude Desktop config? (y/n): ');

    if (shouldUpdateConfig.toLowerCase() === 'y' || shouldUpdateConfig.toLowerCase() === 'yes') {
      try {
        updateClaudeConfig(configPath, mcpServerPath, apiUrl, token.trim());
        logSuccess('Added planning-system MCP server to Claude Desktop config');
      } catch (error) {
        logError(`Failed to update config: ${error.message}`);
        logInfo('You can manually add the configuration later');
      }
    } else {
      logInfo('Skipped Claude Desktop config update');
      log('\nManual configuration:');
      log(JSON.stringify({
        "mcpServers": {
          "planning-system": {
            "command": "node",
            "args": [path.join(mcpServerPath, 'src', 'index.js')],
            "env": {
              "API_URL": apiUrl,
              "USER_API_TOKEN": token.trim().substring(0, 10) + '...'
            }
          }
        }
      }, null, 2));
    }

    // Step 5: Testing Connection
    logStep(5, 5, 'Testing Connection');

    log('Testing MCP server connection...');

    // Simple test by loading the API client
    try {
      process.env.API_URL = apiUrl;
      process.env.USER_API_TOKEN = token.trim();

      const apiClient = require('./api-client');
      const plans = await apiClient.plans.getPlans();

      logSuccess(`MCP server can connect to API`);
      logSuccess(`Successfully retrieved ${plans.length} plan(s)`);
    } catch (error) {
      logError(`Connection test failed: ${error.message}`);
    }

    // Success!
    log('\n🎉 Setup complete!\n', 'green');

    log('Next steps:', 'bright');
    log('1. Restart Claude Desktop to load the MCP server');
    log('2. Look for the 🔨 icon in Claude Desktop - you should see planning tools');
    log('3. Try asking: "List my plans" or "Create a new plan called \'Test Project\'"');
    log('');
    log('Configuration saved to:', 'bright');
    log(`  .env file: ${envPath}`);
    log(`  Claude config: ${configPath}`);
    log('');

  } catch (error) {
    logError(`\nSetup failed: ${error.message}`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run the setup wizard
runSetup();
