/** Fold feature search text identically to SQLite and the persisted FTS grams.
 * @param value Literal text or query fragment.
 * @returns ASCII-case-folded text, preserving CJK, accents and punctuation.
 * @remarks SQLite lower() is ASCII-only; local previews must not promise Unicode
 * case-insensitive matches that the authoritative query cannot return.
 */
export function foldFeatureSearchText(value: string): string {
  return value.replace(/[A-Z]/g, character => character.toLowerCase())
}
