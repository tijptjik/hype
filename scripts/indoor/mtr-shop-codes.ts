/** Normalize publisher spacing and equivalent separators without splitting physical units.
 * @param value Publisher shop reference. @returns Comparable complete shop code.
 * @remarks Ranges remain ranges; a combined shop never silently becomes one of its units.
 */
export function mtrShopCode(value: string): string {
  return value
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, '')
    .replace(/AND/g, '&')
}

/** Compare equivalent complete numeric code groups without splitting their source polygons.
 * @param value Publisher shop reference.
 * @returns Canonical group key, or the unchanged normalized reference for unsupported ranges.
 * @remarks Only bounded numeric ranges expand; lettered units and incomplete groups are never inferred.
 */
export function mtrShopUnitKey(value: string): string {
  const normalized = mtrShopCode(value)
  const match = /^([A-Z]{3})(\d+[A-Z]?(?:[-&,/]\d+[A-Z]?)*)$/.exec(normalized)
  if (!match) return normalized
  const units = new Set<string>()
  for (const part of match[2].split(/[&,/]/)) {
    if (!part.includes('-')) {
      units.add(match[1] + part)
      continue
    }
    const range = /^(\d+)-(\d+)$/.exec(part)
    if (
      !range ||
      Number(range[2]) <= Number(range[1]) ||
      Number(range[2]) - Number(range[1]) > 30
    )
      return normalized
    for (let n = Number(range[1]); n <= Number(range[2]); n++) units.add(match[1] + n)
  }
  return [...units].sort().join('|')
}
