// POLICY CONSTANTS
import type {
  authorizationResourceTypes,
  organisationAuthorizationActions,
  projectAuthorizationActions,
  hubAuthorizationActions,
  organisationAuthorizationFields,
  projectAuthorizationFields,
  hubAuthorizationFields,
  authorizationDenyCodes,
} from './authorization.constants'

// TYPES
import type { UserRoleDisco } from '$lib/types'
import type { HubProfile } from '$lib/db/zod/schema/hub.types'

type AuthorizationResourceType = (typeof authorizationResourceTypes)[number]

export type OrganisationAuthorizationAction =
  (typeof organisationAuthorizationActions)[number]

export type ProjectAuthorizationAction = (typeof projectAuthorizationActions)[number]

export type HubAuthorizationAction = (typeof hubAuthorizationActions)[number]

type AuthorizationAction =
  | OrganisationAuthorizationAction
  | ProjectAuthorizationAction
  | HubAuthorizationAction

export type OrganisationAuthorizationField =
  (typeof organisationAuthorizationFields)[number]

export type ProjectAuthorizationField = (typeof projectAuthorizationFields)[number]

export type HubAuthorizationField = (typeof hubAuthorizationFields)[number]

type AuthorizationField =
  | OrganisationAuthorizationField
  | ProjectAuthorizationField
  | HubAuthorizationField

type AuthorizationDenyCode = (typeof authorizationDenyCodes)[number]

export type AuthorizeParams = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
  isSuperAdmin?: boolean
  resourceType: AuthorizationResourceType
  action: AuthorizationAction
  resourceId?: string
  organisationId?: string | null
  resourceHubId?: string | null
  fields?: AuthorizationField[]
  requestedState?: {
    isPublished?: boolean
    isArchived?: boolean
  }
}

export type OrganisationAuthorizeParams = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
  action: OrganisationAuthorizationAction
  resourceId?: string
  resourceHubId?: string | null
  fields?: OrganisationAuthorizationField[]
  requestedState?: {
    isPublished?: boolean
    isArchived?: boolean
  }
}

export type ProjectAuthorizeParams = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
  isSuperAdmin?: boolean
  action: ProjectAuthorizationAction
  resourceId?: string
  organisationId?: string | null
  resourceHubId?: string | null
  fields?: ProjectAuthorizationField[]
  requestedState?: {
    isPublished?: boolean
    isArchived?: boolean
  }
}

export type HubAuthorizeParams = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
  isSuperAdmin?: boolean
  action: HubAuthorizationAction
  resourceId?: string
  resourceHubId?: string | null
  resourceHubCode?: string | null
  fields?: HubAuthorizationField[]
  requestedState?: {
    isPublished?: boolean
    isArchived?: boolean
  }
  requestedProfile?: HubProfile
}

export type AuthorizationDecision = {
  allowed: boolean
  code?: AuthorizationDenyCode
}
