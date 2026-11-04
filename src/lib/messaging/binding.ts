// TYPES
import type { BridgeAttachment, BridgeDialogCursor, BridgeDialogPage, BridgeHistoryPage, BridgeProfile, BridgeSnapshot, BridgeStatus, BridgeUpload, LoginInput, MessageTarget, SendRequest, SendResult } from './types'

/** Private provider RPC surface. Account selection and permissions belong to Hype. */
export interface MessagingBinding {
  messageAction(account: string, chat: string, target: MessageTarget, action: 'read' | 'delete', requestId: string): Promise<void>
  watch(account: string, viewer: string, stage?: string): Promise<BridgeStatus>
  unwatch(account: string, viewer: string): Promise<void>
  start(account: string, stage?: string): Promise<BridgeStatus>
  stop(account: string): Promise<void>
  snapshot(account: string, after: number): Promise<BridgeSnapshot>
  send(account: string, request: SendRequest): Promise<SendResult>
  lookupPhone(account: string, phone: string): Promise<import('#lib/messaging/types.js').PhoneLookup>
  profile(account: string, address: string): Promise<BridgeProfile>
  upload(account: string, input: BridgeUpload, bytes: ArrayBuffer): Promise<BridgeAttachment>
  media(account: string, chat: string, target: MessageTarget): Promise<ArrayBuffer>
}

/** Telegram registration supports QR and phone/2FA authentication. */
export interface TelegramBinding extends MessagingBinding {
  stickerPacks(account: string): Promise<import('./media-catalog').StickerPack[]>
  catalogItem(account: string, id: string): Promise<import('./media-catalog').MediaCatalogItem>
  searchMedia(account: string, input: import('./media-catalog').MediaCatalogQuery): Promise<import('./media-catalog').MediaCatalogPage>
  catalogMedia(account: string, id: string): Promise<ArrayBuffer>
  stageMedia(account: string, id: string): Promise<BridgeAttachment>
  callTicket(account: string, origin: string, viewer: string): Promise<{ account: string; token: string; expiresAt: number }>
  rejectCall(account: string, id: string): Promise<void>
  dialogs(account: string, cursor?: BridgeDialogCursor): Promise<BridgeDialogPage>
  history(account: string, chat: string, before?: string): Promise<BridgeHistoryPage>
  login(account: string, input: LoginInput): Promise<BridgeStatus>
  unlink(account: string): Promise<void>
}
