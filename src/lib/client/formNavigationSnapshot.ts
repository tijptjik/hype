/** A history checkpoint, valid only within this browser runtime and form revision. */
export interface FormNavigationSnapshot<T> {
  scope: string
  revision: string
  value: T
}

// Keep only revision tokens here; SvelteKit owns the per-history-entry form payloads.
const revisions = new Map<string, string>()

/** Capture an independent payload for an account/resource scope.
 * @param scope Account and resource identity. @param value Serializable draft state.
 * @returns A checkpoint that cannot be mutated by subsequent form edits.
 */
export function captureFormNavigationSnapshot<T>(
  scope: string,
  value: T,
): FormNavigationSnapshot<T> {
  const revision = revisions.get(scope) ?? crypto.randomUUID()
  revisions.set(scope, revision)
  return { scope, revision, value: structuredClone(value) }
}

/** Check that a checkpoint still belongs to this form and has not been saved/discarded.
 * @param scope Current account and resource identity. @param saved History checkpoint.
 * @returns Whether restoration is allowed in this runtime.
 */
export function isCurrentFormNavigationSnapshot<T>(
  scope: string,
  saved: FormNavigationSnapshot<T>,
): boolean {
  return saved.scope === scope && revisions.get(scope) === saved.revision
}

/** Invalidate all older history entries after a successful save or explicit reset.
 * @param scope Account and resource identity.
 * @returns Nothing; other forms remain restorable.
 */
export function invalidateFormNavigationSnapshots(scope: string): void {
  revisions.delete(scope)
}
