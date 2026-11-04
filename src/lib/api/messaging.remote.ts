// SVELTE
import { error } from '@sveltejs/kit'
// THIRD PARTY
import { z } from 'zod'
import { and, asc, desc, eq, gt, isNotNull, isNull, or, sql } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
import { resolveMessagingPhone, authorizeMessagingAccount, authorizeMessagingOrganisation, authorizeMessagingRecipient, readMessagingRecipients, dispatchMessagingSend, messagingService, messagingViewer, projectMessagingSnapshot, readMessagingMessages } from '#lib/db/services/messaging.js'
import { canManageOrganisationMessaging } from '#lib/api/services/authz/messaging.js'
import { canUpdateUserProfile } from '#lib/api/services/authz/user.js'
import { findQuotedMessage, validTextQuote } from '#lib/messaging/quoted-message.js'
import { messagingAvailability } from '#lib/messaging/availability.js'
import { normalizeTelephone } from '#lib/utils/telephone.js'
import { isCoreHubAdmin } from '#lib/api/services/authz/hub.js'
// DB
import { messagingPhoneLookup, messagingAccount, messagingConversation, messagingMessage, messagingSend, organisation, user, userMessagingPreference, userMessagingIdentity } from '#lib/db/schema/index.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'
import type { MessagingAccount } from '#lib/db/services/messaging.js'
import type { TelegramBinding } from '#lib/messaging/binding.js'
import type { BridgeDialogPage, BridgeHistoryPage, BridgeMessage, BridgeSnapshot, BridgeStatus, LoginInput } from '#lib/messaging/types.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. VALIDATION AND IDENTITY
// - saveAccountIdentity
// 2. ORGANISATION ACCOUNTS
// - getMessagingAccounts
// - registerMessagingAccount
// - watchMessagingAccount
// - unwatchMessagingAccount
// - connectMessagingAccount
// - loginTelegramAccount
// - disconnectMessagingAccount
// 3. INBOX AND DELIVERY
// - getMessagingInbox
// - getMessagingConversations
// - searchMessagingUsers
// - checkMessagingUser
// - loadMessagingHistory
// - loadMessagingQuotedMessage
// - loadMessagingConversations
// - sendMessagingMessage
// - markMessagingMessagesRead
// - deleteMessagingMessage
// - uploadMessagingMedia
// - getMessagingStickerPacks
// - searchMessagingMedia
// - previewMessagingMedia
// - stageMessagingMedia
// - downloadMessagingMedia
// - getMessagingProfile
// 4. INBOX SELECTION AND CALLS
// - getMessagingOrganisations
// - getMessagingVoiceTicket
// - declineMessagingCall
// 5. USER PREFERENCES AND ROUTING
// - authorizeMessagingUser
// - getUserMessagingSettings
// - setUserMessagingPreference
// - setUserMessagingIdentity
// - verifyUserMessagingIdentity
// - openUserMessagingConversation
// ---

const meta = z.object({ isAdminRequest: z.literal(true) })
const id = z.string().min(1).max(100)
const accountInput = z.object({ meta, accountId: id })
const viewerInput = accountInput.extend({ tabId: z.string().uuid() })
const target = z.object({ id: z.string().min(1).max(128), sender: id }).strict()
const login = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('qr') }),
  z.object({ kind: z.literal('phone'), phone: z.string().regex(/^\+[1-9]\d{6,14}$/) }),
  z.object({ kind: z.literal('code'), code: z.string().regex(/^\d{3,10}$/) }),
  z.object({ kind: z.literal('password'), password: z.string().min(1).max(1024) }),
])

/** Claim an authenticated external identity without allowing cross-organisation reuse.
 * @param ctx Request context.
 * @param account Authorized account.
 * @param status Provider-authenticated identity, never submitted by the browser.
 * @returns Nothing; conflicting sessions are stopped before data is returned.
 */
async function saveAccountIdentity(ctx: GuardedBaseContext, account: MessagingAccount, status: BridgeStatus): Promise<void> {
  if (!status.identity) return
  if (account.externalAccountId && account.externalAccountId !== status.identity.id) {
    await messagingService(ctx, account.platform).stop(account.bridgeAccountId)
    throw error(409, 'This account is registered to a different identity')
  }
  let saved: { id: string }[]
  try {
    // First identity wins even when concurrent polls loaded the same unclaimed account.
    saved = await ctx.db.update(messagingAccount).set({ externalAccountId: status.identity.id, displayName: status.identity.name, updatedAt: Date.now() })
      .where(and(eq(messagingAccount.id, account.id), or(isNull(messagingAccount.externalAccountId), eq(messagingAccount.externalAccountId, status.identity.id))))
      .returning({ id: messagingAccount.id })
  } catch (cause) {
    // A unique database claim arbitrates simultaneous registrations in different organisations.
    await messagingService(ctx, account.platform).stop(account.bridgeAccountId)
    if (String(cause).includes('UNIQUE')) throw error(409, 'This messaging identity is already registered to an organisation')
    throw cause
  }
  if (!saved.length) {
    await messagingService(ctx, account.platform).stop(account.bridgeAccountId)
    throw error(409, 'This account is registered to a different identity')
  }
}

/** List account configuration without exposing session secrets.
 * @param params Organisation ID and admin intent.
 * @returns Accounts belonging to the authorized organisation.
 */
export const getMessagingAccounts = guardedQuery(z.object({ meta, organisationId: id }), async ({ organisationId }, ctx) => {
  await authorizeMessagingOrganisation(ctx, organisationId)
  return ctx.db.select({ id: messagingAccount.id, platform: messagingAccount.platform, displayName: messagingAccount.displayName, externalAccountId: messagingAccount.externalAccountId, enabled: messagingAccount.enabled })
    .from(messagingAccount).where(eq(messagingAccount.organisationId, organisationId))
})

/** Allocate one shared account per organisation and platform; registration requires a member or above.
 * @param params Organisation and chosen platform.
 * @returns The stable application account ID.
 */
export const registerMessagingAccount = guardedCommand(z.object({ meta, organisationId: id, platform: z.enum(['whatsapp', 'telegram']) }), async ({ organisationId, platform }, ctx) => {
  await authorizeMessagingOrganisation(ctx, organisationId)
  const accountId = crypto.randomUUID()
  await ctx.db.insert(messagingAccount).values({
    id: accountId, organisationId, platform, bridgeAccountId: `hype-${accountId}`,
    registeredBy: ctx.user.id, createdAt: Date.now(), updatedAt: Date.now(),
  }).onConflictDoNothing({ target: [messagingAccount.organisationId, messagingAccount.platform] })
  const accounts = await ctx.db.select({ id: messagingAccount.id, platform: messagingAccount.platform }).from(messagingAccount)
    .where(eq(messagingAccount.organisationId, organisationId))
  return accounts.find(account => account.platform === platform)!
})

/** Renew a tab's lease and resume a previously enabled connection.
 * @param params Authorized account and tab UUID.
 * @returns Current pairing/connection state.
 */
export const watchMessagingAccount = guardedCommand(viewerInput, async ({ accountId, tabId }, ctx) => {
  const account = await authorizeMessagingAccount(ctx, accountId)
  const service = messagingService(ctx, account.platform)
  let status = await service.watch(account.bridgeAccountId, await messagingViewer(ctx, tabId), ctx.event.locals.platform?.env.ENVIRONMENT)
  // Only authorized viewers of an enabled account restart pairing after a confirmed logout.
  if (account.platform === 'whatsapp' && account.enabled && status.loggedOut) {
    status = await service.start(account.bridgeAccountId, ctx.event.locals.platform?.env.ENVIRONMENT)
  }
  await saveAccountIdentity(ctx, account, status)
  return status
})

/** Release only this session's tab lease; other operators remain connected.
 * @param params Account and tab UUID.
 * @returns Confirmation of the released viewer.
 */
export const unwatchMessagingAccount = guardedCommand(viewerInput, async ({ accountId, tabId }, ctx) => {
  const account = await authorizeMessagingAccount(ctx, accountId)
  await messagingService(ctx, account.platform).unwatch(account.bridgeAccountId, await messagingViewer(ctx, tabId))
  return { released: true }
})

/** Enable/resume an account while its configuration or inbox is open.
 * @param params Authorized account and active tab UUID.
 * @returns Provider connection state; Telegram login is a separate explicit action.
 */
export const connectMessagingAccount = guardedCommand(viewerInput, async ({ accountId, tabId }, ctx) => {
  const account = await authorizeMessagingAccount(ctx, accountId)
  const service = messagingService(ctx, account.platform)
  await service.watch(account.bridgeAccountId, await messagingViewer(ctx, tabId), ctx.event.locals.platform?.env.ENVIRONMENT)
  const status = await service.start(account.bridgeAccountId, ctx.event.locals.platform?.env.ENVIRONMENT)
  await saveAccountIdentity(ctx, account, status)
  await ctx.db.update(messagingAccount).set({ enabled: true, updatedAt: Date.now() }).where(eq(messagingAccount.id, accountId))
  return status
})

/** Advance Telegram QR, phone-code, or password authentication through the private bridge.
 * @param params Account, active tab and bounded login challenge response.
 * @returns Pairing state; passwords/codes are never persisted by Hype.
 */
export const loginTelegramAccount = guardedCommand(viewerInput.extend({ login }), async (params, ctx) => {
  const account = await authorizeMessagingAccount(ctx, params.accountId)
  if (account.platform !== 'telegram') throw error(400, 'This is not a Telegram account')
  const service = (ctx.event.platform?.env ?? ctx.event.locals.platform?.env)?.TELEGRAM
  if (!service) throw error(503, 'The Telegram service is not configured')
  await service.watch(account.bridgeAccountId, await messagingViewer(ctx, params.tabId))
  const status = await service.login(account.bridgeAccountId, params.login as LoginInput)
  await saveAccountIdentity(ctx, account, status)
  await ctx.db.update(messagingAccount).set({ enabled: true, updatedAt: Date.now() }).where(eq(messagingAccount.id, account.id))
  return status
})

/** Explicitly disable an account for all operators, retaining its saved login.
 * @param params Authorized organisation account.
 * @returns Confirmation after the connection stops.
 */
export const disconnectMessagingAccount = guardedCommand(accountInput, async ({ accountId }, ctx) => {
  const account = await authorizeMessagingAccount(ctx, accountId)
  await messagingService(ctx, account.platform).stop(account.bridgeAccountId)
  await ctx.db.update(messagingAccount).set({ enabled: false, updatedAt: Date.now() }).where(eq(messagingAccount.id, accountId))
  return { stopped: true }
})

/** Sync bounded provider events and return the browser's independent D1 replay.
 * @param params Authorized account and browser cursor.
 * @returns Connection, inbox, calls and audited send states for this account.
 */
export const getMessagingInbox = guardedQuery(accountInput.extend({ after: z.number().int().nonnegative().default(0) }), async ({ accountId, after }, ctx): Promise<BridgeSnapshot> => {
  const account = await authorizeMessagingAccount(ctx, accountId)
  let snapshot: BridgeSnapshot
  try {
    snapshot = await messagingService(ctx, account.platform).snapshot(account.bridgeAccountId, account.inboxCursor)
  } catch {
    // Stored history remains readable during an unavailable provider or local bridge.
    snapshot = { status: { connected: false, loggedOut: false, qr: null, qrExpiresAt: null, lastEvent: 'The messaging bridge is unavailable. Showing saved history.' }, messages: [], outbox: [] }
  }
  await saveAccountIdentity(ctx, account, snapshot.status)
  await projectMessagingSnapshot(ctx.db, account, snapshot)
  const outbox = await ctx.db.select({ request: messagingSend.request, state: messagingSend.state, messageId: messagingSend.messageId, createdAt: messagingSend.createdAt })
    .from(messagingSend).where(eq(messagingSend.accountId, accountId)).orderBy(desc(messagingSend.createdAt)).limit(50)
  const page = await readMessagingMessages(ctx.db, accountId, after)
  // Advance through hidden native peers too, but never skip beyond this bounded D1 page.
  const replayCursor = page.length ? page[page.length - 1].sequence : after
  const peers = await readMessagingRecipients(ctx.db, account, [
    ...page.map(message => message.chat), ...outbox.map(result => result.request.to),
    ...(snapshot.calls?.incoming.map(call => call.peer) ?? []), ...(snapshot.calls?.current ? [snapshot.calls.current.peer] : []),
  ])
  return {
    ...snapshot, replayCursor,
    messages: page.filter(message => peers.has(message.chat)),
    outbox: outbox.filter(result => peers.has(result.request.to)),
    ...(snapshot.calls ? { calls: {
      ...snapshot.calls,
      incoming: snapshot.calls.incoming.filter(call => peers.has(call.peer)),
      current: snapshot.calls.current && peers.has(snapshot.calls.current.peer) ? snapshot.calls.current : null,
    } } : {}),
  }
})

/** Search saved conversation history using literal text, without provider side effects.
 * @param params Account, authorized chat and query.
 * @returns At most fifty matching stored messages.
 */
export const searchMessagingMessages = guardedQuery(accountInput.extend({chat:id,search:z.string().trim().min(1).max(200)}),async({accountId,chat,search},ctx)=>{
  const account=await authorizeMessagingAccount(ctx,accountId)
  await authorizeMessagingRecipient(ctx,account,chat)
  const pattern=`%${search.replace(/[!%_]/g,c=>`!${c}`)}%`
  const rows=await ctx.db.select({payload:messagingMessage.payload,sequence:messagingMessage.sourceSequence}).from(messagingMessage).where(and(eq(messagingMessage.accountId,accountId),eq(messagingMessage.chatId,chat),sql`coalesce(json_extract(${messagingMessage.payload},'$.deleted'),0)=0`,sql`json_extract(${messagingMessage.payload},'$.text') LIKE ${pattern} ESCAPE '!'`)).orderBy(desc(messagingMessage.timestamp)).limit(50)
  return rows.map(row=>({...row.payload,sequence:row.sequence}))
})

/** Resolve a reply's original from saved history, retrieving one bounded Telegram page if needed.
 * @param params Authorized account/chat and the exact stored message containing the quote.
 * @returns The original message, or null when it is no longer available.
 * @remarks The server derives the target from the saved reply; clients cannot choose another peer.
 * WhatsApp uses synced history only. This lookup never marks messages read or advances replay.
 */
export const loadMessagingQuotedMessage = guardedCommand(accountInput.extend({ chat: id, source: target }), async ({ accountId, chat, source }, ctx): Promise<BridgeMessage | null> => {
  const account = await authorizeMessagingAccount(ctx, accountId)
  await authorizeMessagingRecipient(ctx, account, chat)
  const [storedSource] = await ctx.db.select({ payload: messagingMessage.payload }).from(messagingMessage).where(and(
    eq(messagingMessage.accountId, accountId), eq(messagingMessage.chatId, chat),
    eq(messagingMessage.messageId, source.id), eq(messagingMessage.senderId, source.sender),
  )).limit(1)
  if (!storedSource || storedSource.payload.deleted || storedSource.payload.content?.viewOnce) throw error(404, 'This reply is no longer available')
  const quote = storedSource.payload.content?.quoted
  if (!quote?.id) throw error(400, 'This message does not quote an original')
  if (quote.chat && quote.chat !== chat) return null
  const stored = await ctx.db.select({ payload: messagingMessage.payload }).from(messagingMessage).where(and(
    eq(messagingMessage.accountId, accountId), eq(messagingMessage.chatId, chat), eq(messagingMessage.messageId, quote.id),
  )).limit(2)
  const original = findQuotedMessage(storedSource.payload, stored.map(row => row.payload))
  if (original || account.platform !== 'telegram') return original
  // A direct native anchor avoids downloading every intervening page for an old reply.
  if (!/^[1-9]\d{0,9}$/.test(quote.id) || Number(quote.id) >= 2_147_483_647) return null
  const service = (ctx.event.platform?.env ?? ctx.event.locals.platform?.env)?.TELEGRAM
  if (!service) throw error(503, 'The Telegram service is not configured')
  const page = await service.history(account.bridgeAccountId, chat, String(Number(quote.id) + 1))
  const messages = page.messages.filter(message => message.chat === chat)
  await projectMessagingSnapshot(ctx.db, account, {
    status: { connected: true, loggedOut: false, qr: null, qrExpiresAt: null }, messages, outbox: [],
  }, false)
  return findQuotedMessage(storedSource.payload, messages)
})

/** Import a bounded older page without acknowledging intervening incoming events.
 * @param params Authorized account, canonical chat and exclusive native message cursor.
 * @returns Latest message projections and the next history cursor, separate from inbox replay.
 */
export const loadMessagingHistory = guardedCommand(accountInput.extend({
  chat: z.string().regex(/^-?[1-9]\d*$/).refine(value => Number.isSafeInteger(Number(value))),
  before: z.string().regex(/^[1-9]\d{0,9}$/).refine(value => Number(value) <= 2_147_483_647).optional(),
}), async ({ accountId, chat, before }, ctx): Promise<BridgeHistoryPage> => {
  const account = await authorizeMessagingAccount(ctx, accountId)
  if (account.platform !== 'telegram') throw error(400, 'History pagination is not supported for this account')
  await authorizeMessagingRecipient(ctx, account, chat)
  const service = (ctx.event.platform?.env ?? ctx.event.locals.platform?.env)?.TELEGRAM
  if (!service) throw error(503, 'The Telegram service is not configured')
  const page = await service.history(account.bridgeAccountId, chat, before)
  // Independent pages may overtake live events, so they must never advance the shared inbox cursor.
  await projectMessagingSnapshot(ctx.db, account, { status: { connected: true, loggedOut: false, qr: null, qrExpiresAt: null }, messages: page.messages, outbox: [] }, false)
  return page
})

/** Discover older and archived Telegram conversations using an independent cursor.
 * @param params Authorized account and public peer/date/message anchor; access hashes stay in the bridge.
 * @returns Last-message projections and the next conversation cursor.
 */
export const loadMessagingConversations = guardedCommand(accountInput.extend({
  cursor: z.object({
    peer: z.string().regex(/^-?[1-9]\d*$/).refine(value => Number.isSafeInteger(Number(value))),
    id: z.number().int().positive().max(2_147_483_647),
    date: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }).optional(),
}), async ({ accountId, cursor }, ctx): Promise<BridgeDialogPage> => {
  const account = await authorizeMessagingAccount(ctx, accountId)
  if (account.platform !== 'telegram') throw error(400, 'Conversation discovery is not supported for this account')
  const service = (ctx.event.platform?.env ?? ctx.event.locals.platform?.env)?.TELEGRAM
  if (!service) throw error(503, 'The Telegram service is not configured')
  const page = await service.dialogs(account.bridgeAccountId, cursor)
  await projectMessagingSnapshot(ctx.db, account, { status: { connected: true, loggedOut: false, qr: null, qrExpiresAt: null }, messages: page.messages, outbox: [] }, false)
  const peers = await readMessagingRecipients(ctx.db, account, page.messages.map(message => message.chat))
  return { ...page, messages: page.messages.filter(message => peers.has(message.chat)) }
})

/** List stored threads even when the connection is idle.
 * @param params Authorized organisation account.
 * @returns Recent conversations pinned to that account's platform.
 */
export const getMessagingConversations = guardedQuery(accountInput, async ({ accountId }, ctx) => {
  const account = await authorizeMessagingAccount(ctx, accountId)
  // A verified identity joins older imported threads too, without trusting their display names.
  return ctx.db.select({
    id: messagingConversation.id, accountId: messagingConversation.accountId, platform: messagingAccount.platform,
    unreadCount: sql<number>`(SELECT count(*) FROM messagingMessage m WHERE m.accountId=${messagingConversation.accountId} AND m.chatId=${messagingConversation.chatId} AND json_extract(m.payload,'$.fromMe')=0 AND coalesce(json_extract(m.payload,'$.readByMe'),0)=0 AND coalesce(json_extract(m.payload,'$.deleted'),0)=0 AND coalesce(json_extract(m.payload,'$.content.kind'),'text') NOT IN ('protocol','reaction'))`,
    chatId: messagingConversation.chatId, lastMessageAt: messagingConversation.lastMessageAt,
    recipient: { id: user.id, name: user.name, username: user.username, image: user.image },
  }).from(messagingConversation)
    .innerJoin(messagingAccount, eq(messagingAccount.id, messagingConversation.accountId))
    .innerJoin(userMessagingIdentity, and(eq(userMessagingIdentity.platform, account.platform), eq(userMessagingIdentity.address, messagingConversation.chatId), isNotNull(userMessagingIdentity.verifiedAt)))
    .innerJoin(user, and(eq(user.id, userMessagingIdentity.userId), eq(user.isArchived, false), eq(user.isAnonymous, false)))
    .where(and(eq(messagingConversation.accountId, accountId), or(isNull(userMessagingIdentity.sourceTelephone), eq(userMessagingIdentity.sourceTelephone, user.telephone)), or(isNull(messagingConversation.recipientUserId), eq(messagingConversation.recipientUserId, user.id))))
    .orderBy(desc(messagingConversation.lastMessageAt), asc(messagingConversation.id)).limit(100)
})

/** Send through a selected account, keeping retries pinned to the same platform.
 * @param params Account and immutable text/reply/reaction/attachment intent.
 * @returns Durable delivery state, including uncertain results.
 */
export const sendMessagingMessage = guardedCommand(accountInput.extend({
  requestId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/), to: id,
  text: z.string().max(16_384), editTo: target.optional(), replyTo: target.extend({ quote: z.object({ text: z.string().min(1).max(1024), offset: z.number().int().nonnegative() }).optional() }).optional(), reaction: z.string().max(64).optional(), attachmentId: z.string().uuid().optional(),
}).refine(value => !value.editTo || (!value.replyTo && value.reaction === undefined && !value.attachmentId && value.text.trim().length > 0), 'Edits require only a target and replacement text').refine(value => value.reaction !== undefined
  ? !value.attachmentId && value.text === '' && value.replyTo !== undefined && new TextEncoder().encode(value.reaction).length <= 64
  : value.attachmentId !== undefined || value.text.trim().length > 0, 'Provide a message, or a reaction with a target'), async ({ meta: _meta, accountId, ...request }, ctx) => {
  const account = await authorizeMessagingAccount(ctx, accountId)
  const saved = await ctx.db.query.messagingSend.findFirst({ where: and(eq(messagingSend.accountId, account.id), eq(messagingSend.requestId, request.requestId)) })
  if (saved && JSON.stringify(saved.request) !== JSON.stringify(request)) throw error(409, 'This request ID already belongs to a different message')
  const recipient = await authorizeMessagingRecipient(ctx, account, request.to)
  if (request.replyTo?.quote) {
    if (account.platform !== 'telegram' || request.reaction !== undefined) throw error(400, 'Selected-text quotes are supported for Telegram replies')
    if (!saved) {
      const [stored] = await ctx.db.select({ payload: messagingMessage.payload }).from(messagingMessage).where(and(
        eq(messagingMessage.accountId, accountId), eq(messagingMessage.chatId, request.to),
        eq(messagingMessage.messageId, request.replyTo.id), eq(messagingMessage.senderId, request.replyTo.sender),
      )).limit(1)
      const original = stored?.payload
      if (!original || original.deleted || original.content?.viewOnce || !validTextQuote(original.content?.text || original.text || '', request.replyTo.quote)) throw error(400, 'The selected quote no longer matches the original message')
    }
  }
  if (request.editTo && !saved) {
    const [stored] = await ctx.db.select({ payload: messagingMessage.payload }).from(messagingMessage).where(and(
      eq(messagingMessage.accountId, account.id), eq(messagingMessage.chatId, request.to),
      eq(messagingMessage.messageId, request.editTo.id), eq(messagingMessage.senderId, request.editTo.sender),
    )).limit(1)
    const message = stored?.payload
    if (!message?.fromMe || message.deleted || message.content?.viewOnce || (message.content && message.content.kind !== 'text')) throw error(400, 'Only your own text messages can be edited')
    if (account.platform === 'whatsapp' && Date.now() - message.timestamp >= 15 * 60_000) throw error(409, 'WhatsApp messages can only be edited within 15 minutes')
  }
  return dispatchMessagingSend(ctx, account, request, recipient.id)
})

/** Acknowledge only stored incoming messages from the focused conversation.
 * @param params Account, authorized chat and bounded exact message targets.
 * @returns Acknowledged targets; outgoing or unavailable messages are rejected.
 */
export const markMessagingMessagesRead = guardedCommand(accountInput.extend({ chat: id, targets: z.array(target).min(1).max(100) }), async ({accountId,chat,targets},ctx) => {
  const account = await authorizeMessagingAccount(ctx,accountId)
  await authorizeMessagingRecipient(ctx,account,chat)
  for (const messageTarget of targets) {
    const [stored] = await ctx.db.select().from(messagingMessage).where(and(eq(messagingMessage.accountId,accountId),eq(messagingMessage.chatId,chat),eq(messagingMessage.messageId,messageTarget.id),eq(messagingMessage.senderId,messageTarget.sender))).limit(1)
    if (!stored || stored.payload.fromMe) throw error(400,'Read target must be a stored incoming message')
    if (stored.payload.readByMe || stored.payload.deleted) continue
    await messagingService(ctx,account.platform).messageAction(account.bridgeAccountId,chat,messageTarget,'read',crypto.randomUUID())
    // Update only this flag; concurrent edits or newer provider projections must survive.
    await ctx.db.update(messagingMessage).set({payload:sql`json_set(${messagingMessage.payload}, '$.readByMe', json('true'))`}).where(and(eq(messagingMessage.accountId,accountId),eq(messagingMessage.chatId,chat),eq(messagingMessage.messageId,messageTarget.id),eq(messagingMessage.senderId,messageTarget.sender)))
  }
  return { read: targets }
})

/** Delete a sender-owned message for everyone with a stable retry identifier.
 * @param params Account, authorized chat, exact message and immutable action ID.
 * @returns Confirmation only after the platform acknowledges the revoke.
 */
export const deleteMessagingMessage = guardedCommand(accountInput.extend({chat:id,target,requestId:z.string().uuid()}),async({accountId,chat,target:messageTarget,requestId},ctx)=>{
  const account=await authorizeMessagingAccount(ctx,accountId)
  await authorizeMessagingRecipient(ctx,account,chat)
  const [stored]=await ctx.db.select().from(messagingMessage).where(and(eq(messagingMessage.accountId,accountId),eq(messagingMessage.chatId,chat),eq(messagingMessage.messageId,messageTarget.id),eq(messagingMessage.senderId,messageTarget.sender))).limit(1)
  if(!stored?.payload.fromMe) throw error(400,'Only your own messages can be deleted for everyone')
  if(!stored.payload.deleted) await messagingService(ctx,account.platform).messageAction(account.bridgeAccountId,chat,messageTarget,'delete',requestId)
  await ctx.db.update(messagingMessage).set({payload:sql`json_set(${messagingMessage.payload}, '$.deleted', json('true'))`}).where(and(eq(messagingMessage.accountId,accountId),eq(messagingMessage.chatId,chat),eq(messagingMessage.messageId,messageTarget.id),eq(messagingMessage.senderId,messageTarget.sender)))
  return {deleted:true}
})

/** Stage media under the selected organisation account.
 * @param params Account, media metadata and bounded bytes.
 * @returns Opaque attachment ID for a subsequent immutable send.
 */
export const uploadMessagingMedia = guardedCommand(accountInput.extend({
  kind: z.enum(['image', 'audio', 'sticker', 'video', 'document']), fileName: z.string().max(255).regex(/^[^\x00-\x1f]*$/).optional(), mimeType: z.string().max(100), duration: z.number().int().min(1).max(600).optional(),
  bytes: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength > 0 && bytes.byteLength <= 8 * 1024 * 1024, 'Files must be at most 8 MiB'),
}), async ({ meta: _meta, accountId, bytes, ...input }, ctx) => {
  const account = await authorizeMessagingAccount(ctx, accountId)
  return messagingService(ctx, account.platform).upload(account.bridgeAccountId, input, Uint8Array.from(bytes).buffer)
})

/** Resolve the Telegram catalogue after the same organisation check used by uploads.
 * @param ctx Authenticated request context.
 * @param accountId Hype account identifier, never a provider account supplied by the browser.
 * @returns Authorized source and destination accounts and the private Telegram binding.
 */
async function telegramCatalogue(ctx: GuardedBaseContext, accountId: string): Promise<{ account: MessagingAccount; target: MessagingAccount; service: TelegramBinding }> {
  const target = await authorizeMessagingAccount(ctx, accountId)
  let account = target
  if (target.platform === 'whatsapp') {
    // Resolve the library from the authorised destination organisation, never a browser-supplied source.
    const [source] = await ctx.db.select().from(messagingAccount).where(and(eq(messagingAccount.organisationId, target.organisationId), eq(messagingAccount.platform, 'telegram'), eq(messagingAccount.enabled, true))).limit(1)
    if (!source) throw error(503, 'Connect this organisation’s Telegram account to browse its GIF and sticker library.')
    account = await authorizeMessagingAccount(ctx, source.id)
  }
  const service = (ctx.event.platform?.env ?? ctx.event.locals.platform?.env)?.TELEGRAM
  if (!service) throw error(503, 'Telegram media search is unavailable')
  return { account, target, service }
}

/** List installed packs from the authorised organisation library.
 * @param params Destination organisation account.
 * @returns Public pack names; credentials and Telegram access hashes stay private.
 */
export const getMessagingStickerPacks = guardedCommand(accountInput, async ({ accountId }, ctx): Promise<import('#lib/messaging/media-catalog.js').StickerPack[]> => {
  const { account, service } = await telegramCatalogue(ctx, accountId)
  return service.stickerPacks(account.bridgeAccountId)
})

/** Search the connected account's GIFs or stickers without sending a message.
 * @param params Account, bounded keyword/emoji query and provider continuation.
 * @returns Opaque search results; Telegram access hashes stay in the bridge.
 * @remarks A command avoids retaining expiring provider references in the remote query cache.
 */
export const searchMessagingMedia = guardedCommand(accountInput.extend({
  pack: z.string().regex(/^[A-Za-z0-9_]{1,64}$/).optional(), kind: z.enum(['gif', 'sticker']), query: z.string().max(200), offset: z.string().max(512).optional(), language: z.string().regex(/^[a-zA-Z-]{2,20}$/).optional(),
}), async ({ accountId, meta: _meta, ...input }, ctx): Promise<import('#lib/messaging/media-catalog.js').MediaCatalogPage> => {
  const { account, target, service } = await telegramCatalogue(ctx, accountId)
  return service.searchMedia(account.bridgeAccountId, { ...input, ...(target.platform === 'whatsapp' ? { compatibleWith: 'whatsapp' as const } : {}) })
})

/** Load a private preview using an account-local result ID.
 * @param params Authorized account and opaque result identifier.
 * @returns Bounded bytes for a browser-owned object URL.
 */
export const previewMessagingMedia = guardedCommand(accountInput.extend({ id: z.string().uuid() }), async ({ accountId, id }, ctx): Promise<Uint8Array> => {
  const { account, service } = await telegramCatalogue(ctx, accountId)
  const bytes = await service.catalogMedia(account.bridgeAccountId, id)
  if (bytes.byteLength > 8 * 1024 * 1024) throw error(413, 'Media exceeds 8 MiB')
  return new Uint8Array(bytes)
})

/** Stage a chosen result for the existing audited send flow.
 * @param params Authorized account and opaque result identifier.
 * @returns Durable attachment ID; selection alone never sends anything.
 */
export const stageMessagingMedia = guardedCommand(accountInput.extend({ id: z.string().uuid() }), async ({ accountId, id }, ctx): Promise<import('#lib/messaging/types.js').BridgeAttachment> => {
  const { account, target, service } = await telegramCatalogue(ctx, accountId)
  if (target.platform === 'telegram') return service.stageMedia(account.bridgeAccountId, id)
  const item = await service.catalogItem(account.bridgeAccountId, id)
  if (item.kind === 'gif' ? item.mimeType !== 'video/mp4' : item.mimeType !== 'image/webp') throw error(400, 'This media format cannot be sent on WhatsApp')
  const bytes = await service.catalogMedia(account.bridgeAccountId, id)
  if (!bytes.byteLength || bytes.byteLength > (item.kind === 'sticker' ? 512 * 1024 : 8 * 1024 * 1024)) throw error(413, 'This file is too large for WhatsApp')
  return messagingService(ctx, 'whatsapp').upload(target.bridgeAccountId, { kind: item.kind === 'gif' ? 'video' : 'sticker', mimeType: item.mimeType, animated: item.kind === 'gif' }, bytes)
})

/** Download media from a message belonging to the selected account.
 * @param params Authorized account and exact platform message target.
 * @returns Bounded bytes for a browser-owned object URL.
 */
export const downloadMessagingMedia = guardedCommand(accountInput.extend({ chat: id, target }), async ({ accountId, chat, target }, ctx) => {
  const account = await authorizeMessagingAccount(ctx, accountId)
  await authorizeMessagingRecipient(ctx, account, chat)
  return new Uint8Array(await messagingService(ctx, account.platform).media(account.bridgeAccountId, chat, target))
})

/** Resolve display identity without trusting a display name as a recipient association.
 * @param params Authorized account and provider-specific address.
 * @returns Provider profile and verified aliases.
 */
export const getMessagingProfile = guardedQuery(accountInput.extend({ address: id }), async ({ accountId, address }, ctx) => {
  const account = await authorizeMessagingAccount(ctx, accountId)
  if (address !== account.externalAccountId) await authorizeMessagingRecipient(ctx, account, address)
  return messagingService(ctx, account.platform).profile(account.bridgeAccountId, address)
})

/** List only organisations whose private inbox this actor may operate.
 * @param params Explicit administration intent.
 * @returns Minimal organisation choices, filtered by the same per-operation policy.
 */
export const getMessagingOrganisations = guardedQuery(z.object({ meta }), async (_params, ctx) => {
  const rows = await ctx.db.select({
    id: organisation.id, code: organisation.code, hubId: organisation.hubId, isArchived: organisation.isArchived,
    hasMessaging: sql<boolean>`count(${messagingAccount.id}) > 0`.mapWith(Boolean),
  }).from(organisation)
    .leftJoin(messagingAccount, and(eq(messagingAccount.organisationId, organisation.id), isNotNull(messagingAccount.externalAccountId)))
    .where(eq(organisation.isArchived, false)).groupBy(organisation.id).orderBy(asc(organisation.code), asc(organisation.id))
  return rows.filter(target => canManageOrganisationMessaging({ ...ctx.user, roles: ctx.userRoles }, target)).map(({ id, code, hasMessaging }) => ({
    id, code, hasMessaging,
    isMember: ctx.userRoles.some(role => role.type === 'organisation' && role.organisationId === id && (role.role === 'member' || role.role === 'owner')),
  }))
})

/** Search active Hype people and explain whether the organisation can reach their preferred platform.
 * @param params Authorized organisation and a literal name or Hype username search.
 * @returns At most twenty public Hype profiles and verified routing metadata, never arbitrary provider accounts.
 * @remarks Database-only search; uncached availability is checked separately. No provider requests are made here.
 */
export const searchMessagingUsers = guardedQuery(z.object({ meta, organisationId: id, search: z.string().trim().min(1).max(100) }), async ({ organisationId, search }, ctx) => {
  await authorizeMessagingOrganisation(ctx, organisationId)
  const [whatsapp, telegram] = await Promise.all(['whatsapp', 'telegram'].map(platform => searchMessagingPlatform(ctx, organisationId, search, platform as 'whatsapp' | 'telegram')))
  return whatsapp.map(row => ({ ...row, ...messagingAvailability([row, telegram.find(value => value.userId === row.userId)!]) }))
})

/** Read one platform's cached availability without provider I/O.
 * @param ctx Authorized context.
 * @param organisationId Selected organisation.
 * @param search Literal HYPE directory query.
 * @param platform Platform to inspect independently of preferences.
 * @returns Directory matches with platform-scoped cached availability.
 */
async function searchMessagingPlatform(ctx: GuardedBaseContext, organisationId: string, search: string, platform: 'whatsapp' | 'telegram') {
  const pattern = `%${search.replace(/^@/, '').replace(/[!%_]/g, character => `!${character}`)}%`
  const effectivePlatform = sql<'whatsapp' | 'telegram'>`${platform}`
  const rows = await ctx.db.select({
    userId: user.id, name: user.name, username: user.username, image: user.image, telephone: user.telephone,
    platform: effectivePlatform, address: userMessagingIdentity.address,
    accountId: messagingAccount.id, externalAccountId: messagingAccount.externalAccountId, enabled: messagingAccount.enabled,
    storedRecipientId: messagingConversation.recipientUserId,
    cachedAddress: messagingPhoneLookup.address, cachedReason: messagingPhoneLookup.reason, cachedAt: messagingPhoneLookup.checkedAt,
  }).from(user)
    .leftJoin(userMessagingIdentity, and(eq(userMessagingIdentity.userId, user.id), eq(userMessagingIdentity.platform, effectivePlatform), isNotNull(userMessagingIdentity.verifiedAt), or(isNull(userMessagingIdentity.sourceTelephone), eq(userMessagingIdentity.sourceTelephone, user.telephone))))
    .leftJoin(messagingAccount, and(eq(messagingAccount.organisationId, organisationId), eq(messagingAccount.platform, effectivePlatform)))
    .leftJoin(messagingConversation, and(eq(messagingConversation.accountId, messagingAccount.id), eq(messagingConversation.chatId, userMessagingIdentity.address)))
    .leftJoin(messagingPhoneLookup, and(eq(messagingPhoneLookup.accountId, messagingAccount.id), eq(messagingPhoneLookup.userId, user.id), eq(messagingPhoneLookup.telephone, user.telephone), eq(messagingPhoneLookup.externalAccountId, messagingAccount.externalAccountId), gt(messagingPhoneLookup.expiresAt, Date.now())))
    .where(and(eq(user.isArchived, false), eq(user.isAnonymous, false), isNotNull(user.username),
      or(sql`${user.username} like ${pattern} escape '!'`, sql`${user.name} like ${pattern} escape '!'`)))
    .orderBy(asc(user.name), asc(user.username), asc(user.id)).limit(20)
  return rows.map(row => {
    const connected = Boolean(row.accountId && row.externalAccountId && row.enabled)
    const address = row.address ?? row.cachedAddress
    const checking = connected && !row.address && !row.cachedAt && Boolean(normalizeTelephone(row.telephone))
    const unavailableReason = !connected ? `Connect this organisation’s ${row.platform === 'telegram' ? 'Telegram' : 'WhatsApp'} account first`
      : checking ? `Checking ${row.platform === 'telegram' ? 'Telegram' : 'WhatsApp'}…`
      : !address ? row.cachedReason ?? 'No valid phone number on this HYPE profile'
      : row.storedRecipientId && row.storedRecipientId !== row.userId ? 'This conversation belongs to a different recipient; review the identity association'
      : null
    return { userId: row.userId, name: row.name, username: row.username!, image: row.image, platform: row.platform,
      accountId: row.accountId, chatId: address, available: unavailableReason === null, unavailableReason, checking }
  })
}

/** Check one platform without blocking directory results or the other platform.
 * @param params Organisation, HYPE user and explicit platform.
 * @returns Independently cached platform availability.
 */
export const checkMessagingUser = guardedCommand(z.object({ meta, organisationId: id, userId: id, platform: z.enum(['whatsapp', 'telegram']) }), async ({ organisationId, userId, platform }, ctx) => {
  await authorizeMessagingOrganisation(ctx, organisationId)
  return checkUserPlatform(ctx, organisationId, userId, platform)
})

/** Resolve a platform for an authorized organisation while honoring verified manual identities.
 * @param ctx Authorized context.
 * @param organisationId Organisation account owner.
 * @param userId Active HYPE recipient.
 * @param platform Explicit discovery platform.
 * @returns Reachability for this platform only.
 */
async function checkUserPlatform(ctx: GuardedBaseContext, organisationId: string, userId: string, platform: 'whatsapp' | 'telegram') {
  const [recipient] = await ctx.db.select({ id: user.id, telephone: user.telephone }).from(user)
    .where(and(eq(user.id, userId), eq(user.isArchived, false), eq(user.isAnonymous, false), isNotNull(user.username))).limit(1)
  if (!recipient) throw error(404, 'User not found')
  const [account] = await ctx.db.select().from(messagingAccount).where(and(eq(messagingAccount.organisationId, organisationId), eq(messagingAccount.platform, platform))).limit(1)
  const base = { platform, accountId: account?.id ?? null, checking: false }
  if (!account?.enabled || !account.externalAccountId) return { ...base, chatId: null, available: false, unavailableReason: `Connect this organisation’s ${platform === 'telegram' ? 'Telegram' : 'WhatsApp'} account first` }
  const [identity] = await ctx.db.select().from(userMessagingIdentity).where(and(eq(userMessagingIdentity.userId, userId), eq(userMessagingIdentity.platform, platform), isNotNull(userMessagingIdentity.verifiedAt), or(isNull(userMessagingIdentity.sourceTelephone), eq(userMessagingIdentity.sourceTelephone, recipient.telephone ?? '')))).limit(1)
  const result = identity ? { address: identity.address, reason: null } : await resolveMessagingPhone(ctx, account, recipient)
  return { ...base, chatId: result.address, available: Boolean(result.address), unavailableReason: result.reason }
}

/** Issue an organisation-scoped call capability for the operator's browser origin.
 * @param params Account selection; the server resolves the actual voice bridge.
 * @returns Short-lived ticket, separate from its WebSocket URL.
 */
export const getMessagingVoiceTicket = guardedCommand(viewerInput, async ({ accountId, tabId }, ctx) => {
  const account = await authorizeMessagingAccount(ctx, accountId)
  const env = ctx.event.platform?.env ?? ctx.event.locals.platform?.env
  if (account.platform === 'telegram') {
    if (!env?.TELEGRAM || !env.TELEGRAM_CALLS_URL) throw error(503, 'The Telegram call service is not configured')
    const ticket = await env.TELEGRAM.callTicket(account.bridgeAccountId, ctx.event.url.origin, await messagingViewer(ctx, tabId))
    return { url: `${env.TELEGRAM_CALLS_URL.replace(/\/$/, '')}/${encodeURIComponent(ticket.account)}`, token: ticket.token, expiresAt: ticket.expiresAt }
  }
  if (!env?.WHATSOVER || !env.WHATSOVER_VOICE_URL) throw error(503, 'The voice service is not configured')
  const ticket = await env.WHATSOVER.voiceTicket(account.bridgeAccountId, ctx.event.url.origin)
  return { url: `${env.WHATSOVER_VOICE_URL.replace(/\/$/, '')}/${encodeURIComponent(ticket.account)}`, token: ticket.token, expiresAt: ticket.expiresAt }
})

/** Decline a call within the same authorised organisation account.
 * @param params Account and bridge-issued call ID.
 * @returns Confirmation after provider submission.
 */
export const declineMessagingCall = guardedCommand(accountInput.extend({ id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/) }), async ({ accountId, id }, ctx) => {
  const account = await authorizeMessagingAccount(ctx, accountId)
  const env = ctx.event.platform?.env ?? ctx.event.locals.platform?.env
  if (account.platform === 'telegram') {
    if (!env?.TELEGRAM) throw error(503, 'The Telegram service is not configured')
    await env.TELEGRAM.rejectCall(account.bridgeAccountId, id)
    return { declined: true }
  }
  if (!env?.WHATSOVER) throw error(503, 'The WhatsApp service is not configured')
  await env.WHATSOVER.rejectCall(account.bridgeAccountId, id)
  return { declined: true }
})

/** Resolve a real user before reading or changing their messaging preferences.
 * @param ctx Authenticated actor and server-resolved roles.
 * @param userId Target user, defaulting to the signed-in account.
 * @returns The existing active user's ID.
 */
async function authorizeMessagingUser(ctx: GuardedBaseContext, userId: string): Promise<string> {
  if (ctx.user.isAnonymous !== false || !canUpdateUserProfile({ userId: ctx.user.id, isAuthenticated: true, superAdmin: ctx.user.superAdmin === true || isCoreHubAdmin(ctx.userRoles) }, userId)) {
    throw error(403, 'You cannot manage this user’s messaging preferences')
  }
  const [target] = await ctx.db.select({ id: user.id }).from(user).where(and(eq(user.id, userId), eq(user.isArchived, false), eq(user.isAnonymous, false))).limit(1)
  if (!target) throw error(404, 'User not found')
  return target.id
}

/** Read a user's preferred platform and their claimed/verified recipient identities.
 * @param params User ID, omitted for the signed-in user.
 * @returns Preference and identities; these are private profile data.
 */
export const getUserMessagingSettings = guardedQuery(z.object({ userId: id.optional() }), async ({ userId }, ctx) => {
  const target = await authorizeMessagingUser(ctx, userId ?? ctx.user.id)
  const [preference] = await ctx.db.select().from(userMessagingPreference).where(eq(userMessagingPreference.userId, target)).limit(1)
  const identities = await ctx.db.select({ platform: userMessagingIdentity.platform, address: userMessagingIdentity.address, verifiedAt: userMessagingIdentity.verifiedAt })
    .from(userMessagingIdentity).where(eq(userMessagingIdentity.userId, target))
  return { platform: preference?.platform ?? 'whatsapp', identities }
})

/** Change the preferred platform for future outreach without moving existing conversations or sends.
 * @param params User and preferred platform, or null to restore the WhatsApp default.
 * @returns The saved preference.
 */
export const setUserMessagingPreference = guardedCommand(z.object({ userId: id.optional(), platform: z.enum(['whatsapp', 'telegram']).nullable() }), async ({ userId, platform }, ctx) => {
  const target = await authorizeMessagingUser(ctx, userId ?? ctx.user.id)
  await ctx.db.insert(userMessagingPreference).values({ userId: target, platform, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: userMessagingPreference.userId, set: { platform, updatedAt: Date.now() } })
  return { platform: platform ?? 'whatsapp' }
})

/** Save a recipient claim; changing it always clears its previous verification.
 * @param params User, platform and address; null removes an association.
 * @returns Confirmation; unverified claims never drive automatic routing.
 */
export const setUserMessagingIdentity = guardedCommand(z.object({ userId: id.optional(), platform: z.enum(['whatsapp', 'telegram']), address: z.string().trim().min(1).max(100).nullable() }), async ({ userId, platform, address }, ctx) => {
  const target = await authorizeMessagingUser(ctx, userId ?? ctx.user.id)
  const key = and(eq(userMessagingIdentity.userId, target), eq(userMessagingIdentity.platform, platform))
  if (address === null) { await ctx.db.delete(userMessagingIdentity).where(key); return { saved: true } }
  const normalized = platform === 'whatsapp' ? address.replace(/[ ()-]/g, '').replace(/^\+([1-9]\d{6,14})$/, '$1@s.whatsapp.net') : address
  if (platform === 'whatsapp' ? !/^[1-9]\d{6,14}@s\.whatsapp\.net$/.test(normalized) : !/^([1-9]\d{0,15}|@[a-zA-Z0-9_]{5,32}|\+[1-9]\d{6,14})$/.test(normalized)) throw error(400, 'Use an international phone number or a Telegram username/user ID')
  const [previous] = await ctx.db.select().from(userMessagingIdentity).where(key).limit(1)
  if (previous?.address === normalized) return { saved: true }
  try {
    await ctx.db.insert(userMessagingIdentity).values({ userId: target, platform, address: normalized, updatedAt: Date.now() })
      .onConflictDoUpdate({ target: [userMessagingIdentity.userId, userMessagingIdentity.platform], set: { address: normalized, sourceTelephone: null, verifiedAt: null, verifiedBy: null, updatedAt: Date.now() } })
  } catch (cause) {
    if (String(cause).includes('UNIQUE') || String((cause as Error)?.cause).includes('UNIQUE')) throw error(409, 'This messaging identity is already associated with another user')
    throw cause
  }
  return { saved: true }
})

/** Confirm the person-to-account association after an administrator checks ownership.
 * @param params User, organisation account, expected claim, and explicit ownership confirmation.
 * @returns The provider-resolved stable address.
 * @remarks Provider lookup proves the address exists, not who owns it. The operator
 * must independently confirm ownership; usernames and display names are insufficient.
 */
export const verifyUserMessagingIdentity = guardedCommand(accountInput.extend({ userId: id, address: id, confirmOwnership: z.literal(true) }), async ({ accountId, userId, address }, ctx) => {
  await authorizeMessagingUser(ctx, userId)
  if (!(ctx.user.superAdmin === true || isCoreHubAdmin(ctx.userRoles))) throw error(403, 'Recipient verification requires a global administrator')
  const account = await authorizeMessagingAccount(ctx, accountId)
  const key = and(eq(userMessagingIdentity.userId, userId), eq(userMessagingIdentity.platform, account.platform), eq(userMessagingIdentity.address, address))
  const [claim] = await ctx.db.select().from(userMessagingIdentity).where(key).limit(1)
  if (!claim) throw error(409, 'The recipient claim changed; review it again')
  const profile = await messagingService(ctx, account.platform).profile(account.bridgeAccountId, claim.address)
  if (account.platform === 'telegram' ? !/^[1-9]\d*$/.test(profile.jid) : !/^[1-9]\d+@(s\.whatsapp\.net|lid)$/.test(profile.jid)) throw error(400, 'A user identity is required, not a group or channel')
  const rows = await ctx.db.update(userMessagingIdentity).set({ address: profile.jid, sourceTelephone: null, verifiedAt: Date.now(), verifiedBy: ctx.user.id, updatedAt: Date.now() })
    .where(key).returning({ userId: userMessagingIdentity.userId })
  if (!rows.length) throw error(409, 'The recipient claim changed; review it again')
  return { address: profile.jid }
})

/** Open new outreach on WhatsApp when reachable, otherwise Telegram, using verified identity.
 * @param params Authorized organisation and an exact Hype username.
 * @returns A conversation pinned to the selected organisation account and native chat.
 * @remarks Existing conversations and immutable sends continue using their saved account.
 */
export const openUserMessagingConversation = guardedCommand(z.object({ meta, organisationId: id, username: z.string().trim().min(1).max(100), platform: z.enum(['whatsapp', 'telegram']).optional() }), async ({ organisationId, username, platform: requestedPlatform }, ctx) => {
  await authorizeMessagingOrganisation(ctx, organisationId)
  const [recipient] = await ctx.db.select({ id: user.id, telephone: user.telephone }).from(user).where(and(eq(user.username, username.replace(/^@/, '').toLowerCase()), eq(user.isArchived, false), eq(user.isAnonymous, false))).limit(1)
  if (!recipient) throw error(404, 'User not found')
  const channels = await Promise.all((requestedPlatform ? [requestedPlatform] : ['whatsapp', 'telegram'] as const).map(platform => checkUserPlatform(ctx, organisationId, recipient.id, platform)))
  const selected = requestedPlatform ? channels[0] : messagingAvailability(channels)
  if (!selected.available) throw error(409, channels.map(channel => channel.unavailableReason).filter(Boolean).join('; '))
  const platform = selected.platform
  const [account] = await ctx.db.select().from(messagingAccount).where(and(eq(messagingAccount.organisationId, organisationId), eq(messagingAccount.platform, platform))).limit(1)
  if (!account || !account.externalAccountId || !account.enabled) throw error(409, `Connect this organisation’s ${platform === 'telegram' ? 'Telegram' : 'WhatsApp'} account first`)
  let [identity] = await ctx.db.select().from(userMessagingIdentity).where(and(eq(userMessagingIdentity.userId, recipient.id), eq(userMessagingIdentity.platform, platform), isNotNull(userMessagingIdentity.verifiedAt))).limit(1)
  if (!identity || (identity.sourceTelephone !== null && identity.sourceTelephone !== recipient.telephone)) {
    const resolved = await resolveMessagingPhone(ctx, account, recipient)
    if (!resolved.address) throw error(409, resolved.reason ?? 'Unable to resolve this phone number')
    // Bind the write atomically to the unchanged profile phone; concurrent manual verification wins.
    const now = Date.now()
    try {
      await ctx.db.insert(userMessagingIdentity).select(ctx.db.select({
        userId: user.id, platform: sql`${platform}`.as('platform'), address: sql`${resolved.address}`.as('address'),
        sourceTelephone: user.telephone, verifiedAt: sql`${now}`.as('verifiedAt'), verifiedBy: sql`null`.as('verifiedBy'), updatedAt: sql`${now}`.as('updatedAt'),
      }).from(user).where(and(eq(user.id, recipient.id), eq(user.telephone, recipient.telephone!), eq(user.isArchived, false), eq(user.isAnonymous, false))))
        .onConflictDoUpdate({ target: [userMessagingIdentity.userId, userMessagingIdentity.platform],
          set: { address: resolved.address, sourceTelephone: recipient.telephone, verifiedAt: now, verifiedBy: null, updatedAt: now },
          setWhere: or(isNotNull(userMessagingIdentity.sourceTelephone), isNull(userMessagingIdentity.verifiedAt)),
        })
    } catch { throw error(409, 'The phone identity could not be associated; review the profile and retry') }
    ;[identity] = await ctx.db.select().from(userMessagingIdentity).where(and(eq(userMessagingIdentity.userId, recipient.id), eq(userMessagingIdentity.platform, platform), isNotNull(userMessagingIdentity.verifiedAt))).limit(1)
    const [current] = await ctx.db.select({ telephone: user.telephone }).from(user).where(eq(user.id, recipient.id)).limit(1)
    if (!identity || (identity.sourceTelephone !== null && identity.sourceTelephone !== current?.telephone)) throw error(409, 'The profile phone changed; search again')
  }
  // An inbox thread may predate identity verification; fill only its missing association.
  await ctx.db.insert(messagingConversation).values({ id: crypto.randomUUID(), accountId: account.id, chatId: identity.address, recipientUserId: recipient.id })
    .onConflictDoUpdate({
      target: [messagingConversation.accountId, messagingConversation.chatId],
      set: { recipientUserId: sql`coalesce(${messagingConversation.recipientUserId}, excluded.recipientUserId)` },
    })
  const [conversation] = await ctx.db.select().from(messagingConversation).where(and(eq(messagingConversation.accountId, account.id), eq(messagingConversation.chatId, identity.address))).limit(1)
  if (conversation?.recipientUserId && conversation.recipientUserId !== recipient.id) throw error(409, 'This conversation belongs to a different recipient; review the identity association')
  return { id: conversation!.id, accountId: account.id, platform: account.platform, chatId: identity.address }
})

/** Configure this browser's private organisation notification subscription.
 * @param params Explicit action, organisation and browser-generated subscription.
 * @returns Public VAPID key or current subscription state; secrets remain in the notification worker.
 */
export const configureMessagingNotifications = guardedCommand(z.object({meta,organisationId:id,action:z.enum(['key','status','subscribe','unsubscribe','focus','blur']),endpoint:z.string().url().max(2048).optional(),subscription:z.object({endpoint:z.string().url().max(2048),expirationTime:z.number().nullable().optional(),keys:z.object({p256dh:z.string().min(1).max(256),auth:z.string().min(1).max(128)})}).optional()}),async({organisationId,action,endpoint,subscription},ctx)=>{
  await authorizeMessagingOrganisation(ctx,organisationId)
  const service=(ctx.event.platform?.env??ctx.event.locals.platform?.env)?.MESSAGING_NOTIFICATIONS
  if(!service)throw error(503,'Background notifications are not configured for this environment')
  if(action==='key')return {publicKey:await service.publicKey()}
  if(action==='subscribe'){
    if(!subscription)throw error(400,'Browser subscription required')
    await service.subscribe(ctx.user.id,organisationId,subscription,ctx.event.url.origin)
    return {enabled:true}
  }
  if(!endpoint)throw error(400,'Browser endpoint required')
  if(action==='status')return {enabled:await service.status(ctx.user.id,organisationId,endpoint)}
  if(action==='focus'||action==='blur'){await service.focus(ctx.user.id,organisationId,endpoint,action==='focus');return {enabled:true}}
  await service.unsubscribe(ctx.user.id,organisationId,endpoint)
  return {enabled:false}
})
