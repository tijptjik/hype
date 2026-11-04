import type { TelegramClient } from '@mtcute/core/client.js'
import type { ChatPhoto } from '@mtcute/core'

/** Download the actual 160px avatar, never stretch Telegram's tiny blurred placeholder. */
export async function avatarImage(
  client: Pick<TelegramClient, 'downloadAsIterable'>,
  photo: ChatPhoto | null,
): Promise<string | null> {
  if (!photo) return null
  const parts: Uint8Array[] = []
  let length = 0
  try {
    for await (const chunk of client.downloadAsIterable(photo.small)) {
      length += chunk.byteLength
      if (length > 128 * 1024) return null
      parts.push(chunk)
    }
    if (!length) return null
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const part of parts) {
      bytes.set(part, offset)
      offset += part.length
    }
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return null
    return `data:image/jpeg;base64,${btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))}`
  } catch {
    return null
  }
}
