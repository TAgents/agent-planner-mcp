#!/bin/bash

# Deployment script for planning-tools MCP Server to Google Cloud Run
# Region: europe-north1 (Finland)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-"ta-agent-planner"}
REGION="europe-north1"
SERVICE_NAME="planning-tools-mcp"
REPOSITORY="agent-platform"

echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Planning Tools MCP Server Deployment            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Verify project ID
echo -e "\n${YELLOW}Project ID:${NC} $PROJECT_ID"
read -p "Is this correct? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Deployment cancelled${NC}"
    exit 1
fi

# Set project
echo -e "\n${YELLOW}Setting GCP project...${NC}"
gcloud config set project $PROJECT_ID

# Check if Artifact Registry repository exists
echo -e "\n${YELLOW}Checking Artifact Registry...${NC}"
if ! gcloud artifacts repositories describe $REPOSITORY --location=$REGION &> /dev/null; then
    echo -e "${YELLOW}Creating Artifact Registry repository: $REPOSITORY${NC}"
    gcloud artifacts repositories create $REPOSITORY \
        --repository-format=docker \
        --location=$REGION \
        --description="Agent Platform container images"
fi

# Check if secrets exist
echo -e "\n${YELLOW}Checking secrets...${NC}"

if ! gcloud secrets describe AGENT_PLANNER_API_URL &> /dev/null; then
    echo -e "${YELLOW}Creating secret: AGENT_PLANNER_API_URL${NC}"
    read -p "Enter Agent Planner API URL: " API_URL
    echo -n "$API_URL" | gcloud secrets create AGENT_PLANNER_API_URL --data-file=-
fi

if ! gcloud secrets describe AGENT_PLANNER_API_TOKEN &> /dev/null; then
    echo -e "${YELLOW}Creating secret: AGENT_PLANNER_API_TOKEN${NC}"
    read -p "Enter Agent Planner API Token: " API_TOKEN
    echo -n "$API_TOKEN" | gcloud secrets create AGENT_PLANNER_API_TOKEN --data-file=-
fi

# Build and deploy using Cloud Build
echo -e "\n${YELLOW}Starting Cloud Build...${NC}"
gcloud builds submit --config cloudbuild.yaml .

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')

echo -e "\n${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Deployment Complete!                             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

echo -e "\n${GREEN}Service URL:${NC} $SERVICE_URL"
echo -e "${GREEN}MCP Endpoint:${NC} $SERVICE_URL/mcp"
echo -e "${GREEN}Health Check:${NC} $SERVICE_URL/health"
echo -e "${GREEN}IAM Policy:${NC} Configured (allUsers can invoke)"

echo -e "\n${YELLOW}Test the deployment:${NC}"
echo "curl $SERVICE_URL/health"

echo -e "\n${YELLOW}View logs:${NC}"
echo "gcloud logging read \"resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME\" --limit=50 --project=$PROJECT_ID"

echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Test the health endpoint"
echo "2. Test the MCP endpoint (see test-http-integration.js)"
echo "3. Register in MCP Registry (see MCP_REGISTRY.md)"
echo "4. Configure MCPRegistryClient to use this URL"
