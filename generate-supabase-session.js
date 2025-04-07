/**
 * This script generates a Supabase session token for the MCP server
 * by logging in to the API directly.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// API URL from environment or default
const API_URL = process.env.API_URL || 'http://localhost:3000';

/**
 * Get a Supabase session token by logging in
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
 * Update the .env file with the new token
 */
function updateEnvFile(token) {
  const envPath = path.resolve(__dirname, '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Replace the API_TOKEN line
  envContent = envContent.replace(
    /API_TOKEN=.+/,
    `API_TOKEN=${token}`
  );
  
  fs.writeFileSync(envPath, envContent);
  console.log('Updated .env file with new session token');
}

/**
 * Generate the token and update the environment
 */
async function generateToken() {
  try {
    // Get a Supabase session token
    const loginData = await getSupabaseSession();
    
    // We'll use the session token directly
    const sessionToken = loginData.session.access_token;
    
    console.log('\nSession Token obtained:');
    console.log('Token:', sessionToken.substring(0, 20) + '...');
    
    // Test the token by fetching plans
    try {
      console.log('\nTesting token by fetching plans...');
      const plansResponse = await axios.get(`${API_URL}/plans`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });
      console.log('Token test successful! Retrieved', plansResponse.data.length, 'plans');
    } catch (testError) {
      console.error('Token test failed:', testError.response ? testError.response.data : testError.message);
    }
    
    // Update the .env file
    updateEnvFile(sessionToken);
    
    console.log('\n⚠️ IMPORTANT: You will need to add this token to your claude_desktop_config.json file');
    console.log('Update the "env" section of your MCP server configuration to include:');
    console.log(`"API_TOKEN": "${sessionToken}"`);
  } catch (error) {
    console.error('Error generating token:', error.message);
  }
}

// Run the token generation
generateToken();
