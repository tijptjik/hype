// TYPES
import type { Database } from 'bun:sqlite'

export interface PhoneLookupCandidate {
  userId: string
  telephone: string
  accountId: string
  platform: 'whatsapp' | 'telegram'
  bridgeAccountId: string
  externalAccountId: string
}

/** Select a bounded batch that respects saved identities and fresh discovery results.
 * @param db Local HYPE SQLite database with messaging migrations applied.
 * @param organisation Organisation code whose linked accounts may perform discovery.
 * @param limit Maximum number of user/account pairs.
 * @param now Timestamp used to evaluate cached results.
 * @returns Eligible user/account pairs in stable order.
 * @remarks Pending manual claims must be verified instead of replaced by profile-phone discovery.
 */
export function findPhoneLookupCandidates(
  db: Database,
  organisation: string,
  limit: number,
  now: number,
): PhoneLookupCandidate[] {
  // Preserve manual claims and current verified discovery; stale profile-phone associations may refresh.
  return db
    .query<PhoneLookupCandidate, [number, string, number]>(`
    SELECT u.id AS userId,u.telephone,a.id AS accountId,a.platform,a.bridgeAccountId,a.externalAccountId
    FROM user u
    JOIN messagingAccount a ON a.platform IN ('whatsapp','telegram')
    JOIN organisation o ON o.id=a.organisationId
    LEFT JOIN userMessagingIdentity i ON i.userId=u.id AND i.platform=a.platform
      AND (i.sourceTelephone IS NULL OR (i.verifiedAt IS NOT NULL AND i.sourceTelephone=u.telephone))
    LEFT JOIN messagingPhoneLookup c ON c.accountId=a.id AND c.userId=u.id
      AND c.telephone=u.telephone AND c.externalAccountId=a.externalAccountId AND c.expiresAt>?
    WHERE o.code=? AND o.isArchived=0 AND a.enabled=1 AND a.externalAccountId IS NOT NULL
      AND u.isArchived=0 AND u.isAnonymous=0 AND u.username IS NOT NULL AND u.telephone IS NOT NULL
      AND i.userId IS NULL AND c.userId IS NULL
    ORDER BY u.id,a.platform LIMIT ?
  `)
    .all(now, organisation, limit)
}

/** Check whether another HYPE user owns a discovered native ID or its existing thread.
 * @param db Local HYPE SQLite database with messaging migrations applied.
 * @param candidate User/account pair whose phone was resolved.
 * @param nativeId Provider-confirmed address returned by the lookup.
 * @returns Whether another identity claim, verified alias, or thread owner conflicts.
 * @remarks Unverified canonical claims still reserve their native ID for ownership review.
 */
export function hasConflictingMessagingOwner(
  db: Database,
  candidate: Pick<PhoneLookupCandidate, 'userId' | 'accountId' | 'platform'>,
  nativeId: string,
): boolean {
  // Search for any different owner so a matching same-user claim cannot mask another reservation.
  const owner = db
    .query<{ userId: string }, [string, string, string, string]>(`
    SELECT i.userId FROM userMessagingIdentity i
    LEFT JOIN userMessagingIdentityAlias alias ON alias.userId=i.userId AND alias.platform=i.platform
    WHERE i.platform=? AND i.userId<>?
      AND (i.nativeId=? OR (i.verifiedAt IS NOT NULL AND alias.nativeId=?))
    LIMIT 1
  `)
    .get(candidate.platform, candidate.userId, nativeId, nativeId)
  const thread = db
    .query<{ recipientUserId: string }, [string, string, string]>(`
    SELECT recipientUserId FROM messagingConversation
    WHERE accountId=? AND chatId=? AND recipientUserId<>?
  `)
    .get(candidate.accountId, nativeId, candidate.userId)
  return Boolean(owner || thread)
}
