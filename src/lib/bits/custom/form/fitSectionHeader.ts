/** Fit controls in priority order using the actual translated content width.
 * @param node Header boundary within the owning panel.
 * @returns Observer cleanup when the section unmounts.
 * @remarks Only language chips scroll after labels, description and title yield.
 */
export function fitSectionHeader(node: HTMLElement): { destroy(): void } {
  let frame = 0
  let disposed = false
  const header = node.querySelector('header')!
  /** Measure visible children, including content clipped by the heading wrapper. */
  function fits(): boolean {
    const edge = header.getBoundingClientRect().right
    return (
      [...header.children].every(
        child => child.getBoundingClientRect().right <= edge + 1,
      ) && header.scrollWidth <= header.clientWidth + 1
    )
  }
  /** Restart with full labels so widening restores content in reverse order. */
  function fit(): void {
    frame = 0
    for (let stage = 0; stage <= 4; stage++) {
      node.dataset.fit = String(stage)
      if (stage === 2) {
        // Measure without the description so short titles reserve only their own width.
        const title = header.querySelector<HTMLElement>('[data-header-title-text]')
        const left = header.querySelector<HTMLElement>(
          '.bits-form__section-header-left',
        )
        if (title && left) {
          const naturalWidth = title.getBoundingClientRect().width
          const rootFontSize = Number.parseFloat(
            getComputedStyle(document.documentElement).fontSize,
          )
          const minimumTitleWidth = Math.min(naturalWidth, 10 * rootFontSize)
          const controlsWidth = left.getBoundingClientRect().width - naturalWidth
          node.style.setProperty(
            '--section-header-min-width',
            `${controlsWidth + minimumTitleWidth}px`,
          )
          node.style.setProperty(
            '--section-header-title-min-width',
            `${minimumTitleWidth}px`,
          )
        }
      }
      if (fits()) break
    }
  }
  /** Coalesce content and panel changes into one layout measurement. */
  function schedule(): void {
    if (!disposed && !frame) frame = requestAnimationFrame(fit)
  }
  const resize = new ResizeObserver(schedule)
  resize.observe(node)
  const content = new MutationObserver(schedule)
  content.observe(header, { childList: true, subtree: true, characterData: true })
  void document.fonts.ready.then(schedule)
  schedule()
  return {
    destroy() {
      disposed = true
      cancelAnimationFrame(frame)
      resize.disconnect()
      content.disconnect()
    },
  }
}
