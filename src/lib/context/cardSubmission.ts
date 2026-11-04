interface SubmissionState {
  isSubmitting: boolean
  resetSubmissionState(): void
}

const owners = new WeakMap<SubmissionState, object>()

/**
 * Claims the shared card's busy state for one asynchronous submission.
 * @param card Card state shared by the mounted contribution actions.
 * @returns An idempotent release function that cannot clear a newer owner's state.
 * @remarks Release on settlement or unmount, even when the form scope has changed.
 */
export function beginCardSubmission(card: SubmissionState): () => void {
  const owner = {}
  owners.set(card, owner)
  card.isSubmitting = true
  return () => {
    if (owners.get(card) !== owner) return
    owners.delete(card)
    card.isSubmitting = false
    card.resetSubmissionState()
  }
}
