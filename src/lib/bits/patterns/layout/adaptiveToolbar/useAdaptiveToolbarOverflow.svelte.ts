import { tick } from 'svelte'

type AdaptiveToolbarOverflowOptions = {
  onMeasureStart: () => void
  onMeasureEnd: (next: { showButtonText: boolean }) => void
}

const RESOLVE_DEBOUNCE_MS = 40
const RIGHT_CLUSTER_BUFFER_PX = 40

/** Measure intrinsic contents including their flex gaps and reserved group space. */
function measureGroupWidth(group: HTMLElement): number {
  const children = Array.from(group.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  )
  if (children.length === 0) {
    return Math.ceil(group.getBoundingClientRect().width)
  }

  let total = 0

  for (const child of children) {
    const rect = child.getBoundingClientRect()
    const styles = getComputedStyle(child)
    const marginLeft = Number.parseFloat(styles.marginLeft || '0') || 0
    const marginRight = Number.parseFloat(styles.marginRight || '0') || 0
    total += rect.width + marginLeft + marginRight
  }

  const styles = getComputedStyle(group)
  const gap = Number.parseFloat(styles.columnGap) || 0
  const padding =
    (Number.parseFloat(styles.paddingLeft) || 0) +
    (Number.parseFloat(styles.paddingRight) || 0)
  return Math.ceil(
    Math.max(
      group.getBoundingClientRect().width,
      total + gap * Math.max(0, children.length - 1) + padding,
    ),
  )
}

/** Adapt labels to the space available after the live identity column is reserved.
 * @param options Callbacks for measurement lifecycle and label visibility.
 * @returns Attachment which observes content and container geometry and cleans up on detach.
 */
export function createAdaptiveToolbarOverflowAttach(
  options: AdaptiveToolbarOverflowOptions,
): (node: HTMLElement) => { destroy: () => void } {
  return (node: HTMLElement) => {
    let frameId: number | null = null
    let debounceId: ReturnType<typeof setTimeout> | null = null
    let hasResolvedOnce = false
    let destroyed = false

    async function resolveOverflow(): Promise<void> {
      const leftGroup = node.querySelector(
        '[data-adaptive-toolbar-left-group-measure]',
      ) as HTMLElement | null
      const rightGroup = node.querySelector(
        '[data-adaptive-toolbar-right-group-measure]',
      ) as HTMLElement | null
      if (!leftGroup || !rightGroup) return

      options.onMeasureStart()
      await tick()

      if (destroyed) return
      // The visible identity column can reserve sidebar alignment space absent from the clone.
      const liveLeft = node.querySelector<HTMLElement>(
        ':scope > [data-adaptive-toolbar-left-group]',
      )
      const liveRight = node.querySelector<HTMLElement>(
        ':scope > [data-adaptive-toolbar-right-group]',
      )
      if (liveLeft) {
        const style = getComputedStyle(liveLeft)
        leftGroup.style.minWidth = style.minWidth
        leftGroup.style.paddingLeft = style.paddingLeft
        leftGroup.style.paddingRight = style.paddingRight
      }
      const leftWidth = measureGroupWidth(leftGroup)
      const rightWidth = measureGroupWidth(rightGroup)
      const rootStyles = getComputedStyle(node)
      const paddingLeft = Number.parseFloat(rootStyles.paddingLeft || '0') || 0
      const paddingRight = Number.parseFloat(rootStyles.paddingRight || '0') || 0
      const groupGap = Number.parseFloat(rootStyles.columnGap) || 0
      const rightMargin = liveRight
        ? Number.parseFloat(getComputedStyle(liveRight).marginLeft) || 0
        : 0
      const availableWidth = Math.floor(
        node.clientWidth - paddingLeft - paddingRight - groupGap - rightMargin,
      )

      options.onMeasureEnd({
        showButtonText:
          leftWidth + rightWidth + RIGHT_CLUSTER_BUFFER_PX <= availableWidth,
      })
      hasResolvedOnce = true
    }

    function scheduleOverflowResolution(options: { immediate?: boolean } = {}): void {
      if (typeof window === 'undefined') return

      if (debounceId !== null) {
        clearTimeout(debounceId)
      }

      debounceId = setTimeout(
        () => {
          debounceId = null

          if (frameId !== null) {
            cancelAnimationFrame(frameId)
          }

          frameId = requestAnimationFrame(() => {
            frameId = null
            void resolveOverflow()
          })
        },
        options.immediate ? 0 : hasResolvedOnce ? RESOLVE_DEBOUNCE_MS : 0,
      )
    }

    const resizeObserver = new ResizeObserver(() => {
      scheduleOverflowResolution()
    })
    const mutationObserver = new MutationObserver(() => {
      scheduleOverflowResolution()
    })

    resizeObserver.observe(node)
    // Font changes, reserved identity width and dynamic actions can change without root resize.
    for (const group of node.querySelectorAll<HTMLElement>(
      '[data-adaptive-toolbar-left-group], [data-adaptive-toolbar-right-group], [data-adaptive-toolbar-left-group-measure], [data-adaptive-toolbar-right-group-measure]',
    ))
      resizeObserver.observe(group)
    mutationObserver.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    scheduleOverflowResolution({ immediate: true })

    return {
      destroy: () => {
        destroyed = true
        resizeObserver.disconnect()
        mutationObserver.disconnect()

        if (debounceId !== null) {
          clearTimeout(debounceId)
          debounceId = null
        }

        if (frameId !== null) {
          cancelAnimationFrame(frameId)
          frameId = null
        }
      },
    }
  }
}
