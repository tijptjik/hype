const headerSelector = '.bits-form__section-header'

/**
 * Match adjacent section headers to the tallest natural header in their visual row.
 * @param surface Form surface containing resource tabs and responsive columns.
 * @returns Cleanup for observers and pending layout work.
 * @remarks Measure without the previous minimum so rows can shrink after resizing,
 * changing locale, or removing controls. Stacked and hidden headers stay independent.
 */
export function alignSectionHeaders(surface: HTMLElement): { destroy(): void } {
  let frame = 0
  let headers: HTMLElement[] = []
  const previous = new Map<HTMLElement, { value: string; priority: string }>()

  /** Restore the authored inline minimum, including its cascade priority.
   * @param header Header being measured or released.
   * @returns Nothing.
   */
  function restoreMinimum(header: HTMLElement): void {
    const minimum = previous.get(header)
    header.style.setProperty(
      'min-height',
      minimum?.value ?? '',
      minimum?.priority ?? '',
    )
  }

  /** Queue one measurement after the current DOM updates.
   * @returns Nothing.
   */
  function schedule(): void {
    if (!frame) frame = requestAnimationFrame(align)
  }

  /** Measure natural rows before applying their shared minimum height.
   * @returns Nothing.
   */
  function align(): void {
    frame = 0
    for (const header of headers) restoreMinimum(header)
    const rows: { top: number; height: number; headers: HTMLElement[] }[] = []
    for (const header of headers) {
      const box = header.getBoundingClientRect()
      if (!box.width || !box.height) continue
      const row = rows.find(candidate => Math.abs(candidate.top - box.top) < 1)
      if (row) {
        row.height = Math.max(row.height, box.height)
        row.headers.push(header)
      } else rows.push({ top: box.top, height: box.height, headers: [header] })
    }
    for (const row of rows) {
      if (row.headers.length < 2) continue
      // Shared search headers have important minimums; the measured row must win.
      for (const header of row.headers) {
        header.style.setProperty('min-height', `${row.height}px`, 'important')
      }
    }
  }

  const resize = new ResizeObserver(schedule)
  /** Refresh observed headers when a resource tab or its controls change.
   * @returns Nothing.
   */
  function refresh(): void {
    resize.disconnect()
    headers = Array.from(surface.querySelectorAll<HTMLElement>(headerSelector)).filter(
      header => header.closest('[data-form-surface]') === surface,
    )
    for (const [header] of previous) {
      if (!headers.includes(header)) {
        restoreMinimum(header)
        previous.delete(header)
      }
    }
    resize.observe(surface)
    for (const header of headers) {
      if (!previous.has(header)) {
        previous.set(header, {
          value: header.style.getPropertyValue('min-height'),
          priority: header.style.getPropertyPriority('min-height'),
        })
      }
      resize.observe(header)
      // Intrinsic content can shrink while the synchronized header stays tall.
      for (const child of header.children) resize.observe(child)
    }
    schedule()
  }
  const mutation = new MutationObserver(refresh)
  mutation.observe(surface, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'hidden'],
  })
  refresh()
  return {
    destroy() {
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutation.disconnect()
      for (const [header] of previous) restoreMinimum(header)
    },
  }
}
