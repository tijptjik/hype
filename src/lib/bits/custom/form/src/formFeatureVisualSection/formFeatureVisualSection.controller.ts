import { FirstClassResource } from '$lib/enums'
import { navigateOnAdmin } from '$lib/navigation'

/********************
 *  TABLE OF CONTENTS
 ************/
// - createFeatureVisualSectionController

type FeatureVisualSectionControllerOptions = {
  collapseScrollThreshold?: number
  reopenSettleDelayMs?: number
  reopenScrollBufferMs?: number
}

type FeatureVisualSectionControllerDeps = {
  adminCtx: Parameters<typeof navigateOnAdmin>[0]
  getActiveFacet: () => string
  getShowsVisualSection: () => boolean
  getPreviousFeatureRef: () => string | null
  getNextFeatureRef: () => string | null
  getIsVisualSectionCollapsed: () => boolean
  setIsVisualSectionCollapsed: (value: boolean) => void
  getVisualSectionReopenScrollStartAt: () => number | null
  setVisualSectionReopenScrollStartAt: (value: number | null) => void
  getVisualSectionReopenBufferTimeout: () => ReturnType<typeof setTimeout> | null
  setVisualSectionReopenBufferTimeout: (
    value: ReturnType<typeof setTimeout> | null,
  ) => void
  getVisualSectionReopenSettleTimeout: () => ReturnType<typeof setTimeout> | null
  setVisualSectionReopenSettleTimeout: (
    value: ReturnType<typeof setTimeout> | null,
  ) => void
  getIsVisualSectionReopenArmed: () => boolean
  setIsVisualSectionReopenArmed: (value: boolean) => void
  getContentsElement: () => HTMLFormElement | undefined
  setCanonicalImageMeasuredAspectRatio: (value: number | null) => void
}

/**
 * Builds the feature visual-section interaction handlers while keeping page
 * state ownership in the caller.
 *
 * @param deps Page-owned state readers/writers and navigation hooks.
 * @param options Optional timing and threshold overrides for collapse/reopen UX.
 * @returns A controller object with visual-section event handlers.
 */
export function createFeatureVisualSectionController(
  deps: FeatureVisualSectionControllerDeps,
  options: FeatureVisualSectionControllerOptions = {},
): {
  handleCanonicalImageLoad: (payload: { width: number; height: number }) => void
  clearVisualSectionReopenBuffer: () => void
  clearVisualSectionReopenSettleTimeout: () => void
  clearVisualSectionReopenState: () => void
  clearVisualSectionReopenTimeout: () => void
  armVisualSectionReopenAfterSettle: () => void
  collapseVisualSectionAndScrollToTop: () => void
  expandVisualSection: () => void
  syncVisualSectionWithScrollPosition: () => void
  syncVisualSectionWithWheelIntent: (event: WheelEvent) => void
  handleFeatureStepperNavigation: (direction: 'previous' | 'next') => void
} {
  const collapseScrollThreshold = options.collapseScrollThreshold ?? 24
  const reopenSettleDelayMs = options.reopenSettleDelayMs ?? 240
  const reopenScrollBufferMs = options.reopenScrollBufferMs ?? 100

  function getActiveSection(): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      `[data-facet-id="${deps.getActiveFacet()}"]`,
    )
  }

  function clearVisualSectionReopenBuffer(): void {
    deps.setVisualSectionReopenScrollStartAt(null)
    const timeout = deps.getVisualSectionReopenBufferTimeout()
    if (timeout === null) return
    clearTimeout(timeout)
    deps.setVisualSectionReopenBufferTimeout(null)
  }

  function clearVisualSectionReopenSettleTimeout(): void {
    const timeout = deps.getVisualSectionReopenSettleTimeout()
    if (timeout === null) return
    clearTimeout(timeout)
    deps.setVisualSectionReopenSettleTimeout(null)
  }

  function clearVisualSectionReopenState(): void {
    clearVisualSectionReopenBuffer()
    clearVisualSectionReopenSettleTimeout()
  }

  function handleCanonicalImageLoad(payload: { width: number; height: number }): void {
    if (payload.width <= 0 || payload.height <= 0) return
    deps.setCanonicalImageMeasuredAspectRatio(payload.width / payload.height)
  }

  function clearVisualSectionReopenTimeout(): void {
    clearVisualSectionReopenState()
  }

  function armVisualSectionReopenAfterSettle(): void {
    clearVisualSectionReopenState()
    deps.setIsVisualSectionReopenArmed(false)
    // Hold reopen gestures briefly after collapsing so scroll momentum does not immediately reopen.
    deps.setVisualSectionReopenSettleTimeout(
      setTimeout(() => {
        deps.setVisualSectionReopenSettleTimeout(null)
        deps.setIsVisualSectionReopenArmed(true)
      }, reopenSettleDelayMs),
    )
  }

  function collapseVisualSectionAndScrollToTop(): void {
    deps.setIsVisualSectionCollapsed(true)
    armVisualSectionReopenAfterSettle()
    const scrollTarget =
      deps.getContentsElement()?.closest('main') ??
      deps.getContentsElement() ??
      document.documentElement

    // Scroll the active editor viewport back to the top so the reopened section has room to expand.
    requestAnimationFrame(() => {
      if (
        scrollTarget instanceof HTMLElement &&
        typeof scrollTarget.scrollTo === 'function'
      ) {
        scrollTarget.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }

      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  function expandVisualSection(): void {
    deps.setIsVisualSectionCollapsed(false)
    clearVisualSectionReopenBuffer()
  }

  function syncVisualSectionWithScrollPosition(): void {
    if (!deps.getShowsVisualSection()) return

    const activeSection = getActiveSection()
    if (!activeSection) return

    if (activeSection.scrollTop > collapseScrollThreshold) {
      if (!deps.getIsVisualSectionCollapsed()) {
        deps.setIsVisualSectionCollapsed(true)
        armVisualSectionReopenAfterSettle()
      }
    }
  }

  function syncVisualSectionWithWheelIntent(event: WheelEvent): void {
    if (
      !deps.getShowsVisualSection() ||
      !deps.getIsVisualSectionCollapsed() ||
      !deps.getIsVisualSectionReopenArmed()
    ) {
      clearVisualSectionReopenBuffer()
      return
    }

    const activeSection = getActiveSection()
    if (!activeSection || activeSection.scrollTop > 0) {
      clearVisualSectionReopenBuffer()
      return
    }

    if (event.deltaY >= 0) {
      clearVisualSectionReopenBuffer()
      return
    }

    const now = performance.now()
    const startAt = deps.getVisualSectionReopenScrollStartAt()

    if (startAt === null) {
      deps.setVisualSectionReopenScrollStartAt(now)
    } else if (now - startAt >= reopenScrollBufferMs) {
      deps.setIsVisualSectionCollapsed(false)
      clearVisualSectionReopenBuffer()
      return
    }

    const timeout = deps.getVisualSectionReopenBufferTimeout()
    if (timeout !== null) {
      clearTimeout(timeout)
    }

    // Require a short sustained upward wheel gesture before reopening the collapsed section.
    deps.setVisualSectionReopenBufferTimeout(
      setTimeout(() => {
        deps.setVisualSectionReopenBufferTimeout(null)
        deps.setVisualSectionReopenScrollStartAt(null)
      }, reopenScrollBufferMs),
    )
  }

  function handleFeatureStepperNavigation(direction: 'previous' | 'next'): void {
    const targetRef =
      direction === 'previous' ? deps.getPreviousFeatureRef() : deps.getNextFeatureRef()
    if (!targetRef) return
    navigateOnAdmin(
      deps.adminCtx,
      FirstClassResource.feature,
      targetRef,
      deps.getActiveFacet() as never,
    )
  }

  return {
    handleCanonicalImageLoad,
    clearVisualSectionReopenBuffer,
    clearVisualSectionReopenSettleTimeout,
    clearVisualSectionReopenState,
    clearVisualSectionReopenTimeout,
    armVisualSectionReopenAfterSettle,
    collapseVisualSectionAndScrollToTop,
    expandVisualSection,
    syncVisualSectionWithScrollPosition,
    syncVisualSectionWithWheelIntent,
    handleFeatureStepperNavigation,
  }
}
