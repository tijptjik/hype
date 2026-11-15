/** Canonicalise known MTR labels without altering captured publisher evidence.
 * @param name Publisher label. @returns Singular service name with typographic quotation marks.
 */
export function canonicalMtrServiceLabel(name: string): string {
  const value = name.trim()
  if (/^["“]iAM Smart["”] Self-Registration Kiosk$/i.test(value))
    return '“iAM Smart” Self-Registration Kiosk'
  if (/^Octopus Service Points?$/i.test(value)) return 'Octopus Service Point'
  if (/^Swire Coca[- ]Cola(?: HK)?$/i.test(value)) return 'Swire Coca-Cola'
  return value
}

type ReviewLabel = {
  businessKey: string
  name: string
  entries: number
  sourceRecordIds: string[]
  sources: { id: string; url: string }[]
}
/** Group reviewed spelling aliases while retaining every source identity for review/export.
 * @param rows Review labels. @returns One displayed row per canonical name.
 */
export function groupMtrServiceLabels<T extends ReviewLabel>(
  rows: T[],
): (T & { businessKeys: string[]; publisherNames: string[] })[] {
  const groups = new Map<
    string,
    T & { businessKeys: string[]; publisherNames: string[] }
  >()
  for (const row of rows) {
    const name = canonicalMtrServiceLabel(row.name)
    // Only explicitly reviewed aliases are grouped; unrelated tenants keep their source keys.
    const key = [
      '“iAM Smart” Self-Registration Kiosk',
      'Octopus Service Point',
      'Swire Coca-Cola',
    ].includes(name)
      ? name
      : row.businessKey
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, {
        ...row,
        name,
        businessKeys: [row.businessKey],
        publisherNames: [row.name],
        sourceRecordIds: [...row.sourceRecordIds],
        sources: [...row.sources],
      })
      continue
    }
    existing.businessKeys.push(row.businessKey)
    existing.publisherNames.push(row.name)
    existing.entries += row.entries
    existing.sourceRecordIds = [
      ...new Set([...existing.sourceRecordIds, ...row.sourceRecordIds]),
    ]
    existing.sources = [
      ...new Map(
        [...existing.sources, ...row.sources].map(source => [source.id, source]),
      ).values(),
    ]
  }
  return [...groups.values()]
}
