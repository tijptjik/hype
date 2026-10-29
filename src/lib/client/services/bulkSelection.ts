/**
 * Collect a complete, deduplicated selection without changing the visible index.
 * @param readPage - Reads a bounded page at the supplied offset.
 * @param matches - Applies the same client-side filters as the visible index.
 * @param isCurrent - Rejects work after the scope, filters or selection mode changes.
 * @returns Matching IDs, or null when superseded. Failed pages never return partial selections.
 */
export async function collectBulkSelection<T extends { id: string }>(
  readPage: (
    offset: number,
  ) => Promise<{ data: T[]; hasMore?: boolean; nextOffset?: number | null }>,
  matches: (rows: T[]) => T[],
  isCurrent: () => boolean,
): Promise<string[] | null> {
  const ids = new Set<string>()
  let offset = 0
  while (isCurrent()) {
    const page = await readPage(offset)
    if (!isCurrent()) return null
    for (const row of matches(page.data)) ids.add(row.id)
    if (!page.hasMore) return [...ids]
    const nextOffset = page.nextOffset ?? offset + page.data.length
    if (nextOffset <= offset) throw new Error('Feature pagination did not advance')
    offset = nextOffset
  }
  return null
}
