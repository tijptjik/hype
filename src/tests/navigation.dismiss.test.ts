import { dismissActiveFeatureNavigation } from '$lib/navigation'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('dismissActiveFeatureNavigation', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('closes the card first when an active feature card is open', () => {
    const closeCard = vi.fn()
    const resetActiveFeature = vi.fn()
    const resetToSearch = vi.fn()

    const didDismiss = dismissActiveFeatureNavigation({
      hasActiveFeature: true,
      isCardOpen: true,
      closeCard,
      resetActiveFeature,
      resetToSearch,
    })

    expect(didDismiss).toBe(true)
    expect(closeCard).toHaveBeenCalledOnce()
    expect(resetActiveFeature).not.toHaveBeenCalled()
    expect(resetToSearch).not.toHaveBeenCalled()
  })

  it('holds the intentional-close guard until after the next paint when clearing feature navigation', () => {
    const closeCard = vi.fn()
    const resetActiveFeature = vi.fn()
    const resetToSearch = vi.fn()
    const setIntentionallyClosing = vi.fn()

    vi.useFakeTimers()
    vi.stubGlobal('window', {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        setTimeout(() => callback(0), 16)
        return 1
      },
    })

    const didDismiss = dismissActiveFeatureNavigation({
      hasActiveFeature: true,
      isCardOpen: false,
      closeCard,
      resetActiveFeature,
      resetToSearch,
      setIntentionallyClosing,
    })

    expect(didDismiss).toBe(true)
    expect(resetActiveFeature).toHaveBeenCalledOnce()
    expect(resetToSearch).toHaveBeenCalledOnce()
    expect(setIntentionallyClosing).toHaveBeenNthCalledWith(1, true)

    vi.advanceTimersByTime(16)
    expect(setIntentionallyClosing).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(16)
    expect(setIntentionallyClosing).toHaveBeenNthCalledWith(2, false)
  })
})
