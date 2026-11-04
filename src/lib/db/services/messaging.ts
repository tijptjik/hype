// SVELTE
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, asc, eq, gt, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm'
// SCHEMA
import {
  messagingPhoneLookup,
  messagingAccount,
  messagingConversation,
  messagingMessage,
  messagingSend,
  organisation,
  user,
  userMessagingIdentity,
  userMessagingIdentityAlias,
} from '#lib/db/schema/index.js'
// API
import { canManageOrganisationMessaging } from '#lib/api/services/authz/messaging.js'
// UTILITIES
import { normalizeTelephone } from '#lib/utils/telephone.js'
import { chunkedInArray } from '#lib/utils/batch-query.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'
import type { Database } from '#lib/types.js'
import type { MessagingBinding } from '#lib/messaging/binding.js'
import type {
  BridgeConversationState,
  BridgeMessage,
  BridgeSnapshot,
  MessagingPlatform,
  SendRequest,
  SendResult,
} from '#lib/messaging/types.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. ACCOUNT AUTHORIZATION
// - authorizeMessagingOrganisation
// - authorizeMessagingAccount
// - resolveMessagingPhone
// - lookupMessagingPhone
// - readMessagingRecipients
// - authorizeMessagingConversation
// - messagingService
// - messagingViewer
// 2. INBOX PROJECTION
// - projectMessagingSnapshot
// - projectMessagingArchive
// - withMessagingOperators
// - readMessagingMessages
// 3. SEND JOURNAL
// - dispatchMessagingSend
// ---

export type MessagingAccount = typeof messagingAccount.$inferSelect

/** Check organisation-scoped access before resolving any private bridge account.
 * @param ctx Authenticated request context.
 * @param organisationId Requested organisation, loaded independently of client claims.
 * @returns The accessible, unarchived organisation.
 */
export async function authorizeMessagingOrganisation(
  ctx: GuardedBaseContext,
  organisationId: string,
) {
  const target = await ctx.db.query.organisation.findFirst({
    where: eq(organisation.id, organisationId),
  })
  if (
    !target ||
    !canManageOrganisationMessaging({ ...ctx.user, roles: ctx.userRoles }, target)
  ) {
    throw error(
      403,
      'Organisation messaging requires membership or administration of this organisation',
    )
  }
  return target
}

/** Resolve a linked account after checking access to its assigned organisation.
 * @param ctx Authenticated request context.
 * @param accountId Application account identifier; never a bridge identifier.
 * @returns The authorized account record.
 */
export async function authorizeMessagingAccount(
  ctx: GuardedBaseContext,
  accountId: string,
): Promise<MessagingAccount> {
  const account = await ctx.db.query.messagingAccount.findFirst({
    where: eq(messagingAccount.id, accountId),
  })
  if (!account) throw error(404, 'Messaging account not found')
  await authorizeMessagingOrganisation(ctx, account.organisationId)
  return account
}

/** Public Hype identity attached to a verified native messaging address. */
export interface MessagingRecipient {
  id: string
  name: string | null
  username: string | null
  image: string | null
}

/** Resolve only active Hype users whose verified identity still owns this exact native thread.
 * @param db Application database.
 * @param account Authorized linked provider account.
 * @param addresses Native peers from a bounded bridge page or an explicit action.
 * @returns Verified Hype recipients keyed by canonical platform address.
 * @remarks A stored recipient association is never reassigned to a different person.
 * Dynamic membership uses one JSON SQL parameter instead of an unbounded IN list.
 */
export async function readMessagingRecipients(
  db: Database,
  account: MessagingAccount,
  addresses: string[],
): Promise<Map<string, MessagingRecipient>> {
  if (!addresses.length) return new Map()
  const rows = await db
    .select({
      address: userMessagingIdentityAlias.nativeId,
      id: user.id,
      name: user.name,
      username: user.username,
      image: user.image,
    })
    .from(userMessagingIdentityAlias)
    .innerJoin(
      userMessagingIdentity,
      and(
        eq(userMessagingIdentity.userId, userMessagingIdentityAlias.userId),
        eq(userMessagingIdentity.platform, userMessagingIdentityAlias.platform),
      ),
    )
    .innerJoin(
      user,
      and(
        eq(user.id, userMessagingIdentity.userId),
        eq(user.isArchived, false),
        eq(user.isAnonymous, false),
      ),
    )
    .leftJoin(
      messagingConversation,
      and(
        eq(messagingConversation.accountId, account.id),
        eq(messagingConversation.chatId, userMessagingIdentityAlias.nativeId),
      ),
    )
    .where(
      and(
        eq(userMessagingIdentity.platform, account.platform),
        isNotNull(userMessagingIdentity.verifiedAt),
        or(
          isNull(userMessagingIdentity.sourceTelephone),
          eq(userMessagingIdentity.sourceTelephone, user.telephone),
        ),
        chunkedInArray(userMessagingIdentityAlias.nativeId, [...new Set(addresses)], 5),
        or(
          isNull(messagingConversation.recipientUserId),
          eq(messagingConversation.recipientUserId, user.id),
        ),
      ),
    )
  return new Map(rows.map(({ address, ...recipient }) => [address, recipient]))
}

/** Resolve only a saved HYPE phone through an already-authorized organisation account.
 * @param ctx Authenticated request context.
 * @param account Authorized organisation account.
 * @param recipient HYPE user and their database-owned telephone.
 * @returns A confirmed native address or an actionable, privacy-safe reason.
 * @remarks Existence is not a new ownership proof: the association relies on HYPE's saved phone.
 */
async function lookupMessagingPhone(
  ctx: GuardedBaseContext,
  account: MessagingAccount,
  recipient: { id: string; telephone: string | null },
): Promise<{ address: string | null; reason: string | null }> {
  const label = account.platform === 'telegram' ? 'Telegram' : 'WhatsApp'
  const phone = normalizeTelephone(recipient.telephone)
  if (!phone)
    return { address: null, reason: 'No valid phone number on this HYPE profile' }
  if (!account.enabled || !account.externalAccountId)
    return {
      address: null,
      reason: `Connect this organisation’s ${label} account first`,
    }
  try {
    const result = await messagingService(ctx, account.platform).lookupPhone(
      account.bridgeAccountId,
      phone,
    )
    if (result.status !== 'registered')
      return {
        address: null,
        reason:
          result.status === 'not_found'
            ? `No ${label} account found for the saved phone number`
            : result.status === 'unresolved'
              ? 'Telegram could not resolve this number; it may be hidden by privacy settings or not registered'
              : `${label} lookup is temporarily unavailable; try again`,
      }
    if (
      !(
        account.platform === 'whatsapp'
          ? /^[1-9]\d{6,14}@s\.whatsapp\.net$/
          : /^[1-9]\d*$/
      ).test(result.address)
    )
      return { address: null, reason: `${label} returned an invalid user identity` }
    // Never attach a discovered address to a different HYPE person or repoint an existing thread.
    // Search specifically for another owner so a same-user alias cannot hide a conflicting claim.
    const [owner] = await ctx.db
      .select({ id: userMessagingIdentity.userId })
      .from(userMessagingIdentity)
      .leftJoin(
        userMessagingIdentityAlias,
        and(
          eq(userMessagingIdentity.userId, userMessagingIdentityAlias.userId),
          eq(userMessagingIdentity.platform, userMessagingIdentityAlias.platform),
        ),
      )
      .where(
        and(
          eq(userMessagingIdentity.platform, account.platform),
          ne(userMessagingIdentity.userId, recipient.id),
          or(
            eq(userMessagingIdentity.nativeId, result.address),
            eq(userMessagingIdentityAlias.nativeId, result.address),
          ),
        ),
      )
      .limit(1)
    const [thread] = await ctx.db
      .select({ id: messagingConversation.recipientUserId })
      .from(messagingConversation)
      .where(
        and(
          eq(messagingConversation.accountId, account.id),
          eq(messagingConversation.chatId, result.address),
        ),
      )
      .limit(1)
    if (
      (owner && owner.id !== recipient.id) ||
      (thread?.id && thread.id !== recipient.id)
    )
      return {
        address: null,
        reason:
          'This account belongs to a different HYPE user; review the phone number',
      }
    return { address: result.address, reason: null }
  } catch {
    return {
      address: null,
      reason: `${label} lookup is temporarily unavailable; try again`,
    }
  }
}

/** Read or populate discovery cache without changing verified identity ownership.
 * @param ctx Authorized database and bridge context.
 * @param account Organisation account used for discovery.
 * @param recipient HYPE user and current profile telephone.
 * @returns Cached or freshly checked availability; temporary failures expire quickly.
 */
export async function resolveMessagingPhone(
  ctx: GuardedBaseContext,
  account: MessagingAccount,
  recipient: { id: string; telephone: string | null },
): Promise<{ address: string | null; reason: string | null }> {
  if (
    !account.enabled ||
    !account.externalAccountId ||
    !normalizeTelephone(recipient.telephone)
  )
    return lookupMessagingPhone(ctx, account, recipient)
  const [cached] = await ctx.db
    .select()
    .from(messagingPhoneLookup)
    .where(
      and(
        eq(messagingPhoneLookup.accountId, account.id),
        eq(messagingPhoneLookup.userId, recipient.id),
        eq(messagingPhoneLookup.externalAccountId, account.externalAccountId),
        eq(messagingPhoneLookup.telephone, recipient.telephone!),
        gt(messagingPhoneLookup.expiresAt, Date.now()),
      ),
    )
    .limit(1)
  if (cached) return { address: cached.address, reason: cached.reason }
  const result = await lookupMessagingPhone(ctx, account, recipient)
  const checkedAt = Date.now()
  const ttl = result.address
    ? 7 * 86400000
    : result.reason?.includes('temporarily unavailable')
      ? 60000
      : 86400000
  const value = {
    accountId: account.id,
    userId: recipient.id,
    externalAccountId: account.externalAccountId,
    telephone: recipient.telephone!,
    ...result,
    checkedAt,
    expiresAt: checkedAt + ttl,
  }
  await ctx.db
    .insert(messagingPhoneLookup)
    .values(value)
    .onConflictDoUpdate({
      target: [messagingPhoneLookup.accountId, messagingPhoneLookup.userId],
      set: value,
    })
  return result
}

/** Require an existing account chat or a verified HYPE destination before acting on a native address.
 * @param ctx Authenticated request context.
 * @param account Already-authorized linked account.
 * @param address Native chat ID; arbitrary addresses cannot open new external conversations.
 * @returns The current verified HYPE association, or null for an unlinked account chat.
 * @remarks The account owns the chat. A missing or revoked HYPE association does not revoke account access.
 */
export async function authorizeMessagingConversation(
  ctx: GuardedBaseContext,
  account: MessagingAccount,
  address: string,
): Promise<MessagingRecipient | null> {
  const recipient = (await readMessagingRecipients(ctx.db, account, [address])).get(
    address,
  )
  if (recipient) return recipient
  const [conversation] = await ctx.db
    .select({ id: messagingConversation.id })
    .from(messagingConversation)
    .where(
      and(
        eq(messagingConversation.accountId, account.id),
        eq(messagingConversation.chatId, address),
      ),
    )
    .limit(1)
  if (!conversation)
    throw error(403, 'This chat is not available on the linked account')
  return null
}

/** Select a private binding only from the stored platform.
 * @param ctx Authenticated context with deployment bindings.
 * @param platform Database-owned platform selection.
 * @returns The provider's RPC surface.
 */
export function messagingService(
  ctx: GuardedBaseContext,
  platform: MessagingPlatform,
): MessagingBinding {
  const env = ctx.event.platform?.env ?? ctx.event.locals.platform?.env
  const service = platform === 'telegram' ? env?.TELEGRAM : env?.WHATSOVER
  if (!service)
    throw error(
      503,
      `The ${platform === 'telegram' ? 'Telegram' : 'WhatsApp'} service is not configured`,
    )
  return service
}

/** Bind tab leases to a server-authenticated login without exposing session identifiers.
 * @param ctx Authenticated context.
 * @param tabId Random UUID generated by the browser tab.
 * @returns A stable, opaque viewer identifier scoped to this session and tab.
 */
export async function messagingViewer(
  ctx: GuardedBaseContext,
  tabId: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify([ctx.user.id, ctx.session.id, tabId]),
  )
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, value => value.toString(16).padStart(2, '0')).join('')
}

/** Persist replayed projections without overwriting newer edits or regressing cursors.
 * @param db Application database.
 * @param account Authorized account and last committed replay cursor.
 * @param snapshot Bounded bridge replay, in ascending sequence order.
 * @param acknowledge Whether this is contiguous inbox replay; false for an independent history page.
 * @returns The greatest durably projected sequence in this batch.
 * @remarks Each statement binds one row, below D1's parameter limit. Cursor advancement
 * follows every row write; interrupted replays can be retried without losing messages.
 */
export async function projectMessagingSnapshot(
  db: Database,
  account: MessagingAccount,
  snapshot: BridgeSnapshot,
  acknowledge = true,
): Promise<number> {
  let cursor = acknowledge ? account.inboxCursor : 0
  const recipients = new Map<string, string | null>()
  for (const message of snapshot.messages) {
    if (!Number.isSafeInteger(message.sequence) || message.sequence <= cursor)
      throw new Error('Invalid bridge replay order')
    if (!recipients.has(message.chat)) {
      const identity = (await readMessagingRecipients(db, account, [message.chat])).get(
        message.chat,
      )
      recipients.set(message.chat, identity?.id ?? null)
    }
    // Commit the conversation and message atomically before acknowledging the replay.
    await db.batch([
      db
        .insert(messagingConversation)
        .values({
          id: crypto.randomUUID(),
          accountId: account.id,
          chatId: message.chat,
          lastMessageAt: message.timestamp,
          recipientUserId: recipients.get(message.chat) ?? null,
          // Only a direct peer's push name can label its chat; group senders are not group titles.
          displayName:
            !message.fromMe && message.chat === message.sender
              ? message.senderName
              : null,
        })
        .onConflictDoUpdate({
          target: [messagingConversation.accountId, messagingConversation.chatId],
          set: {
            lastMessageAt: sql`max(${messagingConversation.lastMessageAt}, excluded.lastMessageAt)`,
            recipientUserId: sql`coalesce(${messagingConversation.recipientUserId}, excluded.recipientUserId)`,
            displayName: sql`coalesce(${messagingConversation.displayName}, excluded.displayName)`,
          },
        }),
      db
        .insert(messagingMessage)
        .values({
          accountId: account.id,
          chatId: message.chat,
          messageId: message.id,
          senderId: message.sender,
          sourceSequence: message.sequence,
          timestamp: message.timestamp,
          payload: message,
        })
        .onConflictDoUpdate({
          target: [
            messagingMessage.accountId,
            messagingMessage.chatId,
            messagingMessage.messageId,
            messagingMessage.senderId,
          ],
          set: {
            sourceSequence: message.sequence,
            timestamp: message.timestamp,
            payload: message,
          },
          setWhere: gt(sql`excluded.sourceSequence`, messagingMessage.sourceSequence),
        }),
    ])
    cursor = message.sequence
  }
  // Reconcile only known Hype intents; bridge-originated messages still enter the inbox.
  for (const result of snapshot.outbox) {
    if (result.state === 'pending') continue
    await db
      .update(messagingSend)
      .set({ state: result.state, messageId: result.messageId, updatedAt: Date.now() })
      .where(
        and(
          eq(messagingSend.accountId, account.id),
          eq(messagingSend.requestId, result.request.requestId),
          sql`${messagingSend.state} != 'submitted'`,
        ),
      )
  }
  // Apply native folder changes independently, including changes made in the provider's own apps.
  let archiveCursor = account.archiveCursor
  for (const conversation of snapshot.conversations ?? []) {
    if (conversation.sequence <= archiveCursor) continue
    await projectMessagingArchive(db, account.id, conversation)
    archiveCursor = conversation.sequence
  }
  if (acknowledge && archiveCursor > account.archiveCursor) {
    await db
      .update(messagingAccount)
      .set({
        archiveCursor: sql`max(${messagingAccount.archiveCursor}, ${archiveCursor})`,
      })
      .where(eq(messagingAccount.id, account.id))
  }
  if (acknowledge && cursor > account.inboxCursor) {
    await db
      .update(messagingAccount)
      .set({ inboxCursor: sql`max(${messagingAccount.inboxCursor}, ${cursor})` })
      .where(eq(messagingAccount.id, account.id))
  }
  return cursor
}

/** Persist native folder state without letting delayed polls undo a newer acknowledgment.
 * @param db Application database.
 * @param accountId Authorized account whose bridge emitted the event.
 * @param state Confirmed native archive state and independent bridge sequence.
 * @returns Resolves after the idempotent conversation projection is durable.
 */
export async function projectMessagingArchive(
  db: Database,
  accountId: string,
  state: BridgeConversationState,
): Promise<void> {
  if (
    !Number.isSafeInteger(state.sequence) ||
    state.sequence <= 0 ||
    !state.chat ||
    typeof state.isArchived !== 'boolean'
  )
    throw new Error('Invalid native conversation state')
  await db
    .insert(messagingConversation)
    .values({
      id: crypto.randomUUID(),
      accountId,
      chatId: state.chat,
      isArchived: state.isArchived,
      archiveSequence: state.sequence,
    })
    .onConflictDoUpdate({
      target: [messagingConversation.accountId, messagingConversation.chatId],
      set: { isArchived: state.isArchived, archiveSequence: state.sequence },
      setWhere: gt(
        sql`excluded.archiveSequence`,
        messagingConversation.archiveSequence,
      ),
    })
}

/** Attach only the original HYPE send actor, never an editor or a provider-supplied claim.
 * @param db Application database.
 * @param accountId Already authorized organisation messaging account.
 * @param messages Bounded native projections from replay, search, or history.
 * @returns Projections with audited operator names and avatars where known.
 */
export async function withMessagingOperators(
  db: Database,
  accountId: string,
  messages: BridgeMessage[],
): Promise<BridgeMessage[]> {
  const ids = messages.filter(message => message.fromMe).map(message => message.id)
  if (!ids.length) return messages.map(message => ({ ...message, operator: undefined }))
  // Match the account, native message, and exact recipient; reaction/edit receipts are not authorship.
  const rows = await db
    .select({
      messageId: messagingSend.messageId,
      request: messagingSend.request,
      id: user.id,
      name: user.name,
      username: user.username,
      image: user.image,
    })
    .from(messagingSend)
    .innerJoin(user, eq(user.id, messagingSend.actorUserId))
    .where(
      and(
        eq(messagingSend.accountId, accountId),
        eq(messagingSend.state, 'submitted'),
        chunkedInArray(messagingSend.messageId, ids),
        sql`json_extract(${messagingSend.request}, '$.editTo') IS NULL`,
        sql`json_extract(${messagingSend.request}, '$.reaction') IS NULL`,
      ),
    )
    .orderBy(asc(messagingSend.createdAt))
  return messages.map(message => {
    const actor = message.fromMe
      ? rows.find(
          row => row.messageId === message.id && row.request.to === message.chat,
        )
      : undefined
    return {
      ...message,
      operator: actor
        ? {
            id: actor.id,
            name: actor.name,
            username: actor.username,
            image: actor.image,
          }
        : undefined,
    }
  })
}

/** Read bounded projections independently of bridge connection lifetime.
 * @param db Application database.
 * @param accountId Authorized account ID.
 * @param after Browser's replay cursor.
 * @returns Up to 100 latest projections within the fully acknowledged bridge replay range.
 */
export async function readMessagingMessages(
  db: Database,
  accountId: string,
  after: number,
): Promise<BridgeMessage[]> {
  const rows = await db
    .select({ payload: messagingMessage.payload })
    .from(messagingMessage)
    .where(
      and(
        eq(messagingMessage.accountId, accountId),
        gt(messagingMessage.sourceSequence, after),
        // Independently imported history must not let browsers skip live events still awaiting projection.
        lte(
          messagingMessage.sourceSequence,
          sql`(SELECT inboxCursor FROM messagingAccount WHERE id = ${accountId})`,
        ),
      ),
    )
    .orderBy(asc(messagingMessage.sourceSequence))
    .limit(100)
  return withMessagingOperators(
    db,
    accountId,
    rows.map(row => row.payload),
  )
}

/** Freeze route and actor before external I/O, then reconcile the provider's durable result.
 * @param ctx Authenticated operator and database.
 * @param account Authorized organisation account.
 * @param request Validated immutable send intent.
 * @param recipientUserId Verified Hype recipient, when starting recipient-driven outreach.
 * @returns Durable result; ambiguous delivery is visible and never blindly resent.
 */
export async function dispatchMessagingSend(
  ctx: GuardedBaseContext,
  account: MessagingAccount,
  request: SendRequest,
  recipientUserId: string | null = null,
): Promise<SendResult> {
  const key = and(
    eq(messagingSend.accountId, account.id),
    eq(messagingSend.requestId, request.requestId),
  )
  const now = Date.now()
  await ctx.db
    .insert(messagingSend)
    .values({
      accountId: account.id,
      requestId: request.requestId,
      actorUserId: ctx.user.id,
      recipientUserId,
      request,
      state: 'pending',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
  const saved = await ctx.db.query.messagingSend.findFirst({ where: key })
  // Later identity verification can enrich a conversation, but never rewrites an existing send's attribution.
  if (!saved || JSON.stringify(saved.request) !== JSON.stringify(request)) {
    throw error(409, 'This request ID already belongs to a different message')
  }
  if (saved.state !== 'pending')
    return { request: saved.request, messageId: saved.messageId, state: saved.state }
  // Both bridges deduplicate the stable request ID before attempting provider delivery.
  let result: SendResult
  try {
    result = await messagingService(ctx, account.platform).send(
      account.bridgeAccountId,
      saved.request,
    )
  } catch {
    result = { request: saved.request, messageId: '', state: 'uncertain' }
  }
  await ctx.db
    .update(messagingSend)
    .set({ state: result.state, messageId: result.messageId, updatedAt: Date.now() })
    .where(and(key, sql`${messagingSend.state} != 'submitted'`))
  const final = await ctx.db.query.messagingSend.findFirst({ where: key })
  return { request: saved.request, messageId: final!.messageId, state: final!.state }
}
