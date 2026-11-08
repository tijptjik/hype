/** Test meaningful text without treating empty rich-text markup as content.
 * @param value Stored field text. @returns Whether translation must preserve this value.
 */
export function hasMeaningfulText(value: string | null | undefined): boolean {
  return Boolean(
    value
      ?.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&(?:nbsp|#160|#x0*a0);/gi, ' ')
      .replace(/[\s\u200b-\u200d\ufeff]/g, ''),
  )
}
