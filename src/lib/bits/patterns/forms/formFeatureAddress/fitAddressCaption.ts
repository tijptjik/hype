/** Keep optional checkbox wording only when its row fits at natural widths.
 * @param node Caption beside the checkbox. @param _text Localized caption; changes trigger remeasurement.
 * @returns Action lifecycle; widths are measured independently of the visible caption state.
 */
export function fitAddressCaption(
  node: HTMLElement,
  _text: string,
): { update: (text: string) => void; destroy: () => void } {
  const row = node.closest<HTMLElement>('[data-address-field-row]')
  let frame = 0
  const measure = (): void => {
    if (!row?.isConnected) return
    const probe = row.cloneNode(true) as HTMLElement
    probe.inert = true
    probe.setAttribute('aria-hidden', 'true')
    probe.removeAttribute('id')
    probe.querySelectorAll('[id]').forEach(element => {
      element.removeAttribute('id')
    })
    probe.style.cssText =
      'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;width:max-content;max-width:none;display:flex;contain:layout style;'
    for (const field of Array.from(probe.children) as HTMLElement[])
      field.style.cssText = 'flex:none;width:max-content;max-width:none;'
    probe
      .querySelectorAll<HTMLElement>('[data-block-order-caption]')
      .forEach(caption => {
        caption.style.display = 'inline'
      })
    row.append(probe)
    const fits = probe.getBoundingClientRect().width <= row.clientWidth
    probe.remove()
    node.style.display = fits ? 'inline' : 'none'
  }
  const schedule = (): void => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(measure)
  }
  const observer = new ResizeObserver(schedule)
  if (row) {
    observer.observe(row)
    Array.from(row.children).forEach(field => {
      observer.observe(field)
    })
  }
  schedule()
  return {
    update(_text) {
      schedule()
    },
    destroy() {
      cancelAnimationFrame(frame)
      observer.disconnect()
    },
  }
}
