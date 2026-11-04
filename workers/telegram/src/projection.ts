import { FileLocation, type Message } from '@mtcute/core'
import type { BridgeMessage, MessageContent } from '@hype/messaging-bridge/types'

/** Portable media shape shared by both chat renderers. */
export function emptyContent(kind: MessageContent['kind'] = 'text'): MessageContent {
  return {
    kind,
    text: null,
    mimeType: null,
    fileName: null,
    byteLength: null,
    duration: null,
    voiceNote: false,
    viewOnce: false,
    quoted: null,
    reaction: null,
  }
}

/** Project SDK objects to plain data without exposing access hashes or file references. */
export function projectMessage(message: Message): Omit<BridgeMessage, 'sequence'> {
  const media = message.media
  const content = emptyContent()
  content.text = message.text || null
  if (media) {
    switch (media.type) {
      case 'photo':
        content.kind = 'image'
        content.mimeType = 'image/jpeg'
        break
      case 'voice':
        content.kind = 'audio'
        content.voiceNote = true
        break
      case 'audio':
        content.kind = 'audio'
        break
      case 'video':
        content.kind = 'video'
        content.animated = media.isAnimation
        break
      case 'sticker':
        content.kind = 'sticker'
        break
      case 'document':
        content.kind = 'document'
        break
      default:
        content.kind = 'unsupported'
    }
    if (media instanceof FileLocation) content.byteLength = media.fileSize ?? null
    if ('mimeType' in media && typeof media.mimeType === 'string')
      content.mimeType = media.mimeType
    if ('fileName' in media && typeof media.fileName === 'string')
      content.fileName = media.fileName
    if ('duration' in media && typeof media.duration === 'number')
      content.duration = media.duration
    if ('ttlSeconds' in media && media.ttlSeconds) content.viewOnce = true
  }
  const reply = message.replyToMessage
  if (reply?.id)
    content.quoted = {
      id: String(reply.id),
      sender: reply.sender && 'id' in reply.sender ? String(reply.sender.id) : '',
      text: reply.quoteText || null,
      kind: 'text',
      ...(reply.chat ? { chat: String(reply.chat.id) } : {}),
      ...(reply.sender && 'displayName' in reply.sender
        ? { senderName: reply.sender.displayName }
        : {}),
      ...(reply.quoteText ? { offset: reply.quoteOffset ?? 0 } : {}),
    }
  return {
    id: String(message.id),
    chat: String(message.chat.id),
    sender: String(message.sender.id),
    senderName: message.sender.displayName,
    timestamp: message.date.getTime(),
    editedAt: message.editDate?.getTime() ?? 0,
    fromMe: message.isOutgoing,
    text: content.text,
    content,
    reactions:
      message.reactions?.reactions.flatMap(item =>
        typeof item.emoji === 'string'
          ? [{ emoji: item.emoji, count: item.count }]
          : [],
      ) ?? [],
  }
}
