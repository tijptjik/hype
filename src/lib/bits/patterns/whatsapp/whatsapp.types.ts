// TYPES
import type { TextQuote } from '#lib/messaging/types.js'
import type { WhatsAppAttachment, WhatsAppProfile, WhatsAppMessage, WhatsAppRequest, WhatsAppSend, WhatsAppStatus, WhatsAppCalls } from '#lib/api/services/whatsover.types.js'

export interface Conversation {
  id: string
  name: string
  username: string | null
  photo: string | null
  preview: string
  timestamp: number
}

export interface WhatsAppMicrophoneModel {
  readonly selected: string
  readonly devices: { value: string; label: string }[]
  readonly testing: boolean
  readonly level: number
  readonly status: string
  readonly error: string
  select(id: string): void
  refresh(): Promise<void>
  test(): Promise<void>
  stop(): void
}

/** Controlled presentation contract; the page adapter owns network effects. */
export interface WhatsAppConsoleModel {
  readonly mediaPicker?: import('#lib/messaging/media-catalog.js').MediaPickerModel
  readonly catalogSends?: import('#lib/messaging/media-catalog.js').CatalogSend[]
  retryCatalogSend?(id: string): void
  readonly viewId?: string
  readonly platform?: 'whatsapp' | 'telegram'
  readonly platformLabel?: string
  readonly configurationHref?: string
  readonly microphone: WhatsAppMicrophoneModel
  readonly calls: WhatsAppCalls
  readonly videoAvailable: boolean
  readonly localVideo: MediaStream | null
  readonly remoteVideo: MediaStream | null
  readonly cameraOff: boolean
  camera(enabled: boolean): void
  readonly voiceAvailable: boolean
  readonly callBusy: boolean
  readonly ownsCall: boolean
  readonly callMuted: boolean
  readonly callError: string
  startCall(to: string, video?: boolean): Promise<void>
  answerCall(id: string): Promise<void>
  declineCall(id: string): Promise<void>
  muteCall(muted: boolean): void
  endCall(): void
  readonly profiles: Record<string, WhatsAppProfile>
  displayName(jid: string, fallback?: string | null): string
  canonicalChat(jid: string): string
  readonly status: WhatsAppStatus
  readonly messages: WhatsAppMessage[]
  readonly outbox: WhatsAppSend[]
  readonly sendPreviews?: Record<string, WhatsAppMessage>
  readonly sendErrors?: Record<string, string>
  readonly conversations: Conversation[]
  readonly conversationDiscoveryAvailable?: boolean
  readonly conversationsLoading?: boolean
  readonly conversationsComplete?: boolean
  readonly conversationsError?: string
  loadConversations?(): Promise<void>
  readonly historyAvailable?: boolean
  readonly historyLoading?: boolean
  readonly historyComplete?: boolean
  readonly historyError?: string
  loadOlder?(): Promise<void>
  readonly selectedChat: string
  readonly busy: boolean
  readonly error: string
  readonly requestId: string | null
  readonly pendingRequest?: WhatsAppRequest | null
  readonly attempt: WhatsAppSend | null
  readonly attachments?: (WhatsAppAttachment & {name:string})[]
  uploadFiles?(files: File[]): Promise<void>
  removeQueuedAttachment?(id:string): void
  canOpenQuote?(message: WhatsAppMessage): boolean
  quoteOriginal?(message: WhatsAppMessage): WhatsAppMessage | null
  loadQuotePreview?(message: WhatsAppMessage): Promise<WhatsAppMessage | null>
  resolveQuote?(message: WhatsAppMessage): Promise<WhatsAppMessage | null>
  searchMessages?(query:string):Promise<WhatsAppMessage[]>
  markRead?(): Promise<void>
  deleteMessage?(message:WhatsAppMessage): Promise<void>
  downloadForward?(message:WhatsAppMessage): Promise<File | null>
  readonly attachment: (WhatsAppAttachment & { name: string }) | null
  readonly recording: boolean
  readonly recordingSeconds: number
  readonly mediaUrls: Record<string, string>
  readonly mediaErrors: Record<string, string>
  upload(file: File, sticker?: boolean): Promise<void>
  removeAttachment(): void
  record(): Promise<void>
  stopRecording(discard?: boolean): void
  loadMedia(message: WhatsAppMessage): Promise<void>
  readonly reply: WhatsAppMessage | null
  readonly replySelection?: TextQuote | null
  to: string
  text: string
  refresh(): Promise<void>
  canEdit(message: WhatsAppMessage): boolean
  edit(message: WhatsAppMessage, text: string): Promise<void>
  connection(start: boolean): Promise<void>
  send(): Promise<void>
  selectChat(chat: string): void
  newMessage(): void
  quote(message: WhatsAppMessage | null, selection?: TextQuote): void
  react(message: WhatsAppMessage, emoji: string): Promise<void>
}
