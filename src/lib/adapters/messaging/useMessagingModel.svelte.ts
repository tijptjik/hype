// API
import {
  getMessagingStickerPacks,
  searchMessagingMedia,
  previewMessagingMedia,
  stageMessagingMedia,
} from '#lib/api/messaging.remote.js'
import {
  loadMessagingQuotedMessage,
  searchMessagingMessages,
  markMessagingMessagesRead,
  deleteMessagingMessage,
  connectMessagingAccount,
  declineMessagingCall,
  disconnectMessagingAccount,
  downloadMessagingMedia,
  getMessagingInbox,
  getMessagingProfile,
  getMessagingVoiceTicket,
  loadMessagingConversations,
  loadMessagingHistory,
  sendMessagingMessage,
  unwatchMessagingAccount,
  uploadMessagingMedia,
  watchMessagingAccount,
} from '#lib/api/messaging.remote.js'
// ADAPTER
import { createWhatsAppModel } from '#lib/adapters/whatsapp/useWhatsAppModel.svelte.js'
// TYPES
import type { BridgeDialogCursor, MessagingPlatform } from '#lib/messaging/types.js'
import type { WhatsAppConsoleModel } from '#lib/bits/patterns/whatsapp/whatsapp.types.js'

/** Bind the shared composer, media, and call UI to a linked provider account.
 * @param account Account record selected from an authorized organisation listing.
 * @param cacheOwner Authenticated operator ID used to isolate persistent media caches.
 * @returns Shared chat presentation state pinned to this account for its entire lifetime.
 */
export function createMessagingModel(
  account: { id: string; platform: MessagingPlatform; organisationCode: string },
  cacheOwner?: string,
): WhatsAppConsoleModel {
  const input = { meta: { isAdminRequest: true as const }, accountId: account.id }
  const model: WhatsAppConsoleModel = createWhatsAppModel({
    viewId: account.id,
    cacheScope: cacheOwner ? `${cacheOwner}:${account.id}` : undefined,
    recipientLocked: true,
    preserveNativeChatIds: true,
    platform: account.platform,
    configurationHref: `/admin/organisations/${encodeURIComponent(account.organisationCode)}#messaging`,
    transport: {
      stickerPacks: () => getMessagingStickerPacks(input),
      searchMedia: (
        query: import('#lib/messaging/media-catalog.js').MediaCatalogQuery,
      ) => searchMessagingMedia({ ...input, ...query }),
      catalogMedia: (id: string) => previewMessagingMedia({ ...input, id }),
      stageMedia: (id: string) => stageMessagingMedia({ ...input, id }),
      quotedMessage: (chat, source) =>
        loadMessagingQuotedMessage({ ...input, chat, source }),
      search: (chat, search) => searchMessagingMessages({ ...input, chat, search }),
      read: (chat, targets) => markMessagingMessagesRead({ ...input, chat, targets }),
      deleteMessage: (chat, target, requestId) =>
        deleteMessagingMessage({ ...input, chat, target, requestId }),
      ...(account.platform === 'telegram'
        ? {
            dialogs: (cursor?: BridgeDialogCursor) =>
              loadMessagingConversations({ ...input, cursor }),
            history: (chat: string, before?: string) =>
              loadMessagingHistory({ ...input, chat, before }),
          }
        : {}),
      async snapshot(after) {
        const query = getMessagingInbox({
          ...input,
          after,
          ...(model.selectedChat ? { chat: model.selectedChat } : {}),
        })
        await query.refresh()
        return await query
      },
      connect: tabId => connectMessagingAccount({ ...input, tabId }),
      disconnect: () => disconnectMessagingAccount(input),
      send: request => sendMessagingMessage({ ...input, ...request }),
      profile: address => getMessagingProfile({ ...input, address }),
      upload: upload => uploadMessagingMedia({ ...input, ...upload }),
      media: (chat, target) => downloadMessagingMedia({ ...input, chat, target }),
      voiceTicket: tabId => getMessagingVoiceTicket({ ...input, tabId }),
      declineCall: id => declineMessagingCall({ ...input, id }),
      watch: tabId => watchMessagingAccount({ ...input, tabId }),
      unwatch: tabId => unwatchMessagingAccount({ ...input, tabId }),
    },
  })
  return model
}
