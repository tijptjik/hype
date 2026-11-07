/**
 * Creates a trailing debounce that also runs during uninterrupted input.
 * @param delay Quiet period before invoking the latest callback, in milliseconds.
 * @param maxWait Maximum time a burst of input can postpone an invocation.
 * @returns Scheduling and cancellation functions; cancellation also resets the burst.
 */
export function createBoundedDebounce(
  delay = 150,
  maxWait = 500,
): {
  schedule: (callback: () => void) => void
  cancel: () => void
} {
  let timer: ReturnType<typeof setTimeout> | undefined
  let started: number | undefined
  return {
    schedule(callback) {
      clearTimeout(timer)
      started ??= Date.now()
      timer = setTimeout(
        () => {
          timer = undefined
          started = undefined
          callback()
        },
        Math.min(delay, Math.max(0, maxWait - (Date.now() - started))),
      )
    },
    cancel() {
      clearTimeout(timer)
      timer = undefined
      started = undefined
    },
  }
}
