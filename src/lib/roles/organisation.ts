export const ORGANISATION_ROLE_LEVEL = { user: 0, member: 1, owner: 2 } as const
export type OrganisationRoleLevel = keyof typeof ORGANISATION_ROLE_LEVEL
/** Independent provenance keys map to the level that each source granted. */
export type OrganisationRoleGrants = Record<string, OrganisationRoleLevel>

/** Check the organisation-user qualification, including every stronger role.
 * @param role Persisted role level.
 * @returns Whether this level qualifies as an organisation user.
 */
export function isOrganisationUserRole(role: string): role is OrganisationRoleLevel {
  return Object.hasOwn(ORGANISATION_ROLE_LEVEL, role)
}

/** Check staff membership explicitly, excluding the user audience.
 * @param role Persisted role level.
 * @returns Whether this is a Member or Owner staff assignment.
 */
export function isOrganisationStaffRole(role: unknown): role is 'member' | 'owner' {
  return role === 'member' || role === 'owner'
}

/** Test a scoped minimum role using the shared hierarchy.
 * @param roles Server-resolved assignments.
 * @param organisationId Exact organisation scope.
 * @param minimum Minimum qualifying role, defaulting to user.
 * @returns Whether an equal or stronger role exists in that organisation.
 */
export function hasOrganisationRoleAtLeast(
  roles: ReadonlyArray<{ type: string; role: string; organisationId?: string }>,
  organisationId: string,
  minimum: OrganisationRoleLevel = 'user',
): boolean {
  return roles.some(
    role =>
      role.type === 'organisation' &&
      role.organisationId === organisationId &&
      isOrganisationUserRole(role.role) &&
      ORGANISATION_ROLE_LEVEL[role.role] >= ORGANISATION_ROLE_LEVEL[minimum],
  )
}

/** Resolve the strongest surviving independently granted level.
 * @param grants Validated provenance map.
 * @returns Effective role, or null after the final grant is revoked.
 */
export function strongestOrganisationRole(
  grants: OrganisationRoleGrants,
): OrganisationRoleLevel | null {
  const levels = Object.values(grants)
  if (levels.some(level => !isOrganisationUserRole(level)))
    throw new Error('Invalid organisation role grant')
  return levels.includes('owner')
    ? 'owner'
    : levels.includes('member')
      ? 'member'
      : levels.includes('user')
        ? 'user'
        : null
}
