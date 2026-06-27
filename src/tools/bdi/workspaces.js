/**
 * Workspaces and Blueprints — organizational structure tools.
 *
 * Workspace = live folder under an Organization (owns goals + plans).
 * Blueprint = dehydrated reusable shape, forks into a Workspace or Plan.
 *
 * v1 supports plan-scope blueprints only. See
 * agent-planner/docs/WORKSPACE_BLUEPRINT_SKETCH.md for the design.
 */

const { asOf, formatResponse, errorResponse, safeArray, apiErrorMessage } = require('./_shared');

// ─── Workspaces ──────────────────────────────────────────────────

const listWorkspacesDefinition = {
  name: 'list_workspaces',
  description:
    "List workspaces in an organization. A workspace is a folder that owns " +
    "goals + plans. Returns archived workspaces only when include_archived=true.",
  inputSchema: {
    type: 'object',
    properties: {
      organization_id: { type: 'string', description: "Required. Organization to scope to." },
      include_archived: { type: 'boolean', default: false },
    },
    required: ['organization_id'],
  },
};

async function listWorkspacesHandler(args, apiClient) {
  const { organization_id, include_archived } = args;
  try {
    const data = await apiClient.workspaces.list({
      organizationId: organization_id,
      includeArchived: include_archived === true,
    });
    return formatResponse({
      as_of: asOf(),
      workspaces: safeArray(data.workspaces || data),
    });
  } catch (err) {
    return errorResponse('upstream_unavailable', `list_workspaces failed: ${err.message}`);
  }
}

const createWorkspaceDefinition = {
  name: 'create_workspace',
  description:
    "Create a new workspace inside an organization. Returns the new workspace " +
    "row. The slug is auto-generated from the title and de-duplicated within " +
    "the org.",
  inputSchema: {
    type: 'object',
    properties: {
      organization_id: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      icon: { type: 'string', description: "Optional emoji or icon token." },
      slug: { type: 'string', description: "Optional. Auto-generated from title if omitted." },
    },
    required: ['organization_id', 'title'],
  },
};

async function createWorkspaceHandler(args, apiClient) {
  const { organization_id, title, description, icon, slug } = args;
  try {
    const ws = await apiClient.workspaces.create({
      organization_id,
      title,
      description,
      icon,
      slug,
    });
    return formatResponse({ as_of: asOf(), workspace: ws });
  } catch (err) {
    const upstream = err.response?.data?.error || err.message;
    return errorResponse('create_failed', `create_workspace failed: ${upstream}`);
  }
}

// ─── Blueprints ──────────────────────────────────────────────────

const listBlueprintsDefinition = {
  name: 'list_blueprints',
  description:
    "List blueprints visible to the user (owned + public/unlisted). Filter by " +
    "scope ('plan' or 'workspace'), visibility, or owner_only=true.",
  inputSchema: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['plan', 'workspace'] },
      visibility: { type: 'string', enum: ['private', 'public', 'unlisted'] },
      owner_only: { type: 'boolean', default: false },
    },
  },
};

async function listBlueprintsHandler(args, apiClient) {
  try {
    const data = await apiClient.blueprints.list({
      scope: args.scope,
      visibility: args.visibility,
      ownerOnly: args.owner_only === true,
    });
    return formatResponse({
      as_of: asOf(),
      blueprints: safeArray(data.blueprints || data),
    });
  } catch (err) {
    return errorResponse('upstream_unavailable', `list_blueprints failed: ${err.message}`);
  }
}

const forkBlueprintDefinition = {
  name: 'fork_blueprint',
  description:
    "Fork a plan-scope blueprint into a target workspace. Creates a new plan " +
    "inside that workspace with the blueprint's structure (nodes, " +
    "dependencies, agent_instructions). All node statuses reset to " +
    "'not_started'. The new plan's forked_from_blueprint_id records lineage.",
  inputSchema: {
    type: 'object',
    properties: {
      blueprint_id: { type: 'string' },
      workspace_id: { type: 'string', description: "Target workspace the new plan will land in." },
      title: { type: 'string', description: "Optional title override for the new plan." },
    },
    required: ['blueprint_id', 'workspace_id'],
  },
};

async function forkBlueprintHandler(args, apiClient) {
  const { blueprint_id, workspace_id, title } = args;
  try {
    const newPlan = await apiClient.blueprints.fork(blueprint_id, {
      workspace_id,
      title,
    });
    return formatResponse({
      as_of: asOf(),
      plan_id: newPlan.id,
      workspace_id,
      forked_from_blueprint_id: newPlan.forkedFromBlueprintId || blueprint_id,
      title: newPlan.title,
      next_step:
        "Plan is in status='draft'. Open it, claim a task, or promote to 'active' once ready to execute.",
    });
  } catch (err) {
    const upstream = err.response?.data?.error || err.message;
    return errorResponse('fork_failed', `fork_blueprint failed: ${upstream}`);
  }
}

const saveAsBlueprintDefinition = {
  name: 'save_as_blueprint',
  description:
    "Snapshot a live plan as a new plan-scope blueprint. Captures structure, " +
    "agent_instructions, and dependencies. Excludes run-state (statuses, " +
    "claims, knowledge episodes, logs, decisions, agent assignments).",
  inputSchema: {
    type: 'object',
    properties: {
      plan_id: { type: 'string' },
      title: { type: 'string', description: "Optional. Defaults to the source plan's title." },
      description: { type: 'string' },
      visibility: { type: 'string', enum: ['private', 'public', 'unlisted'], default: 'private' },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['plan_id'],
  },
};

async function saveAsBlueprintHandler(args, apiClient) {
  const { plan_id, title, description, visibility, tags } = args;
  try {
    const bp = await apiClient.blueprints.saveFromPlan(plan_id, {
      title,
      description,
      visibility,
      tags,
    });
    return formatResponse({
      as_of: asOf(),
      blueprint_id: bp.id,
      scope: bp.scope,
      visibility: bp.visibility,
      node_count: bp.payload?.nodes?.length ?? null,
      dependency_count: bp.payload?.dependencies?.length ?? null,
      next_step: bp.visibility === 'private'
        ? "Blueprint saved privately. Share it via update visibility to 'public' or 'unlisted', or fork it directly via fork_blueprint."
        : "Blueprint published. Anyone with the link (unlisted) or via discovery (public) can fork it.",
    });
  } catch (err) {
    const upstream = err.response?.data?.error || err.message;
    return errorResponse('snapshot_failed', `save_as_blueprint failed: ${upstream}`);
  }
}

const deleteBlueprintDefinition = {
  name: 'delete_blueprint',
  description:
    "Delete a blueprint you own. Hard delete (the snapshot is removed); plans " +
    "already forked from it are unaffected. Owner-only. Completes the blueprint " +
    "lifecycle alongside save_as_blueprint and fork_blueprint.",
  inputSchema: {
    type: 'object',
    properties: {
      blueprint_id: { type: 'string' },
    },
    required: ['blueprint_id'],
  },
};

async function deleteBlueprintHandler(args, apiClient) {
  const { blueprint_id } = args;
  if (!blueprint_id) {
    return errorResponse('invalid_arg', 'delete_blueprint requires blueprint_id');
  }
  try {
    await apiClient.blueprints.delete(blueprint_id);
    return formatResponse({ as_of: asOf(), blueprint_id, deleted: true });
  } catch (err) {
    const status = err.response?.status;
    if (status === 404) return errorResponse('not_found', `Blueprint ${blueprint_id} not found`);
    if (status === 403) return errorResponse('forbidden', 'Only the owner can delete this blueprint');
    return errorResponse('upstream_unavailable', `delete_blueprint failed: ${apiErrorMessage(err)}`);
  }
}

module.exports = {
  definitions: [
    listWorkspacesDefinition,
    createWorkspaceDefinition,
    listBlueprintsDefinition,
    forkBlueprintDefinition,
    saveAsBlueprintDefinition,
    deleteBlueprintDefinition,
  ],
  handlers: {
    list_workspaces: listWorkspacesHandler,
    create_workspace: createWorkspaceHandler,
    list_blueprints: listBlueprintsHandler,
    fork_blueprint: forkBlueprintHandler,
    save_as_blueprint: saveAsBlueprintHandler,
    delete_blueprint: deleteBlueprintHandler,
  },
};
