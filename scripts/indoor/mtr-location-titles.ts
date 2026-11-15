/** Qualify the English station name once, preserving all other localized names.
 * @param names Authored station names, excluding shops and physical units.
 * @returns Names with the requested short MTR designation.
 */
export function mtrLocationTitles(
  names: Record<string, string>,
): Record<string, string> {
  if (!names.en?.trim()) throw new Error('MTR station requires an English name')
  const name = names.en.trim().replace(/\s+MTR(?:\s+Station)?$/i, '')
  return { ...names, en: `${name} MTR` }
}
