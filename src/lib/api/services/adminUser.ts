// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// AUTH
import { canSearchUsers } from './authz/user'
import { canBrowseUsers } from './authz/userDirectory'
// DB
import { user } from '#lib/db/schema/user.js'
import { getUser } from '#lib/db/services/user.js'
import { UserDirectoryProfileAPI } from '#lib/db/zod/schema/user.js'
// SERVICES
import {
  toUserProfileResponseShape,
  toUserRelationsWithContributionConstraints,
} from './user'
// TYPES
import type { Database, SessionUser, UserRoleDisco } from '#lib/types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type { AdminUserProfile, UserRaw } from '#lib/db/zod/schema/user.types.js'

/**
 * Checks the existing user-search entitlement for an admin profile read.
 * @param actor Authenticated identity and freshly resolved roles.
 * @returns Whether this actor can open an admin user profile.
 */
export function canReadAdminUserProfile(actor: {
  isAnonymous?: boolean | null
  superAdmin?: boolean | null
  userRoles: UserRoleDisco[]
}): boolean {
  return actor.isAnonymous !== true && canSearchUsers(actor)
}

/**
 * Loads a profile with public contributions and permission-filtered personal fields.
 * @param db Request-scoped database.
 * @param params Username, session actor, roles and server-resolved active hub.
 * @returns Public profile and contributions, with nullable privileged details.
 * @remarks Clients cannot select a broader response profile or supply a hub scope.
 * Accounts, tokens, preferences and experimental flags are never returned.
 */
export async function readAdminUserProfile(
  db: Database,
  params: {
    username: string
    actor: SessionUser
    userRoles: UserRoleDisco[]
    hub?: Partial<HubOptsExtended> | null
  },
): Promise<AdminUserProfile | null> {
  const actor = { ...params.actor, userRoles: params.userRoles }
  if (!canReadAdminUserProfile(actor)) error(403, 'INSUFFICIENT_ROLE')
  const canReadDetails = canBrowseUsers({ ...actor, hubId: params.hub?.id })
  const conditions = [sql`lower(${user.username}) = ${params.username.toLowerCase()}`]
  if (!canReadDetails) conditions.push(eq(user.isArchived, false))

  // Reuse the public contribution scope; an admin URL does not expose draft content.
  const relations = toUserRelationsWithContributionConstraints(db, {
    sessionUser: params.actor,
    hubOpts: params.hub,
    isAdminRequest: true,
  })
  const row = (await getUser(
    db,
    {
      contributedFeatures: relations.contributedFeatures,
      contributedImages: relations.contributedImages,
      contributedTasks: relations.contributedTasks,
    },
    conditions,
  )) as UserRaw | undefined
  if (!row) return null

  // Project the response on the server so hidden fields never reach the browser.
  const profile = toUserProfileResponseShape(row, 'detail')
  if (!profile) return null
  return {
    profile,
    details: canReadDetails ? UserDirectoryProfileAPI.parse(row) : null,
  }
}
