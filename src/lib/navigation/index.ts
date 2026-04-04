export type ActiveFeatureDismissOptions = {
  hasActiveFeature: boolean
  isCardOpen: boolean
  closeCard: () => void
  resetActiveFeature: () => void
  resetToSearch: () => void
  setIntentionallyClosing?: (value: boolean) => void
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
  // Hold the dismiss guard through the synchronous reset, then release it.
  setTimeout(() => {
    options.setIntentionallyClosing?.(false)
  }, 0)
  return true
}

export * from './app'
export * from './admin'
export * from './facets'
