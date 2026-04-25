# Migrating to v1.0.0 — Full BDI Mutation Surface

**Additive release.** v1.0.0 adds 9 new tools to the v0.9 surface, restoring agent-callable creation, mutation, deletion, sharing, and collaboration. The v0.9 read/update tools are unchanged. No breaking changes from v0.9.

If you're coming from v0.8.x, read [MIGRATION_v0.9.md](MIGRATION_v0.9.md) first — that's where the breaking change happened.

## Why v1.0

v0.9.0 shipped a clean read/update BDI surface but deferred all creation, mutation, deletion, and sharing to a future `ap_admin_*` namespace, with the guidance "call REST directly if you need them now."

That contradicts the AgentPlanner positioning: **agents drive, humans steer.** The "humans steer" part is supposed to happen *through agents* — a user tells their agent "mark this plan completed" or "create a plan to ship the redesign," and the agent executes via MCP. If MCP can only read and update tasks, every steering action requires the human to leave the conversation and use the UI.

v1.0.0 closes the gap. The UI becomes optional inspection, not the source of truth for actions.

## What's new (9 tools)

### Goal management (1 tool)

| Tool | Purpose |
|---|---|
| `derive_subgoal` | Propose a sub-goal under an existing parent. `parent_goal_id` is mandatory — top-level goals stay UI-only. |

### Plan / node creation (3 tools)

| Tool | Purpose |
|---|---|
| `form_intention` | Create plan + initial phase/task tree atomically under a goal |
| `extend_intention` | Add children under an existing phase or task (lightweight — no decision-queue gate) |
| `propose_research_chain` | Create Research → Plan → Implement triple with two blocking edges |

### Structural mutation (5 tools)

| Tool | Purpose |
|---|---|
| `update_plan` | Edit any plan property (title, description, status, visibility, metadata) |
| `update_node` | Edit any node property except status (which routes through `update_task`) |
| `move_node` | Reparent within plan; cycle-safe |
| `link_intentions` | Create dependency edge between two existing tasks |
| `unlink_intentions` | Remove a dependency edge by id |
| `delete_plan` | Soft-delete via `status='archived'` (recoverable) |
| `delete_node` | Soft-delete via `status='archived'` (recoverable) |

### Sharing & collaboration (4 tools)

| Tool | Purpose |
|---|---|
| `share_plan` | Atomic visibility + add/remove collaborators |
| `invite_member` | Add user to organization (by user_id or email) |
| `update_member_role` | Owner-only role change (admin/member) |
| `remove_member` | Owner/admin removes a non-owner member |

## The draft-status seam

Every creation tool accepts an optional `status` field. The default is **`active`** — agents acting on human direction don't bury work in drafts.

For autonomous loops where the agent decides to create something on its own, pass **`status='draft'`**. Drafts:

- Surface in the dashboard pending queue (`GET /api/dashboard/pending` returns them in a `drafts` array alongside decisions)
- Are visible to the plan/goal owner and any org members
- Auto-promote to `active` when work begins on any node (transition to `in_progress`/`completed`/`blocked`/`plan_ready`)
- Can be promoted explicitly via `update_plan({status: 'active'})` or `update_goal({status: 'active'})`
- Do not auto-expire — humans archive abandoned drafts via `update_*({status: 'archived'})`

This keeps autonomous agent creation reviewable without forcing a decision-queue trip for every routine action.

## The "call REST directly" guidance is removed

v0.9 told you to call the AgentPlanner REST API directly for creation. **Stop doing that.** Use the v1.0 tools instead — they have proper authority checks, the draft seam, atomic transactions, and audit logging.

If you maintained a wrapper around `axios.post('/plans', ...)`, replace it with `form_intention`. If you wrapped `/nodes`, use `extend_intention`. If you wrapped `/dependencies`, use `link_intentions`.

## What stays REST-only (not in v1.0)

These remain admin/identity-shaped and are deliberately not agent-callable:

- **Identity:** signup, login, password reset, MFA enrollment
- **Billing:** subscription changes, payment methods, invoices
- **Top-level goal creation:** strategic direction is human-set; agents derive sub-goals
- **Organization creation:** rare, identity-shaped
- **Hard delete:** soft delete (`status='archived'`) is reversible; hard delete requires REST + admin token

Anything else: agent-callable.

## Backend prerequisites (already shipped)

The agent-planner backend (commit `214c24b`) shipped Phase A foundation alongside v1.0:

- Status enums on `goals` and `plan_nodes` accept `draft` and `archived`
- `POST /api/goals` accepts `status` parameter
- `update_node` / `update_node_status` auto-promote a draft plan to active when work begins
- `GET /api/dashboard/pending` returns a `drafts` array (plan + goal drafts visible to the user)

If you self-host AgentPlanner, deploy the backend update before pointing clients at MCP v1.0.

## Cowork integration

If you have Cowork scheduled tasks using AgentPlanner, no changes required — your existing v0.9 calls still work. To take advantage of v1.0:

- Replace ad-hoc REST calls with the new tools
- Have your autopilot propose drafts (`status='draft'` on `form_intention` / `derive_subgoal`) so users can review on next briefing
- Use `extend_intention` instead of `queue_decision({proposed_subtasks})` for routine decomposition the agent has authority for

## Install

`.mcpb` (Claude Desktop): https://github.com/TAgents/agent-planner-mcp/releases/latest

`npx`:
```json
{
  "mcpServers": {
    "agentplanner": {
      "command": "npx",
      "args": ["-y", "agent-planner-mcp@1.0.0"],
      "env": { "API_URL": "https://agentplanner.io/api", "USER_API_TOKEN": "..." }
    }
  }
}
```

## Acceptance test

The bar for v1.0 was: **"a user can complete one full workday managing AgentPlanner only through agent conversation — no UI clicks except for inspection."**

Try it. Open a fresh chat, give your agent the API token, and run a real day's worth of planning, decomposition, status changes, sharing, and member changes through conversation alone. If you have to leave the conversation for something that should be agent-callable, file an issue.
