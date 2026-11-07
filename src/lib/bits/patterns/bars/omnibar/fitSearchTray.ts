// LAYOUT
import {
  allocateSearchRows,
  getSearchTrayHeight,
  OMNIBAR_SEARCH_POLICY,
} from './searchBudget'
// TYPES
import type { OmnibarSearchProps } from './omnibar.types'

type FitSearchTrayOptions = Pick<
  OmnibarSearchProps,
  'viewport' | 'expanded' | 'sections'
>

/**
 * Fits the preview using actual row/header/footer heights, including wrapped labels.
 * @param node Search tray whose descendants expose measurement attributes.
 * @param initial Current visual viewport and result policy supplied by the adapter.
 * @returns Svelte action lifecycle; all observers and pending frames are released.
 * @remarks The action owns only display/max-height styles, never selection or domain state.
 */
export function fitSearchTray(
  node: HTMLElement,
  initial: FitSearchTrayOptions,
): {
  update: (next: FitSearchTrayOptions) => void
  destroy: () => void
} {
  let options = initial
  let frame = 0
  let disposed = false
  let lastWidth = -1
  let lastFooterHeight = -1
  const footer = node.querySelector<HTMLElement>('[data-omni-footer]')!
  const scroller = node.querySelector<HTMLElement>('[data-omni-scroll]')!

  /**
   * Re-measures candidates before hiding overflow, so widening or closing the keyboard restores rows.
   * @returns Nothing; only the action-owned layout styles change.
   */
  function fit(): void {
    frame = 0
    // Measure in allocation priority even though the DOM follows visual reading order.
    const sections = OMNIBAR_SEARCH_POLICY.flatMap(({ type }) => [
      ...node.querySelectorAll<HTMLElement>(`[data-omni-section="${type}"]`),
    ])
    const rows = sections.map(section => [
      ...section.querySelectorAll<HTMLElement>('[data-omni-entry]'),
    ])
    for (const [index, section] of sections.entries()) {
      section.style.removeProperty('display')
      for (const row of rows[index]) row.style.removeProperty('display')
    }
    if (!options.viewport) return
    const { height, offsetTop } = options.viewport
    const trayHeight = getSearchTrayHeight(
      height,
      offsetTop + height - node.getBoundingClientRect().top - 16,
    )
    node.style.maxHeight = `${trayHeight}px`
    const borderHeight = node.offsetHeight - node.clientHeight
    const budget = Math.max(
      0,
      trayHeight - footer.getBoundingClientRect().height - borderHeight,
    )
    scroller.style.maxHeight = `${budget}px`
    if (options.expanded) return

    // Charge complete section chrome and row heights before deciding which lower priorities fit.
    const counts = allocateSearchRows(
      sections.map((section, index) => {
        const heights = rows[index].map(row => row.getBoundingClientRect().height)
        return {
          chrome:
            section.getBoundingClientRect().height -
            heights.reduce((sum, value) => sum + value, 0),
          rows: heights,
        }
      }),
      budget,
    )
    for (const [index, section] of sections.entries()) {
      if (!counts[index]) section.style.display = 'none'
      for (const [rowIndex, row] of rows[index].entries()) {
        if (rowIndex >= counts[index]) row.style.display = 'none'
      }
    }
    // A resize must not leave keyboard focus in a result that is no longer visible.
    const focused = document.activeElement
    if (
      focused instanceof HTMLElement &&
      node.contains(focused) &&
      !focused.getClientRects().length
    ) {
      node.parentElement?.parentElement
        ?.querySelector<HTMLInputElement>('#omni-search-bar')
        ?.focus()
    }
  }

  /**
   * Coalesces prop, width and font changes into one layout pass before paint.
   * @returns Nothing; a pending frame is reused when possible.
   */
  function schedule(): void {
    if (!disposed && !frame) frame = requestAnimationFrame(fit)
  }
  const observer = new ResizeObserver(() => {
    const width = node.getBoundingClientRect().width
    const footerHeight = footer.getBoundingClientRect().height
    if (width !== lastWidth || footerHeight !== lastFooterHeight) {
      lastWidth = width
      lastFooterHeight = footerHeight
      schedule()
    }
  })
  observer.observe(node)
  observer.observe(footer)
  void document.fonts?.ready.then(schedule)
  schedule()
  return {
    update(next) {
      options = next
      schedule()
    },
    destroy() {
      disposed = true
      observer.disconnect()
      cancelAnimationFrame(frame)
    },
  }
}
