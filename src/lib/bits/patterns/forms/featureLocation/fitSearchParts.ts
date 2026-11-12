/** Fit an address on one line by removing its broadest parts first.
 * @param node Address component strip; children declare their omission priority.
 * @returns Observer cleanup for resized rows and asynchronously resolved locality names.
 * @remarks Keep the result identity visible using the shared scroller after other parts are gone.
 */
export function fitSearchParts(node: HTMLElement): { destroy: () => void } {
  let disposed = false
  let frame = 0
  const fitContent = (): void => {
    frame = 0
    if (disposed) return
    const availableWidth = node.clientWidth
    if (availableWidth <= 0) return
    const parts = Array.from(node.children) as HTMLElement[]
    for (const part of parts) part.style.removeProperty('display')
    const first = parts[0]
    // Measure the scroller's actual text, not its constrained flex viewport (notably in Firefox).
    const text = first?.querySelector<HTMLElement>('.bits-scrollable-text__content')
    if (first && text) {
      const icon = first.querySelector('svg')
      const iconWidth = icon?.getBoundingClientRect().width ?? 0
      const iconGap = icon ? parseFloat(getComputedStyle(first).columnGap) || 0 : 0
      first.style.width = `${text.scrollWidth + iconWidth + iconGap}px`
    }
    const gap = parseFloat(getComputedStyle(node).columnGap) || 0
    // Read every width before hiding parts so each omission does not force another layout.
    const widths = new Map(parts.map(part => [part, part.scrollWidth]))
    let width =
      parts.reduce((sum, part) => sum + (widths.get(part) ?? 0), 0) +
      Math.max(0, parts.length - 1) * gap
    // The first part identifies the result; hide broader geography before closer details.
    const removable = parts
      .slice(1)
      .sort(
        (a, b) =>
          Number(b.dataset.omissionPriority) - Number(a.dataset.omissionPriority),
      )
    for (const part of removable) {
      if (width <= availableWidth) break
      width -= (widths.get(part) ?? 0) + gap
      part.style.display = 'none'
    }
    // Only the final identity viewport may narrow; other components remain whole or hidden.
    if (first && text && width > availableWidth)
      first.style.width = `${availableWidth}px`
  }
  /** Batch content, font and size changes into one fit per frame.
   * @returns Nothing.
   */
  function schedule(): void {
    if (!disposed && !frame) frame = requestAnimationFrame(fitContent)
  }
  const resize =
    typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule)
  const mutation = new MutationObserver(schedule)
  resize?.observe(node)
  mutation.observe(node, { childList: true, subtree: true, characterData: true })
  void document.fonts?.ready.then(schedule)
  fitContent()
  return {
    destroy() {
      disposed = true
      cancelAnimationFrame(frame)
      resize?.disconnect()
      mutation.disconnect()
    },
  }
}
