/** Copies sharing text, including on browsers that deny the async clipboard API.
 * @param value Public link or caption to copy.
 * @returns Completion after a browser copy operation succeeds.
 * @remarks Call from a user gesture. A rejected fallback remains an error, never a success notice.
 */
export async function copyShareText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {
    // Browser permissions or an insecure origin can make the modern API unavailable.
  }

  const focused = document.activeElement
  const selection = window.getSelection()
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) =>
        selection.getRangeAt(index).cloneRange(),
      )
    : []
  const input = document.createElement('textarea')
  input.value = value
  input.readOnly = true
  input.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
  document.body.append(input)
  try {
    input.focus({ preventScroll: true })
    input.select()
    if (!document.execCommand('copy')) throw new Error('Clipboard copy unavailable')
  } finally {
    // Restore the triggering control and selection without moving the page.
    input.remove()
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true })
    if (selection) {
      selection.removeAllRanges()
      for (const range of ranges) selection.addRange(range)
    }
  }
}
