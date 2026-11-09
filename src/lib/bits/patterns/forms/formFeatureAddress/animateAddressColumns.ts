/** Animate intrinsic address-control columns when locale rows or labels change.
 * @param node Grid that owns the block/phase subgrid tracks.
 * @param enabled Whether this field uses intrinsic shared columns.
 * @returns Observer cleanup, including cancellation of any active resize animation.
 * @remarks Pixel tracks are animated only temporarily; natural sizing resumes afterwards.
 */
export function animateAddressColumns(
  node: HTMLElement,
  enabled: boolean,
): { destroy: () => void } {
  if (!enabled) return { destroy: () => {} }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let columns = getComputedStyle(node).gridTemplateColumns
  let animation: Animation | undefined

  /** Measure the new intrinsic widths and interpolate from the last rendered tracks. */
  function resize(): void {
    const previous = animation ? getComputedStyle(node).gridTemplateColumns : columns
    animation?.cancel()
    animation = undefined
    const next = getComputedStyle(node).gridTemplateColumns
    columns = next
    if (
      previous === next ||
      reducedMotion.matches ||
      typeof node.animate !== 'function'
    )
      return
    // Intrinsic max-content tracks cannot interpolate directly; resolved pixel tracks can.
    const current = node.animate(
      [{ gridTemplateColumns: previous }, { gridTemplateColumns: next }],
      { duration: 200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    )
    animation = current
    current.onfinish = () => {
      if (animation === current) animation = undefined
    }
  }

  // Measure in the mutation microtask, before the narrower natural width can paint.
  const mutations = new MutationObserver(resize)
  mutations.observe(node, { childList: true, subtree: true, characterData: true })
  const sizes = new ResizeObserver(() => {
    if (!animation) resize()
  })
  sizes.observe(node)
  return {
    destroy: () => {
      mutations.disconnect()
      sizes.disconnect()
      animation?.cancel()
    },
  }
}
