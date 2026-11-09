/** Make a secondary form action reachable with Shift+Tab but skip it with forward Tab.
 * @param node Reset or removal button that should not interrupt forward field entry.
 * @param enabled Whether the button currently represents a reset action.
 * @returns Cleanup that restores the button's original tab index.
 * @remarks Capture Tab from the document so entry from outside the field follows the same rule. Pointer and programmatic focus remain available.
 */
export function reverseTabStop(
  node: HTMLButtonElement,
  enabled = true,
): { update: (value: boolean) => void; destroy: () => void } {
  const original = node.getAttribute('tabindex')
  if (enabled) node.tabIndex = -1
  const document = node.ownerDocument
  /** Set eligibility before the browser performs native sequential focus navigation.
   * @param event Keyboard navigation event. @returns Nothing.
   */
  function keydown(event: KeyboardEvent): void {
    if (enabled && event.key === 'Tab') node.tabIndex = event.shiftKey ? 0 : -1
  }
  document.addEventListener('keydown', keydown, true)
  return {
    update: value => {
      enabled = value
      if (enabled) node.tabIndex = -1
      else if (original === null) node.removeAttribute('tabindex')
      else node.setAttribute('tabindex', original)
    },
    destroy: () => {
      document.removeEventListener('keydown', keydown, true)
      if (original === null) node.removeAttribute('tabindex')
      else node.setAttribute('tabindex', original)
    },
  }
}
