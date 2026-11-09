/** Fit an address on one line by removing its broadest parts first.
 * @param node Address component strip; children declare their omission priority.
 * @returns Observer cleanup for resized rows and asynchronously resolved locality names.
 * @remarks Keep the result identity visible using the shared scroller after other parts are gone.
 */
export function fitSearchParts(node: HTMLElement): { destroy: () => void } {
  let disposed = false
  const fitContent = (): void => {
    if (disposed || node.clientWidth <= 0) return
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
    let width =
      parts.reduce((sum, part) => sum + part.scrollWidth, 0) +
      Math.max(0, parts.length - 1) * gap
    // The first part identifies the result; hide broader geography before closer details.
    const removable = parts
      .slice(1)
      .sort(
        (a, b) =>
          Number(b.dataset.omissionPriority) - Number(a.dataset.omissionPriority),
      )
    for (const part of removable) {
      if (width <= node.clientWidth) break
      width -= part.scrollWidth + gap
      part.style.display = 'none'
    }
    // Only the final identity viewport may narrow; other components remain whole or hidden.
    if (first && text && width > node.clientWidth)
      first.style.width = `${node.clientWidth}px`
  }
  const resize =
    typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(fitContent)
  const mutation = new MutationObserver(fitContent)
  resize?.observe(node)
  mutation.observe(node, { childList: true, subtree: true, characterData: true })
  void document.fonts?.ready.then(fitContent)
  fitContent()
  return {
    destroy() {
      disposed = true
      resize?.disconnect()
      mutation.disconnect()
    },
  }
}
