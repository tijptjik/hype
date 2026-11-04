/**
 * Route third-party controls through the shared tooltip provider.
 * @param node Boundary containing library-owned DOM, such as MapLibre controls.
 * @returns Cleanup for the boundary observer.
 * @remarks App-owned markup uses data-tooltip directly. This adapter is only for
 * libraries that create and update native title attributes outside Svelte.
 */
export function bridgeNativeTooltips(node: HTMLElement): { destroy: () => void } {
  /** Preserve library labels while suppressing the browser's unstyled tooltip. */
  function migrate(element: Element): void {
    const title = element.getAttribute('title')
    if (title === null) return
    element.setAttribute('data-tooltip', title)
    element.removeAttribute('title')
  }
  /** Inspect only added subtrees rather than rescanning the map on each update. */
  function scan(element: Element): void {
    migrate(element)
    element.querySelectorAll('[title]').forEach(migrate)
  }
  scan(node)
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof Element)
        migrate(record.target)
      for (const added of record.addedNodes) if (added instanceof Element) scan(added)
    }
  })
  observer.observe(node, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['title'],
  })
  return { destroy: () => observer.disconnect() }
}
