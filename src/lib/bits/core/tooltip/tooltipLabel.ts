/**
 * Reads rendered labels without decorative icons or duplicated scrolling content.
 * @param target Tooltip anchor.
 * @returns Text available to the reader.
 */
function visibleLabel(target: HTMLElement): string {
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let element = node.parentElement; element; element = element.parentElement) {
        const style = getComputedStyle(element)
        if (
          element.matches('svg, [hidden], [aria-hidden="true"], .sr-only') ||
          style.display === 'none' ||
          style.visibility === 'hidden'
        )
          return NodeFilter.FILTER_REJECT
        if (element === target) break
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const text: string[] = []
  while (walker.nextNode()) text.push(walker.currentNode.textContent ?? '')
  return text.join('')
}

/**
 * Checks whether help only repeats a fully visible label.
 * @param target Tooltip anchor.
 * @param label Proposed help.
 * @returns Whether the help is redundant.
 * @remarks Keep labels for icon-only and genuinely clipped controls. Inline spans
 * report zero client width; that does not mean their visible text is clipped.
 */
export function repeatsVisibleTooltipLabel(
  target: HTMLElement,
  label: string,
): boolean {
  const normalize = (value: string): string =>
    value.replace(/\s+/g, ' ').trim().toLowerCase()
  if (normalize(visibleLabel(target)) !== normalize(label)) return false
  return ![target, ...target.querySelectorAll<HTMLElement>('*')].some(element => {
    if (element.closest('[hidden], [aria-hidden="true"], .sr-only')) return false
    const style = getComputedStyle(element)
    return (
      (element.clientWidth > 0 &&
        /^(hidden|clip|auto|scroll)$/.test(style.overflowX || style.overflow) &&
        element.scrollWidth > element.clientWidth + 1) ||
      (element.clientHeight > 0 &&
        /^(hidden|clip|auto|scroll)$/.test(style.overflowY || style.overflow) &&
        element.scrollHeight > element.clientHeight + 1)
    )
  })
}
