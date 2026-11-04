/** Keep the reader's visible message fixed when media resizes or older history is inserted.
 * @param viewport Scrollable message timeline with stable data-message-key attributes.
 * @param followingEnd Whether the reader was already following the latest messages.
 * @returns Explicit capture/restore hooks for pagination and a lifecycle cleanup function.
 * @remarks Native scroll anchoring must be disabled on this viewport to avoid double correction.
 */
export function preserveMessageAnchor(
  viewport: HTMLElement,
  followingEnd: () => boolean,
): {
  capture: () => void
  restore: () => void
  destroy: () => void
} {
  let anchor: { key: string; offset: number } | undefined
  let destroyed = false
  let frame: number | undefined
  let capturedTop = viewport.scrollTop
  const observed = new Set<Element>()
  const messages = (): HTMLElement[] =>
    Array.from(viewport.querySelectorAll<HTMLElement>('[data-message-key]'))
  const capture = (): void => {
    capturedTop = viewport.scrollTop
    const top = viewport.getBoundingClientRect().top
    const first = messages().find(
      message => message.getBoundingClientRect().bottom > top,
    )
    anchor = first
      ? {
          key: first.dataset.messageKey!,
          offset: first.getBoundingClientRect().top - top,
        }
      : undefined
  }
  const restore = (): void => {
    if (destroyed) return
    if (followingEnd()) viewport.scrollTop = viewport.scrollHeight
    else if (anchor) {
      const message = messages().find(
        message => message.dataset.messageKey === anchor?.key,
      )
      if (message)
        viewport.scrollTop +=
          message.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top -
          anchor.offset
    }
    capture()
  }
  // Batch scroll writes outside observer delivery so scrollbar changes cannot recurse into layout.
  const scheduleRestore = (): void => {
    if (destroyed || frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      restore()
    })
  }
  const resize = new ResizeObserver(scheduleRestore)
  const observe = (): void => {
    const children = new Set<Element>([viewport, ...viewport.children])
    for (const old of observed)
      if (!children.has(old)) {
        resize.unobserve(old)
        observed.delete(old)
      }
    for (const child of children)
      if (!observed.has(child)) {
        resize.observe(child)
        observed.add(child)
      }
  }
  const mutation = new MutationObserver(() => {
    observe()
    scheduleRestore()
  })
  mutation.observe(viewport, { childList: true })
  // Firefox can emit a scroll event for resized overflow without changing scrollTop.
  const onScroll = (): void => {
    if (viewport.scrollTop !== capturedTop) capture()
  }
  viewport.addEventListener('scroll', onScroll, { passive: true })
  observe()
  capture()
  return {
    capture,
    restore,
    destroy: () => {
      destroyed = true
      if (frame !== undefined) cancelAnimationFrame(frame)
      resize.disconnect()
      mutation.disconnect()
      viewport.removeEventListener('scroll', onScroll)
    },
  }
}
