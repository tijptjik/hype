/**
 * Executes bounded mutation chunks while the captured operation owner remains valid.
 * @param chunks Captured batches of input identities.
 * @param applyChunk Dispatches a chunk and returns its per-row outcomes.
 * @param publish Publishes outcomes to the job and any still-active originating view.
 * @param isCurrent Checks the captured account lifetime for background jobs.
 * @returns All outcomes, or null when superseded. Current failures propagate.
 * @remarks Already-dispatched server mutations cannot be cancelled by this guard.
 */
export async function runBulkCommands<Input, Output>(
  chunks: Input[][],
  applyChunk: (chunk: Input[]) => Promise<Output[]>,
  publish: (results: Output[]) => void,
  isCurrent: () => boolean,
): Promise<Output[] | null> {
  const results: Output[] = []
  for (const chunk of chunks) {
    if (!isCurrent()) return null
    let next: Output[]
    try {
      next = await applyChunk(chunk)
    } catch (error) {
      if (!isCurrent()) return null
      throw error
    }
    if (!isCurrent()) return null
    publish(next)
    results.push(...next)
  }
  return isCurrent() ? results : null
}
