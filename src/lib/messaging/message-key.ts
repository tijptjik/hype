/** Stable media identity survives receipts, edits and replay sequence changes.
 * @param message Provider-owned message identity.
 * @returns Collision-safe account-local cache key.
 */
export function messageMediaKey(message: {
  chat: string
  sender: string
  id: string
}): string {
  return JSON.stringify([message.chat, message.sender, message.id])
}

/** Distinguish replaced media from receipt-only changes under the same native identity.
 * @param message Current provider projection.
 * @returns A revision that changes on edits or attachment metadata changes.
 */
export function messageMediaRevision(message: import('./types').BridgeMessage): string {
  return JSON.stringify([
    message.editedAt ?? 0,
    message.content?.kind,
    message.content?.mimeType,
    message.content?.byteLength,
    message.content?.fileName,
  ])
}
