/** @param {string} prefixOrUid Prefix or identifier. @param {string} [uid] Identifier with a custom prefix. @returns {string} Namespaced identifier. */
export function createId(prefixOrUid, uid) {
  if (uid === undefined) return `bits-${prefixOrUid}`
  return `bits-${prefixOrUid}-${uid}`
}
