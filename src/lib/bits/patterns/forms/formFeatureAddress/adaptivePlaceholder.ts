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
  const fitContent = (): void => {
    input = node.querySelector('input[id^="address-"]:not([id$="-type"])')
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
  const resize = new ResizeObserver(fitContent)
  const mutations = new MutationObserver(() => {
    if (input) resize.observe(input)
    fitContent()
  })
  mutations.observe(node, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['placeholder'],
  })
  resize.observe(node)
  fitContent()
  if (input) resize.observe(input)
  return {
    update(value) {
      example = value
      fitContent()
    },
    destroy() {
      resize.disconnect()
      mutations.disconnect()
    },
  }
}
