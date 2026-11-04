/** Private Worker RPC contract. WhatsApp credentials never cross this interface. */
export interface WhatsAppStatus {
  connected: boolean
  loggedOut: boolean
  qr: string | null
  qrExpiresAt: number | null
  lastEvent?: string | null
  identity?: {
    id: string
    name: string
    username: string | null
    phone: string | null
  } | null
}

export interface WhatsAppRequest {
  requestId: string
  to: string
  text: string
  editTo?: WhatsAppTarget
  replyTo?: WhatsAppTarget & { quote?: { text: string; offset: number } }
  reaction?: string
  attachmentId?: string
}

export interface WhatsAppTarget {
  id: string
  sender: string
}
export interface WhatsAppContent {
  animated?: boolean
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

export interface WhatsAppSend {
  createdAt?: number
  request: WhatsAppRequest
  messageId: string
  state: 'pending' | 'submitted' | 'uncertain'
}

export interface WhatsAppMessage {
  readByMe?: boolean
  delivery?: 'sent' | 'delivered' | 'read'
  editedAt?: number
  deleted?: boolean
  reactions?: { emoji: string; count: number }[]
  sequence: number
  chat: string
  sender: string
  id: string
  timestamp: number
  fromMe: boolean
  text: string | null
  // Optional while an older private bridge deployment is being upgraded.
  senderName?: string | null
  content?: WhatsAppContent
}

export interface WhatsAppUpload {
  animated?: boolean
  kind: 'image' | 'audio' | 'sticker' | 'video' | 'document'
  mimeType: string
  duration?: number
  fileName?: string
}
export interface WhatsAppAttachment {
  id: string
  content: WhatsAppContent
}

export interface WhatsAppProfile {
  jid: string
  name: string | null
  username: string | null
  phone: string | null
  aliases: string[]
  photo: string | null
}

export interface WhatsAppCall {
  requestId: string
  id: string | null
  peer: string
  phase: 'connecting' | 'ringing' | 'active' | 'ending' | 'ended'
  muted: boolean
  video?: boolean
  startedAt: number
  connectedAt: number | null
  error: string | null
}

export interface WhatsAppCalls {
  videoSupported?: boolean
  incoming: {
    id: string
    peer: string
    name: string | null
    receivedAt: number
    video?: boolean
  }[]
  current: WhatsAppCall | null
}

export interface WhatsAppVoiceTicket {
  url: string
  token: string
  expiresAt: number
}

export interface WhatsoverBinding {
  messageAction(
    account: string,
    chat: string,
    target: WhatsAppTarget,
    action: 'read' | 'delete',
    requestId: string,
  ): Promise<void>
  watch(account: string, viewer: string, stage?: string): Promise<WhatsAppStatus>
  unwatch(account: string, viewer: string): Promise<void>
  snapshot(
    account: string,
    after: number,
    archiveAfter?: number,
  ): Promise<WhatsAppSnapshot>
  archive(
    account: string,
    chat: string,
    archived: boolean,
  ): Promise<import('#lib/messaging/types.js').BridgeConversationState>
  callSnapshot(account: string): Promise<WhatsAppCalls>
  voiceTicket(
    account: string,
    origin: string,
  ): Promise<{ account: string; token: string; expiresAt: number }>
  rejectCall(account: string, id: string): Promise<void>
  lookupPhone(
    account: string,
    phone: string,
  ): Promise<import('#lib/messaging/types.js').PhoneLookup>
  profile(account: string, jid: string): Promise<WhatsAppProfile>
  upload(
    account: string,
    input: WhatsAppUpload,
    bytes: ArrayBuffer,
  ): Promise<WhatsAppAttachment>
  media(account: string, chat: string, target: WhatsAppTarget): Promise<ArrayBuffer>
  start(account: string, stage?: string): Promise<WhatsAppStatus>
  stop(account: string): Promise<void>
  status(account: string): Promise<WhatsAppStatus>
  send(account: string, request: WhatsAppRequest): Promise<WhatsAppSend>
  inbox(account: string, after: number, limit: number): Promise<WhatsAppMessage[]>
  outbox(account: string, limit: number): Promise<WhatsAppSend[]>
  result(account: string, requestId: string): Promise<WhatsAppSend | null>
}

export interface WhatsAppSnapshot {
  calls?: WhatsAppCalls
  voiceAvailable?: boolean
  status: WhatsAppStatus
  messages: WhatsAppMessage[]
  outbox: WhatsAppSend[]
}
