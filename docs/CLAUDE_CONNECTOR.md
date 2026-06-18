# Connecting AgentPlanner to MCP clients (Claude, ChatGPT, …)

MCP connectors (claude.ai / Claude Design, ChatGPT's Apps SDK, and any OAuth 2.1
MCP client) authenticate via the **MCP OAuth 2.1 handshake** — static
`Authorization: ApiKey` is rejected by these hosts (claude.ai shows *"couldn't
register with sign-in service."*). The hosted MCP runs a built-in OAuth 2.1
authorization server so it can be added as a custom connector. The same AS
serves every connector; client identity is handled per-connector via Dynamic
Client Registration (DCR).

## For users — add the connector

### claude.ai / Claude Design
1. **Settings → Connectors → Add custom connector**.
2. URL: `https://agentplanner.io/mcp`
3. **Connect** → AgentPlanner sign-in page → log in with your AgentPlanner email
   + password and authorize.
4. Claude can now call AgentPlanner tools (`list_plans`, `plan_analysis`,
   `task_context`, …) as you.

### ChatGPT (Apps SDK — Developer Mode)
ChatGPT only supports **remote** MCP servers (no stdio), so the hosted endpoint
is the path. Public listing requires OpenAI's app review; to use it now, an
account admin enables Developer Mode:
1. ChatGPT → **Settings → Apps & Connectors → Advanced → Developer Mode** (on).
2. **Apps & Connectors → Create / Add custom connector**.
3. URL: `https://agentplanner.io/mcp`
4. ChatGPT registers via DCR, sends you to the AgentPlanner sign-in/consent page,
   then calls tools as you. Its callback is
   `https://chatgpt.com/connector/oauth/{callback_id}` — already allowed by the
   `/oauth/` CSP `form-action` list (see Deployment §1).

> A **published ChatGPT App** (vs. a dev-mode connector) additionally needs per-
> tool `outputSchema` + impact annotations, HTML widget resources
> (`text/html;profile=mcp-app`), a unique `ui.domain`, widget CSP, and OpenAI
> submission review. That's a separate product surface — not required for
> tool-calling via Developer Mode.

No manual OAuth Client ID is needed for any connector — DCR handles it.
`ApiKey`/JWT header auth still works for Claude Desktop, Claude Code, and the CLI
— OAuth is additive.

## OAuth endpoints (served by the MCP container)

| Path | Purpose |
|---|---|
| `/.well-known/oauth-protected-resource/mcp` | RFC 9728 — points to the AS |
| `/.well-known/oauth-authorization-server` | RFC 8414 — AS metadata (advertises `code_challenge_methods_supported: [S256]`, `registration_endpoint`, public `none` auth method) |
| `/oauth/register` | RFC 7591 — Dynamic Client Registration |
| `/oauth/authorize` | Consent + AP login (renders sign-in page) |
| `/oauth/consent` | Form POST → authenticates via AP `/auth/login`, issues code |
| `/oauth/token` | Authorization Code + PKCE (S256) → access/refresh tokens |
| `/oauth/revoke` | RFC 7009 — revokes a refresh token (disconnect) |

The AS endpoints live under **`/oauth/*`**, NOT the OAuth-spec default root paths
— because `/register` would collide with the web UI's signup route. Discovery
metadata still sits at the standard root well-known paths and advertises the
`/oauth/*` endpoint URLs, so connectors resolve them automatically.

The 401 on `/mcp` carries `WWW-Authenticate: Bearer resource_metadata="…"` so
connectors discover the AS automatically.

## Token model

- **Access token** — a short-lived (1h) AgentPlanner JWT minted from the
  consenting user, validated statelessly on `/mcp`. It carries `aud =
  https://agentplanner.io/mcp` (the protected-resource `resource` identifier, RFC
  8707) so connectors that enforce resource indicators (ChatGPT Apps SDK) accept
  it. Override the audience with `OAUTH_RESOURCE` if the public origin differs.
- **Refresh token** — opaque (`apop_r_*`), SHA-256-hashed at rest, bound to the
  `client_id`, single-use (rotated on every refresh). Revoking it (RFC 7009, or
  disconnecting from Settings → Connections) kills the connection within the
  access-token TTL. **No AP credential is stored at rest.**

## Deployment requirements (IMPORTANT)

1. **nginx routing.** Proxy these to the MCP container:
   - `/.well-known/oauth-authorization-server`
   - `/.well-known/oauth-protected-resource` (prefix — covers the `/mcp` suffix)
   - `/oauth/` (authorize, token, register, consent, revoke)

   The `/oauth/` location overrides CSP with
   `form-action 'self' https://claude.ai https://chatgpt.com` so the consent →
   connector-callback 302 isn't blocked in strict browsers (Safari enforces
   `form-action`). **Add a connector's callback origin here before onboarding
   it.** These paths do NOT collide with the web UI's root routes (`/login`,
   `/register`, `/auth/callback`).

   > nginx config is a single-file bind mount; a `git pull` swaps the inode and
   > `nginx -s reload` reads stale config. Deploy nginx changes with
   > `up -d --force-recreate nginx`, not reload. (The deploy workflow does this.)

2. **Issuer env var.** Set `OAUTH_ISSUER_URL=https://agentplanner.io` on the MCP
   container (must be the public https origin). `API_URL` must point at the AP
   REST API for the consent login.

3. **Shared internal secret.** Set the SAME `MCP_INTERNAL_SECRET` on BOTH the
   backend (`agent-planner`) and the MCP container. The MCP OAuth server has no
   database — it persists DCR clients, PKCE codes, and refresh tokens via the
   backend's `/internal/oauth/*` endpoints, guarded by this secret. If unset,
   those endpoints return 503 and OAuth fails.

4. **Keep `/internal/*` private.** nginx must NOT expose `/internal/oauth/*`
   publicly — it's server-to-server only.

## Persistence

- **Postgres, no Redis.** DCR clients (`oauth_clients`), one-time PKCE codes
  (`oauth_auth_codes`, ~5 min TTL), and refresh tokens (`oauth_refresh_tokens`)
  live in the backend's existing Postgres (migrations `0023_oauth.sql`,
  `0024_oauth_refresh_tokens.sql`).
- **No long-lived credential at rest.** The access token is minted on demand from
  `user_id`; only the hashed, revocable refresh token is stored. A container
  restart never drops authenticated connections (access tokens are stateless).

## Flow

```
connector ─GET /mcp (no token)─▶ 401 + WWW-Authenticate(resource_metadata)
          ─GET /.well-known/oauth-protected-resource/mcp─▶ { authorization_servers:[issuer], resource }
          ─GET /.well-known/oauth-authorization-server─▶ { authorize, token, register, S256 }
          ─POST /register (DCR)─▶ client_id (public, no secret)
          ─GET /authorize?code_challenge=…─▶ AP sign-in + consent page
   user logs in ─POST /oauth/consent─▶ AP /auth/login ─▶ 302 redirect_uri?code=…
          ─POST /token (code + verifier)─▶ access_token (1h AP JWT, aud=resource) + refresh_token (opaque)
          ─POST /mcp  Authorization: Bearer <access_token>─▶ tools, acting as the user
          ─POST /oauth/revoke (or disconnect in-app)─▶ refresh token revoked
```
