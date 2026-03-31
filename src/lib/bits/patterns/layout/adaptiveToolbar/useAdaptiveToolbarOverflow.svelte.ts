import { tick } from 'svelte'

type AdaptiveToolbarOverflowOptions = {
  onMeasureStart: () => void
  onMeasureEnd: (next: { showButtonText: boolean }) => void
}

const RESOLVE_DEBOUNCE_MS = 40
const RIGHT_CLUSTER_BUFFER_PX = 40

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

  return Math.ceil(total)
}

export function createAdaptiveToolbarOverflowAttach(
  options: AdaptiveToolbarOverflowOptions,
): (node: HTMLElement) => { destroy: () => void } {
  return (node: HTMLElement) => {
    let frameId: number | null = null
    let debounceId: ReturnType<typeof setTimeout> | null = null
    let hasResolvedOnce = false

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

      const leftWidth = measureGroupWidth(leftGroup)
      const rightWidth = measureGroupWidth(rightGroup)
      const rootStyles = getComputedStyle(node)
      const paddingLeft = Number.parseFloat(rootStyles.paddingLeft || '0') || 0
      const paddingRight = Number.parseFloat(rootStyles.paddingRight || '0') || 0
      const availableWidth = Math.ceil(node.clientWidth - paddingLeft - paddingRight)

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
    mutationObserver.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    scheduleOverflowResolution({ immediate: true })

    return {
      destroy: () => {
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
