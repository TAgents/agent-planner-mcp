# MCP v1.0.0 — Implementation Plan

Companion to `MCP_v1.0_FULL_SURFACE.md`. Per-tool task breakdown with acceptance criteria, dependencies, and ownership slots.

**Total:** 18 new tools across 6 categories. ~3 weeks single-track. Backend changes precede MCP tools (status enums, REST defaults).

---

## Phase A — Backend foundation (Days 1–2)

Prerequisite for every MCP tool that follows. Must land first.

### A1. Extend status enums on plans, goals, plan_nodes

- [ ] Add `draft` and `archived` to `plans.status` enum (Drizzle schema in `src/db/schema/plans.mjs`)
- [ ] Add `draft` and `archived` to `goals.status` enum (`src/db/schema/goals.mjs`)
- [ ] Confirm `plan_nodes.status` already supports `archived`; add if missing
- [ ] Generate Drizzle migration: `npm run db:generate`
- [ ] Review SQL, run `npm run db:migrate` in dev
- [ ] Smoke-test in dev: a row inserted with `status='draft'` reads back correctly

**Acceptance:** New enum values queryable; existing rows untouched.

### A2. REST creation endpoints accept `status` parameter

- [ ] `POST /api/plans` — accept optional `status`, default `active` for direct calls
- [ ] `POST /api/plans/:id/nodes` — same
- [ ] `POST /api/v2/goals` — same
- [ ] Validate enum values; reject unknown statuses with 400

**Acceptance:** REST calls without `status` behave as today. With `status='draft'`, row persists as draft.

### A3. Auto-promotion in update_task / update_goal

- [ ] In `update_task` handler: when transitioning a `draft` task via status change, log auto-promotion in `event_log`
- [ ] In `update_goal` handler: same for goals
- [ ] Update tests to cover draft → active path

**Acceptance:** A draft entity becomes active as a side effect of a meaningful status change. No new tool needed by callers.

### A4. Decision Queue API surfaces drafts

- [ ] Extend `GET /api/v2/decisions` response shape: items get `kind: 'decision' \| 'draft'` discriminator
- [ ] When `kind='draft'`, item includes `entity_type` (plan/goal/node), `entity_id`, `title`, `rationale`, `created_by_token_id`
- [ ] Add filter param: `?kind=decision|draft|all` (default: all)

**Acceptance:** Frontend can render drafts inline with decisions in Mission Control.

---

## Phase B — Goal creation (Day 3)

### B1. `derive_subgoal`

- [ ] Tool definition in `src/tools/bdi/desires.js` (next to `update_goal`)
- [ ] Reject if `parent_goal_id` is missing or unknown
- [ ] Reject if `parent_goal_id` belongs to a different organization than caller's token
- [ ] Inherit `organization_id` and `owner_id` from parent
- [ ] Default `status='active'`; accept `status='draft'`
- [ ] Integration test: agent creates sub-goal under existing parent, queries `goal_state(parent_goal_id)` and sees the new sub-goal in `linked_goals`

**Acceptance:** Agent can propose sub-goals without admin tooling. Top-level goal creation remains UI-only.

---

## Phase C — Plan creation + tree (Days 4–5)

### C1. `form_intention`

- [ ] Tool definition in `src/tools/bdi/intentions.js`
- [ ] Validate `goal_id` exists and caller has access
- [ ] Atomic transaction: create `plans` row → create root `plan_nodes` row → recursively create tree
- [ ] Validate tree shape: `phase` cannot have `phase` parent; tasks/milestones cannot have children of type `phase`
- [ ] Default `status='active'`, `visibility='private'`
- [ ] Return full plan + node IDs + tree shape mirroring input
- [ ] Integration test: agent creates plan with 3-level tree, queries `plan_analysis(type='critical_path')` and gets sane output

**Acceptance:** Agent can bootstrap an entire plan in one call.

### C2. `extend_intention`

- [ ] Tool definition in `src/tools/bdi/intentions.js`
- [ ] Validate `parent_id` exists and caller has `editor`+ access on the plan
- [ ] Reject if `parent_id` is itself a leaf task (would orphan the existing leaf semantically — clarify in error)
- [ ] Atomic insert of all children
- [ ] Default `status='active'`
- [ ] Integration test: agent decomposes a phase into 5 tasks, all visible via `task_context(parent_id, depth=2)`

**Acceptance:** Lightweight task decomposition without a decision-queue round-trip.

### C3. `propose_research_chain`

- [ ] Tool definition in `src/tools/bdi/intentions.js`
- [ ] Atomic creation: 3 task nodes (Research, Plan, Implement) under `parent_id` + 2 `blocks` dependency edges
- [ ] Set `task_mode` per node: `research`, `plan`, `implement`
- [ ] Acceptance criteria: research + plan compaction wires up via existing context engine
- [ ] Integration test: chain visible via `plan_analysis(type='critical_path')` with correct ordering

**Acceptance:** RPI shortcut equivalent to legacy `create_rpi_chain`.

---

## Phase D — Dependencies (Day 6)

### D1. `link_intentions`

- [ ] Tool definition in `src/tools/bdi/intentions.js`
- [ ] Reject if either task missing or in different plans
- [ ] Reuse cycle-detection recursive CTE from `dependenciesDal`
- [ ] Default `relation='blocks'`
- [ ] Integration test: agent creates A→B blocks, then attempts B→A — second call rejected with `cycle_detected` error

**Acceptance:** Agents can express ordering constraints without admin tooling.

### D2. `unlink_intentions`

- [ ] Tool definition in `src/tools/bdi/intentions.js`
- [ ] Validate dependency exists and caller has access to both endpoints
- [ ] Soft delete via existing dependency archive flag (or hard delete if no soft-delete column — confirm)
- [ ] Integration test: agent creates and unlinks; `plan_analysis(type='critical_path')` reflects removal

**Acceptance:** Symmetry with `link_intentions`.

---

## Phase E — Mutation tools (Days 7–9)

### E1. `update_plan`

- [ ] Tool definition in `src/tools/bdi/intentions.js` (beliefs file is wrong category — plans are intention-shaped)
- [ ] Accept partial fields: title, description, status, visibility, github_repo_url, metadata
- [ ] `metadata` does shallow merge, not replace
- [ ] Reject `status='active'` from `'archived'` without explicit `restore=true` flag (prevents accidental un-archiving)
- [ ] Integration test: agent renames a plan, updates description, changes visibility — single call

**Acceptance:** No plan property requires the UI to edit.

### E2. `update_node`

- [ ] Tool definition in `src/tools/bdi/intentions.js`
- [ ] Accept partial fields: title, description, node_type, task_mode, agent_instructions, acceptance_criteria, metadata
- [ ] Reject `node_type` change if node has children
- [ ] `metadata` does shallow merge
- [ ] Status changes routed through `update_task` (note in tool description)
- [ ] Integration test: agent edits agent_instructions on a task, retrieves via `task_context(depth=1)` and sees the change

**Acceptance:** No node property requires the UI to edit.

### E3. `move_node`

- [ ] Tool definition in `src/tools/bdi/intentions.js`
- [ ] Validate `new_parent_id` is in same plan and would not create a cycle
- [ ] Update `parent_id` and `order_index` (renumber siblings if `position` provided)
- [ ] Integration test: agent reparents a task under a different phase, `plan_analysis(type='critical_path')` reflects the new ordering

**Acceptance:** Tree restructuring possible without UI drag-drop.

### E4. `delete_plan`

- [ ] Tool definition in `src/tools/bdi/intentions.js`
- [ ] Soft delete: set `status='archived'` + write reason to `event_log`
- [ ] Cascade: archive all child plan_nodes
- [ ] Reject if caller is not plan owner or org admin
- [ ] Integration test: archived plan disappears from `briefing()` but recoverable via `update_plan({status: 'active'})`

**Acceptance:** Soft-delete parity with UI.

### E5. `delete_node`

- [ ] Tool definition in `src/tools/bdi/intentions.js`
- [ ] Soft delete: set `status='archived'`
- [ ] Default `cascade_children=true`
- [ ] Reject if node is the plan root
- [ ] Integration test: agent archives a phase with 3 child tasks; all 4 nodes archived, recoverable

**Acceptance:** Soft-delete parity with UI.

---

## Phase F — Sharing + collaboration (Days 10–11)

### F1. `share_plan`

- [ ] Tool definition in `src/tools/bdi/intentions.js`
- [ ] Atomic: visibility change + add/remove collaborators in one call
- [ ] Use existing `collaboratorsDal` + invite flow
- [ ] If `add_collaborators` includes an email not in any org, send invite email (reuse existing invite flow)
- [ ] Integration test: agent shares plan with two emails (one existing user, one new) and changes visibility to `unlisted`

**Acceptance:** Plan sharing without UI.

### F2. `invite_member`

- [ ] Tool definition in `src/tools/bdi/desires.js` (or new `organization.js` BDI file)
- [ ] Validate caller is org admin
- [ ] Reuse existing invite flow + email sending
- [ ] Default `role='member'`
- [ ] Integration test: agent invites email, `pending_invites` row created, email sent

**Acceptance:** Org membership management without UI.

### F3. `update_member_role`

- [ ] Tool definition in `src/tools/bdi/desires.js`
- [ ] Validate caller is org admin
- [ ] Reject demoting the last admin
- [ ] Integration test: agent promotes a member to admin and back

**Acceptance:** Role management without UI.

### F4. `remove_member`

- [ ] Tool definition in `src/tools/bdi/desires.js`
- [ ] Validate caller is org admin
- [ ] Reject removing self if last admin
- [ ] Reassign owned plans to remaining admin (or surface a `queue_decision` if ambiguous)
- [ ] Integration test: agent removes a member with 2 owned plans; plans reassigned, member detached

**Acceptance:** Member removal without UI; orphan plans handled.

---

## Phase G — Documentation (Day 12)

### G1. SKILL.md update

- [ ] Add "Creating new work" section between "Reading state" and "Executing work"
- [ ] Add "Editing structure" section
- [ ] Add "Sharing and collaboration" section
- [ ] Document the human-steering flow scenarios A/B/C from the spec
- [ ] Update tool-call examples to match v1.0 surface

### G2. AGENT_GUIDE.md update

- [ ] Add quick-reference card entries for all 18 new tools
- [ ] Document the `status='draft'` opt-in for autonomous loops

### G3. MIGRATION_v0.9.md → MIGRATION_v1.0.md

- [ ] Rename file
- [ ] Remove "call REST directly" guidance for creation tools (the gap is closed)
- [ ] Add v0.9 → v1.0 migration: no breaking changes, all v0.9 tools still work
- [ ] Document new tools alongside legacy mappings
- [ ] Note that the deferred `ap_admin_*` namespace is no longer planned — admin operations stay REST-only

### G4. README.md refresh

- [ ] Update tool count (15 → 33)
- [ ] Add full-surface section
- [ ] Update install snippet to v1.0.0

---

## Phase H — Dogfood + ship (Days 13–15)

### H1. Self-hosted dogfood test

- [ ] Run AgentPlanner UI redesign work *only* through agent conversation (Cowork or Claude Code session)
- [ ] No UI clicks except inspection
- [ ] Track failure modes in a real-time log
- [ ] Fix every blocker discovered

### H2. Cowork integration verification

- [ ] Update Cowork's MCP integration to v1.0.0
- [ ] Verify scheduled task autopilot still works (briefing-driven loop)
- [ ] Verify any creation flows in Cowork now use new tools

### H3. Release

- [ ] Tag v1.0.0
- [ ] Build `.mcpb` and verify in Claude Desktop
- [ ] Publish npm `agent-planner-mcp@1.0.0`
- [ ] GitHub release with changelog
- [ ] Update agentplanner.io docs page (if exists)

---

## Cross-cutting requirements

### Audit trail
Every mutation tool writes a row to `tool_calls` (depends on UI redesign Phase 0). Until that table exists, mutations log to `event_log` with the agent's token_id.

### Authority checks
Every tool reuses `planAccess.middleware.js` semantics: `viewer` reads, `editor` mutates, `admin` deletes/shares. Token's effective role is checked per call.

### Error shapes
All MCP tools return errors in the v0.9 BDI shape: `{error: {code, message, details}}`. New error codes:
- `cycle_detected` — `link_intentions` cycle reject
- `tree_shape_invalid` — `form_intention` shape validation fail
- `restore_required` — un-archiving without explicit `restore=true`
- `last_admin` — `remove_member` / `update_member_role` last-admin guard

### Integration test environment
Add a `tests/integration/v1-mutations.test.js` file. Spin up a dev API + MCP server, exercise every new tool, assert state via v0.9 read tools.

---

## Dependency on UI redesign plan

This work is now an **upstream blocker** for the UI Redesign Phase 1 (Connection Flow). The onboarding promise "your agent is live and can plan work for you" only delivers if v1.0 has shipped. Sequencing should be:

1. UI Redesign Phase 0 (Foundation, especially `tool_calls` table) — 1 week
2. **MCP v1.0.0** (this plan) — 3 weeks
3. UI Redesign Phase 1 (Connection Flow) — 1.5 weeks
4. UI Redesign Phases 2–5 — proceed as planned

Total calendar to a shipped redesign: ~9 weeks (was 6 — the MCP work adds 3 weeks).

This is the right order — no point telling new users "your agent can plan work for you" before the agent actually can.
