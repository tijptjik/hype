// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, exists, sql, type SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
// DB
import { user } from '#lib/db/schema/user.js'
import { userMessagingIdentity } from '#lib/db/schema/messaging.js'
// MESSAGING
import {
  displayMessagingContact,
  parseMessagingContact,
} from '#lib/messaging/contactInput.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { MessagingProfileSettings } from '#lib/messaging/contactValidation.js'
import type { AdminMessagingDraft } from '#lib/users/adminMessagingDraft.js'

/** Prepare messaging edits for the same atomic batch as the profile update.
 * @param db Request-scoped database.
 * @param userId Target profile.
 * @param draft Submitted contact fields; unchanged native IDs remain untouched.
 * @param profileGuard Shared audience and original profile-revision predicate.
 * @returns Lazy SQL writes and their canonical saved values; no independent saves or provider lookups.
 * @remarks Run these BEFORE the profile update in one D1 batch. Every write uses
 * the original profile guard; a stale/revoked save writes nothing, and any SQL
 * failure rolls the entire batch back. Changed claims lose ownership evidence.
 */
export async function prepareAdminMessagingWrites(
  db: Database,
  userId: string,
  draft: AdminMessagingDraft,
  profileGuard: SQL,
): Promise<{
  writes: BatchItem<'sqlite'>[]
  identities: MessagingProfileSettings['identities']
}> {
  const previousIdentities = await db
    .select()
    .from(userMessagingIdentity)
    .where(eq(userMessagingIdentity.userId, userId))
  let identities: MessagingProfileSettings['identities'] = previousIdentities.map(
    ({
      platform,
      phoneNumber,
      username,
      nativeId,
      verifiedAt,
      validation,
      updatedAt,
    }) => ({
      platform,
      phoneNumber,
      username,
      nativeId,
      verifiedAt,
      validation,
      updatedAt,
    }),
  )
  const permitted = exists(db.select({ id: user.id }).from(user).where(profileGuard))
  const writes: BatchItem<'sqlite'>[] = []
  for (const platform of ['whatsapp', 'telegram'] as const) {
    const previous = previousIdentities.find(row => row.platform === platform)
    const value = draft[platform].trim()
    if (value === displayMessagingContact(previous)) continue
    const parsed = parseMessagingContact(value)
    if (parsed.kind === 'invalid') {
      const body = { field: platform, message: parsed.message }
      error(400, body)
    }
    const key = and(
      eq(userMessagingIdentity.userId, userId),
      eq(userMessagingIdentity.platform, platform),
      permitted,
    )
    if (parsed.kind === 'empty') {
      if (previous) writes.push(db.delete(userMessagingIdentity).where(key))
      identities = identities.filter(row => row.platform !== platform)
      continue
    }
    if (parsed.value === displayMessagingContact(previous)) continue
    const updatedAt = Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1)
    identities = [
      ...identities.filter(row => row.platform !== platform),
      { platform, ...parsed.identity, validation: null, verifiedAt: null, updatedAt },
    ]
    if (previous) {
      writes.push(
        db
          .update(userMessagingIdentity)
          .set({
            ...parsed.identity,
            sourceTelephone: null,
            validation: null,
            verifiedAt: null,
            verifiedBy: null,
            updatedAt,
          })
          .where(key),
      )
    } else {
      // Conditional insertion shares exactly the guard used by the final profile write.
      writes.push(
        db.insert(userMessagingIdentity).select(
          db
            .select({
              userId: user.id,
              platform: sql`${platform}`.as('platform'),
              phoneNumber: sql`${parsed.identity.phoneNumber}`.as('phoneNumber'),
              username: sql`${parsed.identity.username}`.as('username'),
              nativeId: sql`null`.as('nativeId'),
              sourceTelephone: sql`null`.as('sourceTelephone'),
              validation: sql`null`.as('validation'),
              verifiedAt: sql`null`.as('verifiedAt'),
              verifiedBy: sql`null`.as('verifiedBy'),
              updatedAt: sql`${updatedAt}`.as('updatedAt'),
            })
            .from(user)
            .where(profileGuard),
        ),
      )
    }
  }
  return { writes, identities }
}
