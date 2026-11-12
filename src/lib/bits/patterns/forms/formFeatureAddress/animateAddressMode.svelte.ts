// SVELTE
import { tick } from 'svelte'

/** Move retained address panels together when the editor changes mode.
 * @param grid Reactive accessor for the address grid containing retained panels.
 * @param editing Reactive accessor for the current editing mode.
 * @returns Cleanup for pending frames and owned animations.
 * @remarks Translate panels without scaling their text. Reduced motion remains instant.
 */
export function animateAddressMode(
  grid: () => HTMLElement | undefined,
  editing: () => boolean,
): { destroy: () => void } {
  if (typeof window === 'undefined') return { destroy: () => {} }
  let previous: boolean | undefined
  let revision = 0
  let animations: Animation[] = []
  const selectors =
    '[data-address-details], [data-address-divisions], [data-address-parts-panel]'
  let clipping: { node: HTMLElement; overflow: string }[] = []
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let node: HTMLElement | undefined
  let originalTransition = ''
  let snapshot = new Map<HTMLElement, DOMRect>()
  let frame = 0

  /** Remember the last painted layout, before Svelte updates any child markup.
   * @returns Nothing.
   */
  function capture(): void {
    if (!node) return
    snapshot = new Map(
      [...node.querySelectorAll<HTMLElement>(selectors)].map(panel => [
        panel,
        panel.getBoundingClientRect(),
      ]),
    )
  }

  /** Follow only active movement so rapid reversal starts at the visible position.
   * @returns Nothing.
   */
  function follow(): void {
    capture()
    frame = requestAnimationFrame(follow)
  }

  $effect(() => {
    const element = grid()
    if (!element) return
    node = element
    capture()
    const observer = new ResizeObserver(() => {
      if (!animations.length) capture()
    })
    observer.observe(element)
    for (const panel of element.querySelectorAll<HTMLElement>(selectors))
      observer.observe(panel)
    document.addEventListener('scroll', capture, true)
    return () => {
      observer.disconnect()
      document.removeEventListener('scroll', capture, true)
    }
  })

  /** Release only this mode transition, leaving panel disclosure animations intact.
   * @returns Nothing.
   */
  function cancel(): void {
    cancelAnimationFrame(frame)
    for (const animation of animations) animation.cancel()
    animations = []
    for (const saved of clipping) saved.node.style.overflow = saved.overflow
    clipping = []
    if (node) node.style.transitionProperty = originalTransition
  }

  $effect.pre(() => {
    const next = editing()
    const currentNode = grid()
    if (!currentNode) return
    if (node !== currentNode) {
      node = currentNode
      originalTransition = node.style.transitionProperty
    }
    if (next === previous) return
    const initial = previous === undefined
    previous = next
    const currentRevision = ++revision
    const before = snapshot
    cancel()
    if (initial || motion.matches) return

    // The mode changes the number of grid tracks; animate retained panels instead.
    node.style.transitionProperty = 'none'
    void tick().then(() => {
      if (currentRevision !== revision || !node?.isConnected) return
      if (motion.matches) {
        cancel()
        return
      }
      // The content, including its heading, travels outside the destination sidebar
      // until it arrives. Its scrolling and clipping resume when movement finishes.
      const divisions = node.querySelector<HTMLElement>('[data-address-divisions]')
      for (
        let ancestor = divisions?.parentElement;
        ancestor && ancestor !== node;
        ancestor = ancestor.parentElement
      ) {
        clipping.push({ node: ancestor, overflow: ancestor.style.overflow })
        ancestor.style.overflow = 'visible'
      }
      for (const panel of node.querySelectorAll<HTMLElement>(selectors)) {
        const old = before.get(panel)
        const rect = panel.getBoundingClientRect()
        if (!rect.width || !rect.height) continue
        const x = old ? old.left - rect.left : -28
        const y = old ? old.top - rect.top : 0
        if (old && Math.abs(x) < 1 && Math.abs(y) < 1) continue
        animations.push(
          panel.animate(
            [
              { transform: `translate(${x}px, ${y}px)`, opacity: old ? 1 : 0 },
              { transform: 'translate(0, 0)', opacity: 1 },
            ],
            { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
          ),
        )
      }
      frame = requestAnimationFrame(follow)
      void Promise.all(
        animations.map(animation => animation.finished.catch(() => {})),
      ).then(() => {
        if (currentRevision === revision) {
          cancel()
          capture()
        }
      })
    })
  })

  motion.addEventListener('change', cancel)
  return {
    destroy() {
      revision++
      cancel()
      motion.removeEventListener('change', cancel)
    },
  }
}
