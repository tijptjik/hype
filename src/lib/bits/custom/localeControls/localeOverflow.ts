/** Shade only edges that have more languages outside the visible strip.
 * @param node Native horizontal scrolling viewport.
 * @param enabled Whether this toolbar uses a horizontal strip.
 * @returns Cleanup for scroll, size and content listeners.
 */
export function localeOverflow(
  node: HTMLElement,
  enabled: boolean,
): { destroy(): void } {
  if (!enabled) return { destroy() {} }
  /** Update the edge fades after scrolling, resizing or reordering chips. */
  function update(): void {
    const left = node.scrollLeft > 1 ? 'transparent' : 'black'
    const right =
      node.scrollLeft + node.clientWidth < node.scrollWidth - 1
        ? 'transparent'
        : 'black'
    node.style.maskImage = `linear-gradient(to right, ${left}, black 16px, black calc(100% - 16px), ${right})`
  }
  /** Keep a focused language clear of the shaded edges.
   * @param event Focus entering a language or Add control.
   * @returns Nothing; scrolls only this strip when the control is clipped.
   */
  function revealFocus(event: FocusEvent): void {
    if (!(event.target instanceof HTMLElement)) return
    const viewport = node.getBoundingClientRect()
    const target = event.target.getBoundingClientRect()
    if (target.left < viewport.left + 16)
      node.scrollLeft -= viewport.left + 16 - target.left
    else if (target.right > viewport.right - 16)
      node.scrollLeft += target.right - viewport.right + 16
  }
  /** Route mouse and trackpad wheels to the strip, including at either end.
   * @param event Wheel movement over the language controls.
   * @returns Nothing; preserves browser zoom and page scrolling when nothing overflows.
   */
  function wheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey || node.scrollWidth <= node.clientWidth + 1)
      return
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (!delta) return
    const unit =
      event.deltaMode === 1
        ? Number.parseFloat(getComputedStyle(node).lineHeight) || 16
        : event.deltaMode === 2
          ? node.clientWidth
          : 1
    event.preventDefault()
    event.stopPropagation()
    node.scrollLeft += delta * unit
  }
  node.addEventListener('wheel', wheel, { passive: false })
  node.addEventListener('focusin', revealFocus)
  const resize = new ResizeObserver(update)
  resize.observe(node)
  if (node.firstElementChild) resize.observe(node.firstElementChild)
  const content = new MutationObserver(update)
  content.observe(node, { subtree: true, childList: true })
  node.addEventListener('scroll', update, { passive: true })
  update()
  return {
    destroy() {
      resize.disconnect()
      content.disconnect()
      node.removeEventListener('scroll', update)
      node.removeEventListener('focusin', revealFocus)
      node.removeEventListener('wheel', wheel)
    },
  }
}
