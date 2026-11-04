// SVELTE
import { error } from '@sveltejs/kit'
// THIRD PARTY
import { z } from 'zod'
// API
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'
import type { WhatsoverBinding, WhatsAppAttachment, WhatsAppProfile, WhatsAppSend, WhatsAppSnapshot, WhatsAppStatus, WhatsAppVoiceTicket } from '#lib/api/services/whatsover.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// - authorizedAccount (retired personal-account boundary)
// - getWhatsApp
// - connectWhatsApp
// - disconnectWhatsApp
// - sendWhatsApp
// - uploadWhatsAppMedia
// - downloadWhatsAppMedia
// - getWhatsAppProfile
// - getWhatsAppVoiceTicket
// - declineWhatsAppCall

const meta = z.object({ isAdminRequest: z.literal(true) })
const adminInput = z.object({ meta })

/** Reject retired administrator-owned endpoints before any provider access.
 * @param _ctx Authenticated request context, deliberately unused for account selection.
 * @returns Never; callers must select an organisation account in the shared inbox.
 * @remarks Existing linked-device data is preserved. It must not be assigned to an
 * organisation by guessing from an operator's memberships. Retaining these endpoint
 * signatures gives older clients an explicit migration error instead of allowing
 * another administrator-owned registration, send, media fetch, or call.
 */
function authorizedAccount(_ctx: GuardedBaseContext): { service: WhatsoverBinding; account: string } {
  throw error(410, 'Personal WhatsApp sessions have moved. Open Messaging and select an organisation account.')
}

/** Retired: read connection state and newly received messages for this administrator.
 * @param params Inbox cursor and explicit admin intent.
 * @returns Pairing status, new inbox rows, and recent send attempts.
 * @remarks QR data is sensitive and is returned only to this authenticated view.
 */
export const getWhatsApp = guardedQuery(
  z.object({ meta, after: z.number().int().nonnegative().default(0) }),
  async (params, ctx): Promise<WhatsAppSnapshot> => {
    const { service, account } = authorizedAccount(ctx)
    // SvelteKit sets private, no-store for remote responses; setHeaders is
    // forbidden inside remote functions, including guarded queries.
    try {
      return await service.snapshot(account, params.after)
    } catch (cause) {
      // Only a missing method permits the legacy path during a deferred DO
      // rollout. Connection/storage failures must remain visible to the caller.
      if (!(cause instanceof Error && /(?:does not implement.*["']snapshot["']|snapshot.*is not a function)/.test(cause.message))) throw cause
    }
    const [status, messages, outbox] = await Promise.all([
      service.status(account), service.inbox(account, params.after, 100), service.outbox(account, 50),
    ])
    // Existing account objects may briefly retain old code during a deferred rollout.
    let calls: WhatsAppSnapshot['calls']
    try { calls = await service.callSnapshot(account) } catch { /* Keep messaging available during voice rollout. */ }
    return { status, messages, outbox, calls, voiceAvailable: Boolean(calls) }
  },
)

/** Retired: start or resume this administrator's linked-device connection.
 * @param params Explicit admin intent.
 * @returns Initial connection state; the query supplies rotating QR codes.
 */
export const connectWhatsApp = guardedCommand(adminInput, async (_params, ctx): Promise<WhatsAppStatus> => {
  const { service, account } = authorizedAccount(ctx)
  return service.start(account, ctx.event.locals.platform?.env.ENVIRONMENT || 'production')
})

/** Retired: stop the connection and recovery alarm while retaining login state.
 * @param params Explicit admin intent.
 * @returns Confirmation once the service has stopped and flushed state.
 */
export const disconnectWhatsApp = guardedCommand(adminInput, async (_params, ctx): Promise<{ stopped: true }> => {
  const { service, account } = authorizedAccount(ctx)
  await service.stop(account)
  return { stopped: true }
})

/** Retired: send a text, quoted reply, or reaction using the caller's stable request ID.
 * @param params Intended recipient, body, request ID, and admin intent.
 * @returns The durable send result, including uncertain outcomes.
 * @remarks Repeating the same request does not initiate another send. The
 * service rejects reuse of a request ID with a different message or recipient.
 */
export const sendWhatsApp = guardedCommand(
  z.object({
    meta,
    requestId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/),
    to: z.string().min(1).max(100),
    text: z.string().max(16_384),
    replyTo: z.object({ id: z.string().min(1).max(128), sender: z.string().min(1).max(100) }).strict().optional(),
    reaction: z.string().max(64).optional(),
    attachmentId: z.string().uuid().optional(),
  }).refine(value => value.reaction !== undefined
    ? !value.attachmentId && value.text === '' && value.replyTo !== undefined && new TextEncoder().encode(value.reaction).length <= 64
    : value.attachmentId !== undefined || value.text.trim().length > 0, 'Provide a message, or a reaction with a target'),
  async ({ meta: _meta, ...request }, ctx): Promise<WhatsAppSend> => {
    const { service, account } = authorizedAccount(ctx)
    return service.send(account, request)
  },
)

/** Retired: stage a bounded media upload without sending a message.
 * @param params Validated bytes and media kind under the authenticated account.
 * @returns Opaque attachment ID and display metadata; never CDN credentials.
 */
export const uploadWhatsAppMedia = guardedCommand(
  z.object({ meta, kind: z.enum(['image', 'audio', 'sticker']), mimeType: z.string().max(100), duration: z.number().int().min(1).max(600).optional(), bytes: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength > 0 && bytes.byteLength <= 8 * 1024 * 1024, 'Files must be at most 8 MiB') }),
  async ({ meta: _meta, bytes, ...input }, ctx): Promise<WhatsAppAttachment> => {
    const { service, account } = authorizedAccount(ctx)
    return service.upload(account, input, Uint8Array.from(bytes).buffer)
  },
)

/** Retired: retrieve authenticated plaintext for a stored message from this account.
 * @param params Conversation and exact sender/message target.
 * @returns Bounded bytes for a browser-owned object URL.
 * @remarks Remote responses are private/no-store; URLs and keys remain in the bridge.
 */
export const downloadWhatsAppMedia = guardedCommand(
  z.object({ meta, chat: z.string().min(1).max(100), target: z.object({ id: z.string().min(1).max(128), sender: z.string().min(1).max(100) }).strict() }),
  async ({ chat, target }, ctx): Promise<Uint8Array> => {
    const { service, account } = authorizedAccount(ctx)
    return new Uint8Array(await service.media(account, chat, target))
  },
)


/** Retired: resolve a contact/group display identity and an authorized thumbnail.
 * @param params Phone number or JID under the administrator's linked account.
 * @returns Saved/display name, handle, verified aliases, and private thumbnail data.
 * @remarks WhatsApp privacy restrictions are respected; missing photos stay null.
 */
export const getWhatsAppProfile = guardedQuery(
  z.object({ meta, jid: z.string().min(1).max(100) }),
  async ({ jid }, ctx): Promise<WhatsAppProfile> => {
    const { service, account } = authorizedAccount(ctx)
    return service.profile(account, jid)
  },
)

/** Retired: issue a single-use voice ticket for this authenticated administrator and browser origin.
 * @param params Explicit admin intent; account and Origin are resolved on the server.
 * @returns A short-lived WebSocket capability, never placed in a URL.
 */
export const getWhatsAppVoiceTicket = guardedCommand(adminInput, async (_params, ctx): Promise<WhatsAppVoiceTicket> => {
  const { service, account } = authorizedAccount(ctx)
  const ticket = await service.voiceTicket(account, ctx.event.url.origin)
  return { url: `wss://hype-whatsover-voice-prod.hypehk.workers.dev/voice/${ticket.account}`, token: ticket.token, expiresAt: ticket.expiresAt }
})

/** Retired: decline an offered call without microphone access or opening a media connection.
 * @param params The server-issued incoming call ID and explicit admin intent.
 * @returns Confirmation after the SDK submits the decline.
 */
export const declineWhatsAppCall = guardedCommand(
  z.object({ meta, id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/) }),
  async ({ id }, ctx): Promise<{ declined: true }> => {
    const { service, account } = authorizedAccount(ctx)
    await service.rejectCall(account, id)
    return { declined: true }
  },
)
