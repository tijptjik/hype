// TYPES
import type {
  BridgeAttachment,
  BridgeDialogCursor,
  BridgeDialogPage,
  BridgeHistoryPage,
  BridgeProfile,
  BridgeSnapshot,
  BridgeStatus,
  BridgeUpload,
  MessageTarget,
  SendRequest,
  SendResult,
} from './types'

/** Browser-side transport keeps the existing media/composer UI independent of a provider. */
export interface ChatTransport {
  stickerPacks?(): Promise<import('./media-catalog').StickerPack[]>
  searchMedia?(
    input: import('./media-catalog').MediaCatalogQuery,
  ): Promise<import('./media-catalog').MediaCatalogPage>
  catalogMedia?(id: string): Promise<Uint8Array>
  stageMedia?(id: string): Promise<BridgeAttachment>
  quotedMessage?(
    chat: string,
    source: MessageTarget,
  ): Promise<import('./types').BridgeMessage | null>
  search?(chat: string, search: string): Promise<import('./types').BridgeMessage[]>
  read?(chat: string, targets: MessageTarget[]): Promise<unknown>
  deleteMessage?(
    chat: string,
    target: MessageTarget,
    requestId: string,
  ): Promise<unknown>
  dialogs?(cursor?: BridgeDialogCursor): Promise<BridgeDialogPage>
  history?(chat: string, before?: string): Promise<BridgeHistoryPage>
  snapshot(after: number): Promise<BridgeSnapshot>
  connect(tabId: string): Promise<BridgeStatus>
  disconnect(): Promise<unknown>
  send(request: SendRequest): Promise<SendResult>
  profile(address: string): Promise<BridgeProfile>
  upload(
    input: BridgeUpload & { bytes: Uint8Array<ArrayBuffer> },
  ): Promise<BridgeAttachment>
  media(chat: string, target: MessageTarget): Promise<Uint8Array>
  voiceTicket(tabId: string): Promise<{ url: string; token: string; expiresAt: number }>
  declineCall(id: string): Promise<unknown>
  watch?(tabId: string): Promise<unknown>
  unwatch?(tabId: string): Promise<unknown>
}
