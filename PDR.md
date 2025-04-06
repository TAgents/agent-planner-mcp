# Planning System MCP Server: Technical Design Document

## System Overview

The Planning System MCP Server provides a Model Context Protocol (MCP) interface for AI agents to interact with the Planning System API. It enables LLM agents to access planning data, create and modify plans, and collaborate with humans through a standardized protocol. By implementing the MCP standard, this server allows AI assistants like Claude to directly interact with planning resources, tools, and prompts.

## Core Concepts

- **MCP Integration**: Model Context Protocol implementation for LLM agent access
- **Planning Resources**: Structured access to plan and node data
- **Agent Tools**: Functions that LLM agents can call to modify plans
- **Planning Prompts**: Pre-defined templates for common planning tasks
- **Human-AI Collaboration**: Seamless interaction between human and AI contributors

## Implementation Status

This project implements the MCP server interface for the Planning System API. The current status is:

- ✅ Initial project structure (completed)
- ✅ Planning resources definitions (completed)
- ✅ Tool implementations (completed)
- ✅ Prompt templates (completed)
- ✅ API integration (completed)
- ✅ Claude Desktop integration (completed)
- 🔄 Testing and optimization (in progress)
- 📋 Documentation updates (ongoing)

## MCP Server Design

### Resources

The MCP server exposes the following resources:

1. **Plans and Structure Resources**
   - `plans://list` - List of all plans accessible to the user
   - `plan://{planId}` - Plan details
   - `plan://{planId}/structure` - Hierarchical structure of the plan
   - `plan://{planId}/node/{nodeId}` - Specific node details
   
2. **Activity and Content Resources**
   - `plan://{planId}/activity` - Recent activity on a plan
   - `plan://{planId}/node/{nodeId}/comments` - Comments on a specific node
   - `plan://{planId}/node/{nodeId}/logs` - Log entries for a specific node
   - `plan://{planId}/node/{nodeId}/artifacts` - Artifacts attached to a specific node
   - `activity://global` - Recent activity across all plans

### Tools

1. **Plan Management Tools**
   - `create_plan` - Create a new plan
   - `update_plan` - Update plan details

2. **Node Management Tools**
   - `create_node` - Create a new node in a plan
   - `update_node_status` - Update the status of a node

3. **Collaboration Tools**
   - `add_comment` - Add a comment to a node
   - `add_log_entry` - Add a detailed activity log with metadata and tags
   - `add_artifact` - Add an artifact to a node
   - `search_plan` - Search within a plan

### Prompts

1. **Planning Assistance**
   - `analyze_plan` - Analyze a plan for completeness, organization, and potential issues
   - `suggest_improvements` - Suggest improvements for a plan or node
   - `generate_implementation_steps` - Generate detailed implementation steps for a task

2. **Status Report Generation**
   - `summarize_plan` - Generate a concise summary of a plan
   - `generate_status_report` - Generate a status report for a plan

## Integration with Claude Desktop

The server has been successfully integrated with Claude Desktop. This allows Claude to:

1. **Access planning resources** - View plans, their structure, and details about specific nodes
2. **Create and modify plans** - Create new plans and add nodes (phases, tasks, milestones)
3. **Collaborate with humans** - Add comments, log entries, and artifacts to nodes
4. **Use specialized planning prompts** - Analyze plans, suggest improvements, and generate reports

### Configuration for Claude Desktop

The server is properly configured to work with Claude Desktop through:

- **Authentication setup** - JWT token authentication with the backend Planning System API
- **Environment configuration** - Appropriate environment variables for API communication
- **Transport configuration** - Stdio transport for local process communication

### Authentication Flow

The authentication system has been implemented using:

1. User registration and login through the Planning System API
2. JWT token generation with proper user ID and signature
3. Token validation in the Planning System API
4. Token management in both MCP server and Claude Desktop configurations

## Design Principles for Agent-Human Integration

### 1. Contextual Richness

Agents require rich context to operate effectively. The MCP server provides:
- Comprehensive plan structures
- Historical context and activity logs
- Relationship information between nodes
- Task dependencies and requirements
- Acceptance criteria and expected outcomes

### 2. Clear Instructions

For each operation, the MCP server provides:
- Explicit documentation for tools and resources
- Detailed schema validation
- Error messages with actionable feedback
- Examples within prompt templates

### 3. Progress Tracking

The MCP server enables agents to:
- Report incremental progress
- Log their reasoning and decision process
- Record challenges encountered
- Document resources used or created

### 4. Consistent Data Format

The MCP server enforces:
- Standardized resource formats
- Consistent tool schemas and response patterns
- Structured prompt templates
- Markdown formatting for text content

## Current Capabilities

The MCP server currently provides the following key functionality:

1. **Plan Creation and Management**
   - Creating new plans with title, description, and status
   - Updating existing plan properties

2. **Node Hierarchy Management**
   - Creating phases, tasks, and milestones
   - Establishing parent-child relationships
   - Managing node status (not_started, in_progress, completed, blocked)

3. **Collaboration Features**
   - Adding comments to nodes from both humans and AI agents
   - Creating detailed log entries with categorization by type
   - Attaching artifacts with metadata to nodes
   - Recording activity across the planning system

4. **Contextual Information**
   - Viewing full plan structures with hierarchy
   - Accessing detailed node information including context and instructions
   - Tracking historical activity and changes

## Challenges and Solutions

### Authentication Challenges

**Challenge**: Establishing proper authentication between the MCP server and Planning System API.

**Solution**: Implemented a robust token generation and management system that:
1. Uses real user accounts in the Planning System
2. Generates JWT tokens with the correct signing key
3. Handles token renewal and management
4. Respects database row-level security policies

### Resource Access Control

**Challenge**: Ensuring proper access control for plan resources.

**Solution**:
1. User context is maintained throughout all API requests
2. Row-level security in the database ensures proper access control
3. All resource requests are authenticated before processing

## Future Enhancements

### Phase 1: Optimization and Reliability (Next Steps)
- Implement caching for resource data
- Add comprehensive error handling and recovery mechanisms
- Optimize performance for large plans
- Enhance search functionality

### Phase 2: Advanced Collaboration Features
- Add real-time updates via WebSockets
- Implement notification systems
- Enhance commenting with threading and reactions
- Add more sophisticated artifact handling

### Phase 3: AI Agent Specialization
- Create role-specific prompt templates
- Add agentic workflows for common planning tasks
- Implement contextual memory for long-running tasks
- Add support for multi-agent collaboration

## Technical Architecture

The MCP server uses the following architecture:

1. **Transport Layer**
   - Standard Input/Output (stdio) for local process communication
   - Ready for HTTP with Server-Sent Events (SSE) implementation

2. **Protocol Layer**
   - JSON-RPC 2.0 message format
   - Request/response handling
   - Notification support

3. **Feature Layer**
   - Resource providers (plans, nodes, activities)
   - Tool implementations (CRUD operations, search)
   - Prompt templates (analysis, reporting)

4. **API Integration Layer**
   - Planning System API client
   - JWT authentication handling
   - Data transformation and formatting

## Technical Stack

- **MCP Implementation**: MCP JavaScript SDK (TypeScript)
- **API Client**: Axios for Planning System API integration
- **Authentication**: JWT token handling with proper signature validation
- **Data Handling**: JSON Schema validation for input/output
- **Documentation**: JSDoc and Markdown

## Security Considerations

- Secure handling of authentication tokens
- Validation of all inputs and outputs
- Clear permissions model based on Planning System user roles
- Secure transport configuration
- Audit logging of agent actions

This document reflects the current implementation status of the Planning System MCP Server, which provides a functional interface between AI agents and the Planning System API. The successful integration with Claude Desktop demonstrates the feasibility of human-AI collaboration in the planning process.
