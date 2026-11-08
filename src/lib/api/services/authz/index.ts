// TYPES
import type {
  AuthorizeParams,
  AuthorizationDecision,
  HubAuthorizationAction,
  HubAuthorizeParams,
  OrganisationAuthorizeParams,
  OrganisationAuthorizationAction,
  ProjectAuthorizationAction,
  ProjectAuthorizeParams,
} from '#lib/api/services/authz/authorization.types.js'
// POLICIES
import { organisationPolicyMap } from './organisation'
import { projectPolicyMap } from './project'
import { hubPolicyMap } from './hub'
export * from './shared'

export {
  toOrganisationSubmittedFields,
  toOrganisationAuthActor,
  authorizeOrganisationCreateForSubmission,
  authorizeOrganisationUpdateForSubmission,
  authorizeOrganisationReadForProbe,
  authorizeOrganisationListForContext,
  authorizeOrganisationRead,
  authorizeOrganisationList,
  authorizeOrganisationCreate,
  authorizeOrganisationUpdate,
  authorizeOrganisationManageRolesForSubmission,
  authorizeOrganisationPublishForSubmission,
  authorizeOrganisationDeleteForSubmission,
  ensureOrganisationCommandAllowed,
  authorizeOrganisationManageRoles,
  authorizeOrganisationPublish,
  authorizeOrganisationDelete,
  resolveOrganisationActionPermissions,
} from './organisation'
export {
  toHubSubmittedFields,
  toHubUserRoleSignature,
  toHubAuthActor,
  authorizeHubCreateForSubmission,
  authorizeHubUpdateForSubmission,
  isCoreHubAdmin,
  isRelevantHubAdmin,
  getScopedHubAdminIds,
  toHubListConditions,
  authorizeHubReadForProbe,
  authorizeHubRead,
  authorizeHubList,
  authorizeHubCreate,
  authorizeHubUpdate,
  authorizeHubManageRolesForSubmission,
  authorizeHubPublishForSubmission,
  authorizeHubDeleteForSubmission,
  ensureHubCommandAllowed,
  hasInvalidHubOrganisationAssignmentsForSubmission,
  authorizeHubManageRoles,
  authorizeHubPublish,
  authorizeHubDelete,
  resolveHubActionPermissions,
  hubPolicyMap,
} from './hub'
export {
  normalizeProjectI18nForFormInput,
  toProjectAuthActor,
  toProjectStableAuthzSignature,
  toProjectSubmittedFields,
  toProjectUserRoleCapabilitiesSignature,
  authorizeProjectList,
  authorizeProjectListForContext,
  authorizeProjectRead,
  authorizeProjectReadForProbe,
  authorizeProjectCreate,
  authorizeProjectCreateForSubmission,
  authorizeProjectUpdate,
  authorizeProjectUpdateForSubmission,
  authorizeProjectManageRoles,
  authorizeProjectManageRolesForSubmission,
  authorizeProjectManageCapabilities,
  authorizeProjectManageCapabilitiesForSubmission,
  authorizeProjectAssignCapabilities,
  authorizeProjectAssignCapabilitiesForSubmission,
  authorizeProjectPublish,
  authorizeProjectPublishForSubmission,
  authorizeProjectDelete,
  authorizeProjectDeleteForSubmission,
  canCreateAnyProject,
  canSetProjectParentOrganisation,
  resolveProjectParentOrganisationScope,
  ensureProjectCommandAllowed,
  projectPolicyMap,
} from './project'
export {
  toFeatureAuthActor,
  toFeatureSubmittedFields,
  authorizeFeatureListForContext,
  authorizeFeatureReadForProbe,
  authorizeFeatureAdminReadForProbe,
  authorizeFeatureCreateForSubmission,
  authorizeFeatureUpdateForSubmission,
  authorizeFeaturePublishForSubmission,
  authorizeFeatureDeleteForSubmission,
  ensureFeatureCommandAllowed,
} from './feature'
export {
  toTaskAuthActor,
  authorizeTaskListForContext,
  authorizeTaskReadForProbe,
  authorizeTaskReassignForProbe,
} from './task'
export {
  toLayerAuthActor,
  resolveLayerListReadPolicy,
  resolveLayerListReadScope,
  resolveLayerResourceVisibilityPolicy,
  authorizeLayerListForContext,
  authorizeLayerReadForProbe,
  authorizeLayerCreateForSubmission,
  authorizeLayerUpdateForSubmission,
  authorizeLayerPublishForSubmission,
  authorizeLayerDeleteForSubmission,
  ensureLayerCommandAllowed,
  resolveLayerActionPermissions,
  resolveLayerProjectSelectionScope,
} from './layer'
export { authorizeImageList, authorizeImageRead } from './image'
export {
  canAccessAdminPanel,
  canSearchUsers,
  canOverrideUserSearchArchivedFilter,
  canUpdateUserProfile,
} from './user'
export { resolveAnalyticsScope } from './analytics'

/**
 * Central authorization entry point.
 * Resource types without policy maps intentionally return NOT_IMPLEMENTED.
 */
function authorize(params: AuthorizeParams): AuthorizationDecision {
  if (params.resourceType === 'organisation') {
    const handler =
      organisationPolicyMap[params.action as OrganisationAuthorizationAction]
    if (!handler) {
      throw new Error(
        `NOT_IMPLEMENTED: authorize(${params.resourceType}/${params.action})`,
      )
    }
    return handler(params as OrganisationAuthorizeParams)
  }

  if (params.resourceType === 'project') {
    const handler = projectPolicyMap[params.action as ProjectAuthorizationAction]
    if (!handler) {
      throw new Error(
        `NOT_IMPLEMENTED: authorize(${params.resourceType}/${params.action})`,
      )
    }
    return handler(params as ProjectAuthorizeParams)
  }

  if (params.resourceType === 'hub') {
    const handler = hubPolicyMap[params.action as HubAuthorizationAction]
    if (!handler) {
      throw new Error(
        `NOT_IMPLEMENTED: authorize(${params.resourceType}/${params.action})`,
      )
    }
    return handler(params as HubAuthorizeParams)
  }

  throw new Error(`NOT_IMPLEMENTED: authorize(${params.resourceType})`)
}

export default authorize
