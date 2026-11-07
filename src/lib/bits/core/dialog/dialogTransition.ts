// SVELTE
import { tick } from 'svelte'

export const REVIEW_DIALOG_TRANSITION = 'feature-review-dialog'

/** Morph the current review surface into its next size or originating button.
 * @param update State change captured by the browser.
 * @returns Completion after the snapshot animation, or an immediate reduced-motion update.
 * @remarks Superseded animations still commit their state update.
 */
export async function transitionReviewDialog(
  update: () => void | Promise<void>,
): Promise<void> {
  const commit = async (): Promise<void> => {
    await update()
    await tick()
  }
  if (
    typeof document === 'undefined' ||
    !document.startViewTransition ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    await commit()
    return
  }
  const transition = document.startViewTransition(commit)
  // A newer transition can skip the ready snapshot while still committing its update.
  void transition.ready.catch(() => {})
  try {
    await transition.finished
  } catch {
    // A skipped snapshot does not undo the requested dialog state.
  }
}
