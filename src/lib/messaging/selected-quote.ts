// TYPES
import type { TextQuote } from './types.js'

/** Translate a selection inside one rendered message to exact native UTF-16 positions.
 * @param root The message body only, excluding sender, quote preview and action labels.
 * @param text Its unmodified platform text or caption.
 * @param selection Browser selection; other messages and UI controls are rejected.
 * @returns The selected source excerpt or null for an empty or unrelated selection.
 */
export function selectedTextQuote(root: HTMLElement, text: string, selection: Selection | null): TextQuote | null {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const lines = Array.from(root.querySelectorAll<HTMLElement>('[data-quote-offset]'))
  const position = (node: Node, offset: number): number | null => {
    for (const line of lines) {
      if (line.contains(node)) {
        const prefix = document.createRange()
        prefix.selectNodeContents(line); prefix.setEnd(node, offset)
        return Number(line.dataset.quoteOffset) + Math.min(prefix.toString().length, Number(line.dataset.quoteLength))
      }
    }
    const point = document.createRange(); point.setStart(node, offset); point.collapse(true)
    for (const line of lines) if (point.comparePoint(line, 0) >= 0) return Number(line.dataset.quoteOffset)
    const last = lines.at(-1)
    return last ? Number(last.dataset.quoteOffset) + Number(last.dataset.quoteLength) : null
  }
  const start = position(range.startContainer, range.startOffset), end = position(range.endContainer, range.endOffset)
  if (start === null || end === null || end <= start) return null
  const selected = text.slice(start, end)
  return selected.trim() ? { text: selected, offset: start } : null
}
