<script lang="ts">
import { onMount, tick } from 'svelte'
import type { HeaderRootProps } from './headerPrimitives.types'

let {
  class: className = '',
  measurementKey = '',
  rightRevealKey = '',
  left,
  right,
  ...restProps
}: HeaderRootProps = $props()

let rootEl: HTMLElement | null = null
let frameId: number | null = null
let debounceId: ReturnType<typeof setTimeout> | null = null
let hideMeasuredControls = $state(true)
let hasResolvedOnce = $state(false)
let lastResolvedWidth = 0
let lastResolvedKey = ''
let lastRightRevealKey = ''
let settledRightRevealKey = $state('')

const RESOLVE_DEBOUNCE_MS = 40
const RIGHT_CLUSTER_BUFFER_PX = 40

let showButtonText = $state(false)

const rootClass = $derived(
  [
    'bits-pattern-header',
    hideMeasuredControls ? 'bits-pattern-header--hide-measured-controls' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)

const renderState = $derived({
  showDescription: true,
  showTitle: true,
  showButtonText:
    hasResolvedOnce && rightRevealKey === settledRightRevealKey
      ? showButtonText
      : false,
})

const measurementState = {
  showDescription: true,
  showTitle: true,
  showButtonText: true,
} as const

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

async function resolveOverflow(): Promise<void> {
  if (!rootEl) return

  const leftGroup = rootEl.querySelector(
    '[data-header-left-group-measure]',
  ) as HTMLElement | null
  const rightGroup = rootEl.querySelector(
    '[data-header-right-group-measure]',
  ) as HTMLElement | null
  if (!leftGroup || !rightGroup) return
  hideMeasuredControls = true
  await tick()

  const leftWidth = measureGroupWidth(leftGroup)
  const rightWidth = measureGroupWidth(rightGroup)
  const rootStyles = getComputedStyle(rootEl)
  const paddingLeft = Number.parseFloat(rootStyles.paddingLeft || '0') || 0
  const paddingRight = Number.parseFloat(rootStyles.paddingRight || '0') || 0
  const availableWidth = Math.ceil(rootEl.clientWidth - paddingLeft - paddingRight)
  showButtonText = leftWidth + rightWidth + RIGHT_CLUSTER_BUFFER_PX <= availableWidth

  if (!hasResolvedOnce) hasResolvedOnce = true
  settledRightRevealKey = rightRevealKey
  hideMeasuredControls = false
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

$effect(() => {
  const key = measurementKey
  const revealKey = rightRevealKey
  const width = rootEl ? Math.round(rootEl.getBoundingClientRect().width) : 0
  const previousWidth = lastResolvedWidth
  const widthChanged = width !== lastResolvedWidth
  const keyChanged = key !== lastResolvedKey
  const revealKeyChanged = revealKey !== lastRightRevealKey

  if (widthChanged) {
    lastResolvedWidth = width
  }
  if (keyChanged) {
    lastResolvedKey = key
  }
  if (revealKeyChanged) {
    lastRightRevealKey = revealKey
  }

  if (!widthChanged && !keyChanged && !revealKeyChanged && hasResolvedOnce) return
  if (revealKeyChanged) {
    scheduleOverflowResolution()
    return
  }
  scheduleOverflowResolution({ immediate: widthChanged && width > previousWidth })
})

onMount(() => {
  if (!rootEl) return

  const resizeObserver = new ResizeObserver(() => {
    scheduleOverflowResolution()
  })
  resizeObserver.observe(rootEl)
  scheduleOverflowResolution()

  return () => {
    resizeObserver.disconnect()
    if (debounceId !== null) {
      clearTimeout(debounceId)
      debounceId = null
    }
    if (frameId !== null) {
      cancelAnimationFrame(frameId)
      frameId = null
    }
  }
})
</script>

<header bind:this={rootEl} class={rootClass} {...restProps}>
  <div class="bits-pattern-header__left" data-header-left-group>
    {@render left?.(renderState)}
  </div>

  <div class="bits-pattern-header__right" data-header-right-group>
    {@render right?.(renderState)}
  </div>

  <div class="bits-pattern-header__measure-layer" aria-hidden="true">
    <div
      class="bits-pattern-header__left bits-pattern-header__measure-group"
      data-header-left-group-measure
    >
      {@render left?.(measurementState)}
    </div>

    <div
      class="bits-pattern-header__right bits-pattern-header__measure-group"
      data-header-right-group-measure
    >
      {@render right?.(measurementState)}
    </div>
  </div>
</header>
