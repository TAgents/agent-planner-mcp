/**
 * This script generates a User API Token (not a Supabase JWT) for the MCP server
 * to properly authenticate with the agent-planner API.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// API URL from environment or default
const API_URL = process.env.API_URL || 'http://localhost:3000';

/**
 * Get a Supabase session token by logging in (needed to create API token)
 */
async function getSupabaseSession() {
  try {
    console.log('Attempting to login to the API...');
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@example.com',
      password: 'password123'
    });
    
    console.log('Login successful');
    return loginResponse.data;
  } catch (error) {
    console.error('Login failed:', error.response ? error.response.data : error.message);
    throw new Error('Failed to get Supabase session token');
  }
}

/**
 * Create a User API Token using the session token
 */
async function createApiToken(sessionToken) {
  try {
    console.log('Creating a User API Token...');
    const tokenResponse = await axios.post(`${API_URL}/tokens`, {
      name: 'MCP Server Token',
      description: 'Token for agent-planner-mcp server',
      permissions: ['read', 'write']
    }, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`
      }
    });
    
    console.log('API Token created successfully');
    return tokenResponse.data;
  } catch (error) {
    console.error('Failed to create API token:', error.response ? error.response.data : error.message);
    throw new Error('Failed to create User API Token');
  }
}

/**
 * Update the .env file with the new token
 */
function updateEnvFile(token) {
  const envPath = path.resolve(__dirname, '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Replace USER_API_TOKEN instead of API_TOKEN
  if (envContent.includes('USER_API_TOKEN=')) {
    envContent = envContent.replace(
      /USER_API_TOKEN=.+/,
      `USER_API_TOKEN=${token}`
    );
  } else if (envContent.includes('API_TOKEN=')) {
    // Replace old API_TOKEN if it exists
    envContent = envContent.replace(
      /API_TOKEN=.+/,
      `USER_API_TOKEN=${token}`
    );
  } else {
    // Add new entry if neither exists
    envContent += `\nUSER_API_TOKEN=${token}`;
  }
  
  fs.writeFileSync(envPath, envContent);
  console.log('Updated .env file with new User API Token');
}

/**
 * Generate the token and update the environment
 */
async function generateToken() {
  try {
    // Step 1: Login to get a session token
    const loginData = await getSupabaseSession();
    const sessionToken = loginData.session.access_token;
    
    console.log('\nSession Token obtained for authentication');
    
    // Step 2: Use the session token to create a User API Token
    const apiTokenData = await createApiToken(sessionToken);
    
    // Step 3: Extract the non-hashed token for use in API calls
    const userApiToken = apiTokenData.token;
    
    console.log('\nUser API Token obtained:');
    console.log('Token:', userApiToken.substring(0, 10) + '...');
    
    // Step 4: Test the token by fetching plans
    try {
      console.log('\nTesting API token by fetching plans...');
      const plansResponse = await axios.get(`${API_URL}/plans`, {
        headers: {
          'Authorization': `ApiKey ${userApiToken}`
        }
      });
      console.log('Token test successful! Retrieved', plansResponse.data.length, 'plans');
    } catch (testError) {
      console.error('Token test failed:', testError.response ? testError.response.data : testError.message);
    }
    
    // Step 5: Update the .env file
    updateEnvFile(userApiToken);
    
    console.log('\n⚠️ IMPORTANT: You will need to add this token to your claude_desktop_config.json file');
    console.log('Update the "env" section of your MCP server configuration to include:');
    console.log(`"USER_API_TOKEN": "${userApiToken}"`);
  } catch (error) {
    console.error('Error generating token:', error.message);
  }
}

// Run the token generation
generateToken();
