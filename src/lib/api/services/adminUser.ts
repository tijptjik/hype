// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// AUTH
import { canAccessAdminPanel } from './authz/user'
import { canEditAdminUser } from './authz/adminUser'
import { AdminUserSettingsSchema } from '#lib/users/adminProfile.js'
// DB
import { user, account, accountProviderProfile } from '#lib/db/schema/user.js'
import { userMessagingIdentity } from '#lib/db/schema/messaging.js'
import { retainedSignInEmail } from '#lib/users/linkedAccountEmail.js'
import { getUser } from '#lib/db/services/user.js'
// SERVICES
import { toUserDirectoryProfile } from './userContacts'
import { readUserAccessOverview } from './userAccess'
import {
  toUserProfileResponseShape,
  toUserRelationsWithContributionConstraints,
} from './user'
// TYPES
import type { Database, SessionUser, UserRoleDisco } from '#lib/types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type { AdminUserProfile, UserRaw } from '#lib/db/zod/schema/user.types.js'

/**
 * Checks admin-panel entitlement for a public admin profile read.
 * @param actor Authenticated identity and freshly resolved roles.
 * @returns Whether this actor can open an admin user profile.
 */
export function canReadAdminUserProfile(actor: {
  isAnonymous?: boolean | null
  superAdmin?: boolean | null
  userRoles: UserRoleDisco[]
}): boolean {
  return actor.isAnonymous !== true && canAccessAdminPanel(actor)
}

/**
 * Loads a profile with public contributions and permission-filtered personal fields.
 * @param db Request-scoped database.
 * @param params Username, session actor, roles and server-resolved active hub.
 * @returns Public profile and contributions, with nullable privileged details.
 * @remarks Clients cannot select a broader response profile or supply a hub scope.
 * Only linked provider labels and recorded emails are returned; tokens are never returned. Settings require target-specific edit authority.
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
  const conditions = [sql`lower(${user.username}) = ${params.username.toLowerCase()}`]

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
  const canEdit = await canEditAdminUser(db, params.actor, row.id)
  if (row.isArchived && !canEdit) return null
  const linkedRows = canEdit
    ? await db
        .select({
          providerId: account.providerId,
          accountId: account.accountId,
          idToken: account.idToken,
          email: accountProviderProfile.email,
        })
        .from(account)
        .leftJoin(
          accountProviderProfile,
          and(
            eq(account.providerId, accountProviderProfile.providerId),
            eq(account.accountId, accountProviderProfile.accountId),
          ),
        )
        .where(eq(account.userId, row.id))
    : []
  // Tokens stay server-side: expose only recorded email metadata for the linked subject.
  const linkedAccounts = linkedRows.map(row => ({
    providerId: row.providerId,
    email: row.email ?? retainedSignInEmail(row),
    emailSource: row.email ? ('provider' as const) : ('sign-in' as const),
  }))
  const messagingSettings = canEdit
    ? {
        ...(await db
          .select({ preferredPlatform: user.preferredMessagingPlatform })
          .from(user)
          .where(eq(user.id, row.id))
          .then(rows => ({
            preferredPlatform: rows[0]?.preferredPlatform ?? null,
            platform: rows[0]?.preferredPlatform ?? ('whatsapp' as const),
          }))),
        identities: await db
          .select({
            platform: userMessagingIdentity.platform,
            phoneNumber: userMessagingIdentity.phoneNumber,
            username: userMessagingIdentity.username,
            nativeId: userMessagingIdentity.nativeId,
            validation: userMessagingIdentity.validation,
            verifiedAt: userMessagingIdentity.verifiedAt,
            updatedAt: userMessagingIdentity.updatedAt,
          })
          .from(userMessagingIdentity)
          .where(eq(userMessagingIdentity.userId, row.id)),
      }
    : null
  const access = await readUserAccessOverview(db, {
    targetUserId: row.id,
    actor: params.actor,
    userRoles: params.userRoles,
  })
  return {
    access,
    messagingSettings,
    linkedAccounts,
    profile,
    canEdit,
    settings: canEdit ? AdminUserSettingsSchema.parse(row) : null,
    updatedAt: canEdit ? new Date(row.updatedAt).toISOString() : null,
    details: canEdit ? toUserDirectoryProfile(row, true, true) : null,
  }
}
