# Planning System MCP Server

An MCP (Model Context Protocol) server interface for the Planning System API, enabling AI agents to interact with planning data.

## Overview

This project implements a Model Context Protocol server that connects to the Planning System API, providing AI agents with access to planning resources, tools, and prompts through a standardized interface.

## Features

### Resources
- Plans list resource (`plans://list`)
- Plan details resource (`plan://{planId}`)
- Plan structure resource (`plan://{planId}/structure`)
- Node details resource (`plan://{planId}/node/{nodeId}`)
- Plan activity resource (`plan://{planId}/activity`)
- Node comments, logs, and artifacts resources
- Global activity resource (`activity://global`)

### Tools
- Plan management tools (`create_plan`, `update_plan`)
- Node management tools (`create_node`, `update_node_status`)
- Comment and log tools (`add_comment`, `add_log_entry`)
- Artifact management tool (`add_artifact`)
- Search tool (`search_plan`)

### Prompts
- Plan analysis prompt (`analyze_plan`)
- Improvement suggestions prompt (`suggest_improvements`)
- Implementation steps generator (`generate_implementation_steps`)
- Plan summarization prompt (`summarize_plan`)
- Status report generator (`generate_status_report`)

## Getting Started

### Prerequisites

- Node.js 16+
- npm or yarn
- Access to a running Planning System API
- API token for authentication

### Installation

1. Clone the repository
```bash
git clone https://github.com/talkingagents/agent-planner-mcp.git
cd agent-planner-mcp
```

2. Install dependencies
```bash
npm install
```

3. Configure environment variables
```bash
cp .env.example .env
```
Edit the `.env` file with your Planning System API information:
```
API_URL=http://localhost:3000
API_TOKEN=your_api_token_here
MCP_SERVER_NAME=planning-system-mcp
MCP_SERVER_VERSION=0.1.0
NODE_ENV=development
```

4. Start the server
```bash
npm start
```

## Using with Claude Desktop

To use this MCP server with Claude Desktop:

1. Add an entry to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "planning-system": {
      "command": "node",
      "args": [
        "/path/to/agent-planner-mcp/src/index.js"
      ],
      "env": {
        "API_URL": "http://localhost:3000",
        "API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

2. Restart Claude Desktop

3. The planning system tools and resources will be available in Claude

## Example Usage in Claude

Here are some example prompts you can use in Claude once the MCP server is connected:

### Using Resources

```
Please help me understand the structure of plan [plan_id]. You can use the MCP resources to access the plan details and structure.
```

### Using Tools

```
I need to create a new plan for my project. The title should be "Website Redesign" and it should include the following phases:
1. Research and Planning
2. Design
3. Development
4. Testing
5. Deployment

Please use the MCP tools to create this plan and set up the initial structure.
```

### Using Prompts

```
I'd like to analyze my plan [plan_id] to see if it's well-structured and complete. Can you use the analyze_plan prompt to help me?
```

## Development

### Project Structure

- `src/index.js` - Main entry point
- `src/resources.js` - MCP resources implementation
- `src/tools.js` - MCP tools implementation
- `src/prompts.js` - MCP prompts implementation
- `src/api-client.js` - Client for interacting with the Planning System API

### Running in Development Mode

```bash
npm run dev
```

This will start the server with nodemon, which automatically restarts the server when you make changes to the code.

## Troubleshooting

### Common Issues

- **Connection errors**: Make sure the Planning System API is running and accessible at the URL specified in your .env file.
- **Authentication errors**: Verify that your API token is valid and has the necessary permissions.
- **Transport errors**: Check that Claude Desktop is properly configured to run the MCP server.

### Debugging

Set the `NODE_ENV` environment variable to `development` for more verbose logging:

```bash
NODE_ENV=development npm start
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
