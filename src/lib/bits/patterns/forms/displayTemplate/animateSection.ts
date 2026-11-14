/** Smooth changes in an editor section's natural height.
 * @param node Wrapper with one naturally sized child.
 * @returns Observer and animation cleanup.
 * @remarks Honors reduced motion and restores intrinsic sizing after each change.
 */
export function animateSection(node: HTMLElement): { destroy: () => void } {
  const child = node.firstElementChild
  if (!child || typeof ResizeObserver === 'undefined') return { destroy() {} }
  let height = child.getBoundingClientRect().height
  let animation: Animation | undefined
  const observer = new ResizeObserver(() => {
    const next = child.getBoundingClientRect().height
    if (next === height) return
    const previous = node.getBoundingClientRect().height
    animation?.cancel()
    height = next
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !node.animate) return
    animation = node.animate(
      [
        { height: `${previous}px`, overflow: 'clip' },
        { height: `${next}px`, overflow: 'clip' },
      ],
      {
        duration: 220,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    )
  })
  observer.observe(child)
  return {
    destroy() {
      observer.disconnect()
      animation?.cancel()
    },
  }
}
