/**
 * Returns whether the active element should block global keyboard shortcuts.
 *
 * @param activeElement Currently focused element.
 * @returns `true` when focus is inside an editable control.
 */
export function shouldSkipGlobalKeydown(activeElement: Element | null): boolean {
  if (!activeElement) {
    return false
  }

  return (
    activeElement.tagName === 'INPUT' ||
    activeElement.tagName === 'TEXTAREA' ||
    activeElement.tagName === 'SELECT' ||
    activeElement.getAttribute('contenteditable') === 'true'
  )
}

/**
 * Consumes Escape when there are app panels open.
 *
 * @param event Keyboard event being handled.
 * @param hasOpenPanels Whether any app panel is currently open.
 * @returns `true` when Escape was consumed for panel closing.
 */
export function consumeEscapeForOpenPanels(
  event: KeyboardEvent,
  hasOpenPanels: boolean,
): boolean {
  if (event.key !== 'Escape' || !hasOpenPanels) {
    return false
  }

  event.preventDefault()
  event.stopPropagation()
  return true
}
