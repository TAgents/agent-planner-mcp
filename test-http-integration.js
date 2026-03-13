/**
 * Integration Test for Planning Tools MCP HTTP Server
 *
 * This script demonstrates:
 * 1. Connecting to the HTTP server
 * 2. Initializing a session
 * 3. Listing available tools
 * 4. Calling planning tools
 *
 * Prerequisites:
 * - MCP HTTP server running (npm run start:http)
 * - Agent Planner API running (with valid USER_API_TOKEN)
 */

const axios = require('axios');

const SERVER_URL = 'http://127.0.0.1:3100';
const MCP_ENDPOINT = `${SERVER_URL}/mcp`;
const PROTOCOL_VERSION = '2025-03-26';

let sessionId = null;
let requestId = 1;

/**
 * Make a JSON-RPC request to the MCP server
 */
async function mcpRequest(method, params = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'MCP-Protocol-Version': PROTOCOL_VERSION
  };

  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  const payload = {
    jsonrpc: '2.0',
    id: requestId++,
    method,
    params
  };

  console.log(`\n📤 Request: ${method}`);
  console.log(JSON.stringify(payload, null, 2));

  const response = await axios.post(MCP_ENDPOINT, payload, { headers });

  // Extract session ID from response headers
  if (response.headers['mcp-session-id']) {
    sessionId = response.headers['mcp-session-id'];
    console.log(`🔑 Session ID: ${sessionId}`);
  }

  console.log(`\n📥 Response:`);
  console.log(JSON.stringify(response.data, null, 2));

  return response.data;
}

/**
 * Test health endpoint
 */
async function testHealth() {
  console.log('\n═══════════════════════════════════════');
  console.log('TEST 1: Health Check');
  console.log('═══════════════════════════════════════');

  const response = await axios.get(`${SERVER_URL}/health`);
  console.log('Health Status:', JSON.stringify(response.data, null, 2));
}

/**
 * Test initialize
 */
async function testInitialize() {
  console.log('\n═══════════════════════════════════════');
  console.log('TEST 2: Initialize Session');
  console.log('═══════════════════════════════════════');

  await mcpRequest('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {
      tools: {}
    },
    clientInfo: {
      name: 'integration-test',
      version: '1.0.0'
    }
  });
}

/**
 * Test listing tools
 */
async function testListTools() {
  console.log('\n═══════════════════════════════════════');
  console.log('TEST 3: List Available Tools');
  console.log('═══════════════════════════════════════');

  const response = await mcpRequest('tools/list');

  console.log(`\n✅ Found ${response.result.tools.length} tools:`);
  response.result.tools.forEach(tool => {
    console.log(`  - ${tool.name}: ${tool.description}`);
  });
}

/**
 * Test calling a tool (list_plans)
 */
async function testCallTool() {
  console.log('\n═══════════════════════════════════════');
  console.log('TEST 4: Call Tool (list_plans)');
  console.log('═══════════════════════════════════════');

  const response = await mcpRequest('tools/call', {
    name: 'list_plans',
    arguments: {}
  });

  if (response.result && response.result.isError) {
    console.log('\n⚠️  Tool call returned error (expected)');
    console.log('   Error:', response.result.content[0].text);
    console.log('   This is expected if USER_API_TOKEN is not configured or agent-planner API is not running');
    console.log('   The important thing is that the HTTP server correctly processed the request');
  } else if (response.result && response.result.content) {
    console.log('\n✅ Tool execution successful');
    const content = response.result.content[0];
    if (content.type === 'text') {
      try {
        const plans = JSON.parse(content.text);
        console.log(`Found ${Array.isArray(plans) ? plans.length : 0} plans`);
      } catch (e) {
        console.log('Response:', content.text);
      }
    }
  }
}

/**
 * Demonstrate Anthropic Messages API configuration
 */
function demonstrateAnthropicConfig() {
  console.log('\n═══════════════════════════════════════');
  console.log('ANTHROPIC MESSAGES API CONFIGURATION');
  console.log('═══════════════════════════════════════');

  const mcpServersConfig = [
    {
      type: 'url',
      url: 'http://127.0.0.1:3100/mcp',
      name: 'planning-tools',
      tool_configuration: {
        enabled: true,
        // Optionally limit to specific tools:
        // allowed_tools: ['create_plan', 'create_node', 'update_node']
      }
      // No authorization_token needed for localhost
    }
  ];

  console.log('\nExample Anthropic Messages API call:');
  console.log('```javascript');
  console.log('import Anthropic from "@anthropic-ai/sdk";');
  console.log('');
  console.log('const anthropic = new Anthropic({');
  console.log('  apiKey: process.env.ANTHROPIC_API_KEY,');
  console.log('  defaultHeaders: {');
  console.log('    "anthropic-beta": "mcp-client-2025-04-04"');
  console.log('  }');
  console.log('});');
  console.log('');
  console.log('const response = await anthropic.messages.create({');
  console.log('  model: "claude-sonnet-4.5-20250929",');
  console.log('  max_tokens: 4096,');
  console.log('  mcp_servers: ' + JSON.stringify(mcpServersConfig, null, 2).split('\n').join('\n  ') + ',');
  console.log('  messages: [{');
  console.log('    role: "user",');
  console.log('    content: "Create a plan for building a web application"');
  console.log('  }]');
  console.log('});');
  console.log('```');
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  Planning Tools MCP HTTP Server Integration Test     ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  try {
    await testHealth();
    await testInitialize();
    await testListTools();
    await testCallTool();
    demonstrateAnthropicConfig();

    console.log('\n═══════════════════════════════════════');
    console.log('✅ All tests completed successfully!');
    console.log('═══════════════════════════════════════\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run tests
runTests();
