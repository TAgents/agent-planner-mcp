# Connecting AgentPlanner to claude.ai / Claude Design

claude.ai connectors (including Claude Design) authenticate via the **MCP OAuth
2.1 handshake** — static `Authorization: ApiKey` is rejected with
*"couldn't register with sign-in service."* The hosted MCP now runs a built-in
OAuth 2.1 authorization server (via the MCP SDK's `mcpAuthRouter`) so it can be
added as a custom connector.

## For users — add the connector

1. claude.ai → **Settings → Connectors → Add custom connector**.
2. URL: `https://agentplanner.io/mcp`
3. Click **Connect**. You'll be taken to an AgentPlanner sign-in page — log in
   with your AgentPlanner email + password and authorize.
4. The connector now appears in Claude Design's connector list. Claude can call
   AgentPlanner tools (`list_plans`, `plan_analysis`, `task_context`, …) as you.

No manual OAuth Client ID is needed — Dynamic Client Registration handles it.

`ApiKey`/JWT header auth still works for Claude Desktop, Claude Code, and the
CLI — OAuth is additive.

## OAuth endpoints (served by the MCP container)

| Path | Purpose |
|---|---|
| `/.well-known/oauth-protected-resource/mcp` | RFC 9728 — points to the AS |
| `/.well-known/oauth-authorization-server` | RFC 8414 — AS metadata |
| `/register` | RFC 7591 — Dynamic Client Registration |
| `/authorize` | Consent + AP login (renders sign-in page) |
| `/oauth/consent` | Form POST → authenticates via AP `/auth/login`, issues code |
| `/token` | Authorization Code + PKCE (S256) → access/refresh tokens |
| `/revoke` | Token revocation |

The 401 on `/mcp` carries `WWW-Authenticate: Bearer resource_metadata="…"` so
connectors discover the AS automatically.

## Deployment requirements (IMPORTANT)

1. **nginx routing.** These OAuth paths live at the **domain root**, but nginx
   currently proxies only `/mcp` to the MCP container. Add proxy rules so the
   MCP container also receives:
   - `/.well-known/oauth-authorization-server`
   - `/.well-known/oauth-protected-resource` (and `/.well-known/oauth-protected-resource/mcp`)
   - `/register`, `/authorize`, `/token`, `/revoke`, `/oauth/consent`

   Without this, `claude.ai` hits the frontend (not the MCP server) when
   resolving discovery metadata and the connector cannot register. (Update the
   nginx config in `agent-planner-devops`.)

2. **Issuer env var.** Set `OAUTH_ISSUER_URL=https://agentplanner.io` on the MCP
   container (defaults to `https://agentplanner.io`; must be the public origin
   over https). `API_URL` must point at the AP REST API for the consent login.

3. **Shared internal secret.** Set the SAME `MCP_INTERNAL_SECRET` on BOTH the
   backend (`agent-planner`) and the MCP container. The MCP OAuth server has no
   database — it persists DCR clients + PKCE codes via the backend's
   `/internal/oauth/*` endpoints, which are guarded by this secret. If it's
   unset, those endpoints return 503 and OAuth registration fails.

4. **Keep `/internal/*` private.** nginx must NOT expose `/internal/oauth/*`
   publicly — it's server-to-server only (the shared secret is defense-in-depth,
   not the only line).

## Persistence

- **Postgres, no Redis.** DCR clients (`oauth_clients`) and one-time PKCE codes
  (`oauth_auth_codes`, ~5 min TTL) live in the backend's existing Postgres
  (migration `0023_oauth.sql`).
- **No token table.** The OAuth `access_token` IS the user's AP JWT, so `/mcp`
  validates it statelessly and a container restart never drops authenticated
  connections. OAuth refresh maps to the backend `/auth/refresh`.
- **Hardening follow-ups:** the auth-code row holds a short-lived AP JWT (≤5 min,
  deleted on use) — consider encrypting it at rest or minting at consume; and
  bind refresh tokens to `client_id`.

## Flow

```
claude.ai ──GET /mcp (no token)──▶ 401 + WWW-Authenticate(resource_metadata)
          ──GET /.well-known/oauth-protected-resource/mcp──▶ { authorization_servers:[issuer] }
          ──GET /.well-known/oauth-authorization-server──▶ { authorize, token, register, S256 }
          ──POST /register (DCR)──▶ client_id (public, no secret)
          ──GET /authorize?code_challenge=…──▶ AP sign-in + consent page
   user logs in ─POST /oauth/consent─▶ AP /auth/login ─▶ 302 redirect_uri?code=…
          ──POST /token (code + verifier)──▶ access_token (opaque) + refresh_token
          ──POST /mcp  Authorization: Bearer <access_token>──▶ tools, acting as the user
```
