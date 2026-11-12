/** Fit whole examples to an address input instead of clipping a long placeholder.
 * @param node Field wrapper. @param example Localized examples, longest first.
 * @returns Action lifecycle; remeasures when the input width or examples change.
 */
export function adaptivePlaceholder(
  node: HTMLElement,
  example: string,
): { update: (value: string) => void; destroy: () => void } {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  let input: HTMLInputElement | null = null
  let frame = 0
  let disposed = false
  const fitContent = (): void => {
    frame = 0
    if (disposed) return
    const nextInput = node.querySelector<HTMLInputElement>(
      'input[id^="address-"]:not([id$="-type"])',
    )
    if (nextInput !== input) {
      if (input) resize.unobserve(input)
      input = nextInput
      if (input) resize.observe(input)
    }
    if (!input || !context) return
    const style = getComputedStyle(input)
    const placeholderStyle = getComputedStyle(input, '::placeholder')
    context.font = `${placeholderStyle.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const width =
      input.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight) -
      2
    // Hidden panels have no measurable width; retain their example until visible.
    if (width <= 0) return
    const parts = example.replace(/[.。]$/, '').split(/,\s*|、|，| or /)
    let candidate = example
    // Always retain one example rather than turning narrow numeric fields blank.
    while (parts.length > 1 && context.measureText(candidate).width > width) {
      parts.pop()
      candidate = parts.join(', ')
    }
    if (input.placeholder !== candidate) input.placeholder = candidate
  }
  /** Coalesce DOM and resize notifications without measuring inside observer delivery.
   * @returns Nothing.
   */
  function schedule(): void {
    if (!disposed && !frame) frame = requestAnimationFrame(fitContent)
  }
  const resize = new ResizeObserver(schedule)
  const mutations = new MutationObserver(schedule)
  mutations.observe(node, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['placeholder'],
  })
  resize.observe(node)
  fitContent()
  return {
    update(value) {
      example = value
      schedule()
    },
    destroy() {
      disposed = true
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutations.disconnect()
    },
  }
}
