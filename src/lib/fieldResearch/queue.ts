/** Run an arbitrarily long queue with bounded in-flight work.
 * @param items Pending queue items. @param worker One item operation.
 * @param concurrency Maximum simultaneous normalizations/uploads.
 * @returns Once every item has been attempted; callers retain failures for explicit retry.
 */
export async function runResearchQueue<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
  concurrency = 2,
): Promise<void> {
  let cursor = 0
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      async () => {
        while (cursor < items.length) {
          const item = items[cursor++]
          await worker(item)
        }
      },
    ),
  )
}
