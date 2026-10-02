// TYPES
import type { Organisation } from '#lib/db/zod/schema/organisation.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'
import type { Resource } from '#lib/types.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { Hub } from '#lib/db/zod/schema/hub.types.js'
import type { Task } from '#lib/db/zod/index.js'

/* ----------------- */
// GUARDS
/* -------- */

// Type guard to narrow the type
/**
 * Narrows a resource union to organisation/project resources.
 * Used when logic depends on code-based references shared by these resource types.
 * @param resource Resource to inspect.
 * @returns Whether the resource matches the narrowed resource type.
 * @remarks Uses the existing structural field checks; does not validate a payload.
 */
function isOrganisationOrProject(
  resource: Resource,
): resource is Organisation | Project {
  return 'code' in resource
}

// Type guards for resource types
/**
 * Type guard for organisation resources.
 * Used to safely access organisation-only fields in generic resource handlers.
 * @param resource Resource to inspect.
 * @returns Whether the resource matches the narrowed resource type.
 * @remarks Uses the existing structural field checks; does not validate a payload.
 */
function isOrganisation(resource: Resource): resource is Organisation {
  return (
    !('organisationId' in resource) &&
    !('layerId' in resource) &&
    !('featureId' in resource) &&
    !('projectId' in resource) &&
    'userRoles' in resource
  )
}

/**
 * Type guard for project resources.
 * Used to safely branch into project-specific processing paths.
 * @param resource Resource to inspect.
 * @returns Whether the resource matches the narrowed resource type.
 * @remarks Uses the existing structural field checks; does not validate a payload.
 */
function isProject(resource: Resource): resource is Project {
  return (
    'organisationId' in resource &&
    !('projectId' in resource) &&
    !('domain' in resource)
  )
}

/**
 * Type guard for layer resources.
 * Used when consuming hierarchical resources with layer-specific fields.
 * @param resource Resource to inspect.
 * @returns Whether the resource matches the narrowed resource type.
 * @remarks Uses the existing structural field checks; does not validate a payload.
 */
function isLayer(resource: Resource): resource is Layer {
  return 'projectId' in resource && !('layerId' in resource)
}

/**
 * Type guard for feature resources.
 * Used to narrow union types before feature-specific operations.
 * @param resource Resource to inspect.
 * @returns Whether the resource matches the narrowed resource type.
 * @remarks Uses the existing structural field checks; does not validate a payload.
 */
export function isFeature(resource: Resource): resource is Feature {
  return 'layerId' in resource && !('featureId' in resource)
}

/**
 * Type guard for hub resources.
 * Used by generic resource utilities that branch by first-class type.
 * @param resource Resource to inspect.
 * @returns Whether the resource matches the narrowed resource type.
 * @remarks Uses the existing structural field checks; does not validate a payload.
 */
function isHub(resource: Resource): resource is Hub {
  return 'organisation' in resource && 'domain' in resource
}

/**
 * Type guard for task resources.
 * Used to isolate task-specific behavior in mixed resource pipelines.
 * @param resource Resource to inspect.
 * @returns Whether the resource matches the narrowed resource type.
 * @remarks Uses the existing structural field checks; does not validate a payload.
 */
export function isTask(resource: Resource): resource is Task {
  const fields = ['organisationId', 'projectId', 'layerId', 'featureId']
  return fields.every(field => field in resource)
}
