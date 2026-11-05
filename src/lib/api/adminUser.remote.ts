// SVELTE
import { requested } from '$app/server'
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// API
import { getAdminUserProfile } from '#lib/api/user.remote.js'
import { guardedCommand } from '#lib/api/server/guarded.js'
import {
  adminUserEditCondition,
  canEditAdminUser,
} from '#lib/api/services/authz/adminUser.js'
// DB
import { user } from '#lib/db/schema/user.js'
// SETTINGS
import { prepareAdminMessagingWrites } from '#lib/api/services/adminUserMessaging.js'
import { AdminMessagingDraftSchema } from '#lib/users/adminMessagingDraft.js'
import { AdminUserSettingsSchema } from '#lib/users/adminProfile.js'
import { normalizeTelephone } from '#lib/utils/telephone.js'
import { normalizeUsername, validateUsername } from '#lib/utils/username.js'

/** Reject a specific editable field without exposing another user's details.
 * @param field Field needing correction.
 * @param message Public explanation displayed beneath that field.
 * @returns Never; aborts the save before writing.
 */
function rejectProfileField(
  field: 'telephone' | 'email' | 'username',
  message: string,
): never {
  const body = { message, field }
  error(409, body)
}

/**
 * Save an explicitly editable profile within the actor's persisted audience.
 * @param params Target, last observed revision, and editable settings.
 * @returns The saved username for navigation after a rename.
 * @remarks The UPDATE repeats audience authorization and revision checks atomically.
 * Changing email clears verification unless a SuperAdmin explicitly verifies it.
 */
export const saveAdminUserProfile = guardedCommand(
  z.object({
    id: z.string().min(1),
    updatedAt: z.iso.datetime(),
    settings: AdminUserSettingsSchema,
    messaging: AdminMessagingDraftSchema.optional(),
  }),
  async (params, ctx) => {
    if (!(await canEditAdminUser(ctx.db, ctx.user, params.id)))
      error(403, 'INSUFFICIENT_ROLE')
    const existing = await ctx.db.query.user.findFirst({
      where: eq(user.id, params.id),
    })
    if (!existing) error(404, 'USER_NOT_FOUND')
    const settings = params.settings
    const username = normalizeUsername(settings.username ?? '')
    if (!validateUsername(username) || username === 'admin')
      error(400, 'INVALID_USERNAME')
    const email = settings.email?.trim().toLowerCase() || null
    const telephone = normalizeTelephone(settings.telephone)
    if (settings.telephone && !telephone) error(400, 'INVALID_TELEPHONE')
    // Prevent ordinary staff from asserting an authentication verification fact.
    if (
      !ctx.user.superAdmin &&
      settings.emailVerified !== Boolean(existing.emailVerified)
    )
      error(403, 'FIELD_FORBIDDEN')
    const conflict = await ctx.db.query.user.findFirst({
      columns: { id: true, username: true, email: true, telephone: true },
      where: sql`${user.id} != ${params.id} AND (${user.id} = ${username} OR lower(${user.username}) = ${username} OR (${email} IS NOT NULL AND lower(${user.email}) = ${email}) OR (${telephone} IS NOT NULL AND ${user.telephone} = ${telephone}))`,
    })
    if (conflict) {
      if (telephone && conflict.telephone === telephone)
        rejectProfileField(
          'telephone',
          'This phone number is already assigned to another user. Enter a different number or resolve the existing association before saving.',
        )
      if (email && conflict.email?.toLowerCase() === email)
        rejectProfileField(
          'email',
          'This email address is already assigned to another user.',
        )
      rejectProfileField(
        'username',
        'This username is already in use. Choose another username.',
      )
    }
    // The revision and audience predicates prevent stale saves and revoked membership writes.
    const profileGuard = and(
      eq(user.id, params.id),
      eq(user.updatedAt, new Date(params.updatedAt)),
      adminUserEditCondition(ctx.user),
    )!
    const messagingPlan = params.messaging
      ? await prepareAdminMessagingWrites(
          ctx.db,
          params.id,
          params.messaging,
          profileGuard,
        )
      : null
    const messagingWrites = messagingPlan?.writes ?? []
    const profileWrite = ctx.db
      .update(user)
      .set({
        ...settings,
        ...(params.messaging
          ? { preferredMessagingPlatform: params.messaging.preferredPlatform }
          : {}),
        username,
        displayUsername:
          settings.username === existing.username
            ? existing.displayUsername
            : settings.username?.trim(),
        name: settings.name || null,
        attribution: settings.attribution || null,
        image: settings.image || null,
        email,
        telephone,
        emailVerified: !email
          ? false
          : ctx.user.superAdmin
            ? settings.emailVerified
            : email !== existing.email
              ? false
              : existing.emailVerified,
        updatedAt: new Date(),
      })
      .where(profileGuard)
      .returning()
    // D1 batches commit all fields together or roll back all of them on failure.
    const saved = messagingWrites.length
      ? ((
          await ctx.db.batch([
            messagingWrites[0]!,
            ...messagingWrites.slice(1),
            profileWrite,
          ])
        ).at(-1) as (typeof user.$inferSelect)[])
      : await profileWrite
    if (!saved.length)
      error(409, 'Profile changed or access was revoked. Reload before saving.')
    // Refresh the active profile handle before the page exits edit mode.
    try {
      await requested(getAdminUserProfile, 1).refreshAll()
    } catch (cause) {
      console.error('Profile saved, but profile refresh failed:', cause)
    }
    // Return the committed values directly; clients must not rebuild their baseline from a cached query.
    const committed = saved[0]
    return {
      username: committed.username!,
      displayUsername: committed.displayUsername,
      settings: AdminUserSettingsSchema.parse(committed),
      updatedAt: committed.updatedAt.toISOString(),
      messagingSettings:
        params.messaging && messagingPlan
          ? {
              platform: params.messaging.preferredPlatform ?? ('whatsapp' as const),
              preferredPlatform: params.messaging.preferredPlatform,
              identities: messagingPlan.identities,
            }
          : undefined,
    }
  },
)
