/** Session presentation belongs to the admin surface, never an individual Feature record. */
export class FeatureMultilingualState {
  private choice = $state<{ accountId: string; expanded: boolean } | null>(null)

  /** Read the current account's explicit choice, falling back to settings when absent.
   * @param accountId Current account identifier. @returns Explicit mode, or undefined.
   */
  get(accountId: string): boolean | undefined {
    return this.choice?.accountId === accountId ? this.choice.expanded : undefined
  }

  /** Keep a manual toggle across Feature navigation and Profile/Location facets.
   * @param accountId Current account identifier. @param expanded Requested mode.
   * @returns Nothing; no record, Organisation or Project settings are written.
   */
  set(accountId: string, expanded: boolean): void {
    this.choice = { accountId, expanded }
  }
}
