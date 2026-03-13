# Deployment Summary - Planning Tools MCP Server

## Deployment Status: ✅ SUCCESSFUL

**Deployed:** November 23, 2025
**Region:** europe-north1 (Finland)
**Service URL:** https://planning-tools-mcp-75rp6ehpra-lz.a.run.app

---

## Service Endpoints

| Endpoint | URL | Description |
|----------|-----|-------------|
| **Health Check** | `https://planning-tools-mcp-75rp6ehpra-lz.a.run.app/health` | Server status and session statistics |
| **MCP Endpoint** | `https://planning-tools-mcp-75rp6ehpra-lz.a.run.app/mcp` | Main MCP JSON-RPC endpoint |

---

## Verification Tests

### ✅ Health Check
```bash
curl https://planning-tools-mcp-75rp6ehpra-lz.a.run.app/health
```

**Response:**
```json
{
  "status": "ok",
  "version": "2025-03-26",
  "server": {
    "name": "planning-tools",
    "version": "0.3.1"
  },
  "sessions": {
    "total": 0,
    "initialized": 0
  }
}
```

### ✅ MCP Initialize
```bash
curl -X POST https://planning-tools-mcp-75rp6ehpra-lz.a.run.app/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-03-26" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {"tools": {}},
      "clientInfo": {"name": "test-client", "version": "1.0.0"}
    }
  }'
```

**Response includes:**
- HTTP 200 status
- `Mcp-Session-Id` header with UUID
- JSON-RPC result with server capabilities

### ✅ Tools Listing
All **18 planning tools** are available and responding correctly.

---

## Configuration

### Container Image
- **Registry:** `europe-north1-docker.pkg.dev/ta-agent-planner/agent-platform/planning-tools-mcp`
- **Tags:** `latest`, `<build-specific-tag>`

### Cloud Run Settings
- **Memory:** 512Mi
- **CPU:** 1
- **Min Instances:** 0 (scales to zero)
- **Max Instances:** 10
- **Timeout:** 300 seconds
- **Port:** 8080

### Environment Variables
```bash
NODE_ENV=production
MCP_TRANSPORT=http
MCP_SERVER_NAME=planning-tools
MCP_SERVER_VERSION=0.3.1
```

### Secrets (from Secret Manager)
- `API_URL` → `AGENT_PLANNER_API_URL:latest`
- `USER_API_TOKEN` → `AGENT_PLANNER_API_TOKEN:latest`

---

## IAM Policy

**Access:** Public (unauthenticated)

The service has been configured to allow unauthenticated access for use with Anthropic's MCP Connector:

```bash
gcloud run services add-iam-policy-binding planning-tools-mcp \
  --region=europe-north1 \
  --member="allUsers" \
  --role="roles/run.invoker" \
  --project=ta-agent-planner
```

**Note:** The IAM policy step has been added to `cloudbuild.yaml` for future deployments.

---

## Deployment Issues Resolved

### Issue 1: Empty Image Tag Variable
**Problem:** `$COMMIT_SHA` was empty when running `gcloud builds submit` directly.

**Solution:** Changed to use Cloud Build substitutions with default values:
```yaml
substitutions:
  _IMAGE_TAG: 'latest'
```

### Issue 2: 403 Forbidden on Health Endpoint
**Problem:** Service deployed successfully but returned 403 Forbidden when accessed.

**Root Cause:** The `--allow-unauthenticated` flag in Cloud Run deployment doesn't automatically create the IAM policy binding.

**Solution:** Added explicit IAM policy binding step to Cloud Build pipeline (see `cloudbuild.yaml` line 53-66).

---

## Cloud Build Pipeline

The deployment is automated via `cloudbuild.yaml`:

1. **Build:** Docker image from `Dockerfile`
2. **Push:** Image to Artifact Registry with two tags
3. **Deploy:** Service to Cloud Run with configuration
4. **IAM Policy:** Set `allUsers` as invoker (allows unauthenticated access)

**To deploy:**
```bash
./deploy.sh
```

Or manually:
```bash
gcloud builds submit --config cloudbuild.yaml . --project=ta-agent-planner
```

---

## Monitoring

### View Logs
```bash
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=planning-tools-mcp" \
  --limit=50 \
  --project=ta-agent-planner
```

### View Service Details
```bash
gcloud run services describe planning-tools-mcp \
  --region=europe-north1 \
  --project=ta-agent-planner
```

### Health Monitoring
- **Endpoint:** `/health`
- **Metrics:** Total sessions, initialized sessions, server version
- **Cloud Run Metrics:** Available in GCP Console

---

## Next Steps

1. **Register in MCP Registry**
   - Follow guide in `MCP_REGISTRY.md`
   - Namespace: `io.github.talkingagents`
   - Server name: `planning-tools`

2. **Test with Anthropic Messages API**
   - Use `mcp_servers` parameter with service URL
   - Example in `HTTP_MODE.md` section "Integration Examples"

3. **Test with MCPRegistryClient**
   - Integrate with agent-runtime
   - Use for multi-agent systems

4. **Set Up Monitoring**
   - Cloud Run metrics dashboards
   - Log-based alerts for errors
   - Uptime monitoring

---

## Resources

- **HTTP Mode Documentation:** `HTTP_MODE.md`
- **MCP Registry Guide:** `MCP_REGISTRY.md`
- **README:** `README.md` (Transport Modes section)
- **Integration Tests:** `test-http-integration.js`
- **Deployment Script:** `deploy.sh`

---

## Support

For issues or questions:
- Check logs: `gcloud logging read ...`
- Verify service status: `gcloud run services describe ...`
- Test health endpoint: `curl .../health`
- Review documentation: `HTTP_MODE.md`, `MCP_REGISTRY.md`

---

## Service Information

**Project ID:** ta-agent-planner
**Region:** europe-north1 (Finland)
**Service Name:** planning-tools-mcp
**Protocol Version:** MCP 2025-03-26
**Server Version:** 0.3.1
**Tools Available:** 18 planning and task management tools
