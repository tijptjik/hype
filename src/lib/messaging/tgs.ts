/** Decode Telegram's gzip-compressed vector animation with bounded expansion.
 * @param bytes Downloaded TGS file.
 * @returns Vector-only Lottie data suitable for the expression-free player.
 * @remarks External images, fonts and expression scripts are not part of a Telegram sticker.
 */
export async function decodeTelegramSticker(
  bytes: Uint8Array,
): Promise<Record<string, unknown>> {
  if (bytes.byteLength > 256 * 1024) throw new Error('Animated sticker is too large')
  const reader = new Blob([Uint8Array.from(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader()
  const parts: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > 2 * 1024 * 1024) throw new Error('Animated sticker is too complex')
      parts.push(part.value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  const text = await new Blob(parts.map(part => Uint8Array.from(part))).text()
  const data: unknown = JSON.parse(text)
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Invalid animated sticker')
  const animation = data as Record<string, unknown>
  if (
    !Array.isArray(animation.layers) ||
    !Number.isFinite(animation.fr) ||
    Number(animation.fr) <= 0 ||
    Number(animation.fr) > 120 ||
    !Number.isFinite(animation.w) ||
    !Number.isFinite(animation.h) ||
    Number(animation.w) > 1024 ||
    Number(animation.h) > 1024
  )
    throw new Error('Invalid animated sticker')
  // Walk the bounded JSON before the player can resolve any asset or expression.
  const pending: unknown[] = [animation]
  let count = 0
  while (pending.length) {
    if (++count > 100_000) throw new Error('Animated sticker is too complex')
    const value = pending.pop()
    if (!value || typeof value !== 'object') continue
    if (Array.isArray(value)) {
      pending.push(...value)
      continue
    }
    for (const [key, field] of Object.entries(value)) {
      if (
        key === 'fonts' ||
        key === 'chars' ||
        (key === 'x' && typeof field === 'string') ||
        (['p', 'u'].includes(key) && typeof field === 'string')
      )
        throw new Error('Unsupported sticker asset')
      if (field && typeof field === 'object') pending.push(field)
    }
  }
  return animation
}
