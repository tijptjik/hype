export type ActiveFeatureDismissOptions = {
  hasActiveFeature: boolean
  isCardOpen: boolean
  closeCard: () => void
  resetActiveFeature: () => void
  resetToSearch: () => void
  setIntentionallyClosing?: (value: boolean) => void
}

/**
 * Releases the intentional-close guard after navigation and route effects have had a chance
 * to settle, preventing feature pages from immediately restoring omnibar navigation mode.
 *
 * @param setIntentionallyClosing Optional state setter for the dismiss guard.
 * @returns Nothing.
 */
function releaseIntentionalCloseGuard(
  setIntentionallyClosing?: (value: boolean) => void,
): void {
  if (!setIntentionallyClosing) {
    return
  }

  // Keep the guard active through the next paint so feature-route rehydration effects do not
  // observe the stale `[id]` route during an in-flight transition back to `/`.
  if (
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function'
  ) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setIntentionallyClosing(false)
      })
    })
    return
  }

  setTimeout(() => {
    setIntentionallyClosing(false)
  }, 32)
}

/**
 * Dismisses active-feature navigation using the same two-step behavior as the omnibar close control.
 *
 * @param options Current active-feature and card state plus dismissal callbacks.
 * @returns `true` when dismissal was handled.
 */
export function dismissActiveFeatureNavigation(
  options: ActiveFeatureDismissOptions,
): boolean {
  if (!options.hasActiveFeature) {
    return false
  }

  if (options.isCardOpen) {
    options.closeCard()
    return true
  }

  options.setIntentionallyClosing?.(true)
  options.resetActiveFeature()
  options.resetToSearch()
  releaseIntentionalCloseGuard(options.setIntentionallyClosing)
  return true
}

export * from './app'
export * from './admin'
export * from './facets'
