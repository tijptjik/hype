// TYPES
import type {
  AuthorizeParams,
  AuthorizationDecision,
  OrganisationAuthorizationAction,
} from '$lib/types'
// POLICIES
import { organisationPolicyMap } from './organisation'

const policyMap = {
  organisation: organisationPolicyMap,
} as const

/**
 * Central authorization entry point.
 * Resource types other than `organisation` intentionally return NOT_IMPLEMENTED in v1.
 */
function authorize(params: AuthorizeParams): AuthorizationDecision {
  if (params.resourceType !== 'organisation') {
    throw new Error(`NOT_IMPLEMENTED: authorize(${params.resourceType})`)
  }

  const resourcePolicyMap = policyMap[params.resourceType]
  const handler = resourcePolicyMap[params.action as OrganisationAuthorizationAction]
  if (!handler) {
    throw new Error(
      `NOT_IMPLEMENTED: authorize(${params.resourceType}/${params.action})`,
    )
  }

  return handler(params)
}

export default authorize
