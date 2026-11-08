/** Private bridge contract. Session secrets and platform access hashes never cross it. */
export type MessagingPlatform = 'whatsapp' | 'telegram'
export interface MessageTarget {
  id: string
  sender: string
}
/** A native excerpt; offset uses UTF-16 code units in the original message. */
export interface TextQuote {
  text: string
  offset: number
}
export interface ReplyTarget extends MessageTarget {
  quote?: TextQuote
}
export interface MessageContent {
  kind:
    | 'text'
    | 'image'
    | 'video'
    | 'audio'
    | 'sticker'
    | 'document'
    | 'reaction'
    | 'protocol'
    | 'unsupported'
  animated?: boolean
  text: string | null
  mimeType: string | null
  fileName: string | null
  byteLength: number | null
  duration: number | null
  voiceNote: boolean
  viewOnce: boolean
  quoted: {
    id: string
    sender: string
    text: string | null
    kind: string
    chat?: string
    senderName?: string
    offset?: number
  } | null
  reaction: {
    targetId: string
    targetSender: string | null
    targetFromMe: boolean
    emoji: string
  } | null
}
export interface BridgeMessage {
  sequence: number
  chat: string
  sender: string
  id: string
  timestamp: number
  editedAt?: number
  delivery?: 'sent' | 'delivered' | 'read'
  readByMe?: boolean
  fromMe: boolean
  text: string | null
  senderName?: string | null
  content?: MessageContent
  deleted?: boolean
  reactions?: { emoji: string; count: number }[]
}
export interface SendRequest {
  requestId: string
  to: string
  text: string
  editTo?: MessageTarget
  replyTo?: ReplyTarget
  reaction?: string
  attachmentId?: string
}
export interface SendResult {
  request: SendRequest
  messageId: string
  state: 'pending' | 'submitted' | 'uncertain'
}
export interface BridgeProfile {
  jid: string
  name: string | null
  username: string | null
  phone: string | null
  aliases: string[]
  photo: string | null
}
export interface BridgeStatus {
  connected: boolean
  loggedOut: boolean
  qr: string | null
  qrExpiresAt: number | null
  lastEvent?: string | null
  authState?: 'disconnected' | 'qr' | 'code' | 'password' | 'ready'
  identity?: {
    id: string
    name: string
    username: string | null
    phone: string | null
  } | null
}
export interface BridgeUpload {
  kind: 'image' | 'audio' | 'sticker' | 'video' | 'document'
  mimeType: string
  duration?: number
  fileName?: string
}
export interface BridgeAttachment {
  id: string
  content: MessageContent
}
export interface BridgeCalls {
  videoSupported?: boolean
  incoming: {
    id: string
    peer: string
    name: string | null
    receivedAt: number
    video?: boolean
  }[]
  current: {
    requestId: string
    id: string | null
    peer: string
    phase: 'connecting' | 'ringing' | 'active' | 'ending' | 'ended'
    muted: boolean
    video?: boolean
    startedAt: number
    connectedAt: number | null
    error: string | null
  } | null
}
export interface BridgeSnapshot {
  conversations?: BridgeConversationState[]
  status: BridgeStatus
  messages: BridgeMessage[]
  outbox: SendResult[]
  calls?: BridgeCalls
  voiceAvailable?: boolean
}
export interface BridgeConversationState {
  sequence: number
  chat: string
  isArchived: boolean
}
/** History pagination is independent of the incremental inbox replay cursor. */
export interface BridgeHistoryPage {
  messages: BridgeMessage[]
  nextBefore: string | null
}
/** Public pagination fields contain peer IDs, never Telegram access hashes. */
export interface BridgeDialogCursor {
  peer: string
  id: number
  date: number
}
export interface BridgeDialogPage {
  messages: BridgeMessage[]
  next: BridgeDialogCursor | null
}
export type LoginInput =
  | { kind: 'qr' }
  | { kind: 'phone'; phone: string }
  | { kind: 'code'; code: string }
  | { kind: 'password'; password: string }
