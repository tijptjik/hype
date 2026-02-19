<script lang="ts">
import { onMount, tick } from 'svelte'
import type { HeaderRootProps } from './headerPrimitives.types'

let {
  class: className = '',
  measurementKey = '',
  left,
  right,
  ...restProps
}: HeaderRootProps = $props()

let rootEl: HTMLElement | null = null
let resizeObserver: ResizeObserver | null = null
let frameId: number | null = null
let debounceId: ReturnType<typeof setTimeout> | null = null
let suppressTransitions = $state(false)
let maskButtonLabels = $state(true)
let hasResolvedOnce = false
let lastResolvedWidth = $state(0)
let lastResolvedKey = $state('')

const RESOLVE_DEBOUNCE_MS = 100
const ANIMATION_SETTLE_MS = 420

let showDescription = $state(true)
let showTitle = $state(true)
let showButtonText = $state(true)

const rootClass = $derived(
  [
    'bits-pattern-header',
    suppressTransitions ? 'bits-pattern-header--measuring' : '',
    maskButtonLabels ? 'bits-pattern-header--mask-button-labels' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)

const renderState = $derived({
  showDescription,
  showTitle,
  showButtonText,
})

function hasOverlap(a: Element | null, b: Element | null): boolean {
  if (!a || !b) return false
  const aRect = a.getBoundingClientRect()
  const bRect = b.getBoundingClientRect()

  return aRect.right + 8 > bRect.left
}

function overflowsRight(container: Element | null, target: Element | null): boolean {
  if (!container || !target) return false
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()

  return targetRect.right > containerRect.right - 8
}

function hasContentOverlap(
  leftGroup: Element | null,
  rightGroup: Element | null,
): boolean {
  if (!leftGroup || !rightGroup) return false
  const leftRect = leftGroup.getBoundingClientRect()
  const rightRect = rightGroup.getBoundingClientRect()
  const leftContentRight = leftRect.left + leftGroup.scrollWidth

  return leftContentRight + 8 > rightRect.left
}

async function resolveOverflow(allowProbe = true): Promise<void> {
  if (!rootEl) return

  const leftGroup = rootEl.querySelector('[data-header-left-group]')
  const rightGroup = rootEl.querySelector('[data-header-right-group]')
  if (!leftGroup || !rightGroup) return
  const isRightConstrained = (): boolean =>
    hasOverlap(leftGroup, rightGroup) ||
    hasContentOverlap(leftGroup, rightGroup) ||
    overflowsRight(rootEl, rightGroup)

  // Keep title/description always visible and only collapse button labels on overflow.
  const hadHiddenLeftContent = !showDescription || !showTitle
  showDescription = true
  showTitle = true
  if (hadHiddenLeftContent) {
    await tick()
  }

  if (showButtonText && isRightConstrained()) {
    showButtonText = false
    await tick()
  }

  const probeAndCommit = async (
    current: boolean,
    setVisible: (next: boolean) => void,
    canFit: () => boolean,
  ): Promise<boolean> => {
    if (current) return current

    const previousMaskState = maskButtonLabels
    suppressTransitions = true
    maskButtonLabels = true
    setVisible(true)
    await tick()
    const fits = canFit()
    setVisible(false)
    await tick()
    suppressTransitions = false
    maskButtonLabels = previousMaskState
    await tick()

    if (fits) {
      setVisible(true)
      await tick()
      return true
    }

    return false
  }

  if (allowProbe) {
    showButtonText = await probeAndCommit(
      showButtonText,
      next => {
        showButtonText = next
      },
      () => !isRightConstrained(),
    )
  }

  if (!hasResolvedOnce) {
    hasResolvedOnce = true
    maskButtonLabels = false
  }
}

let pendingAllowProbe = false

function scheduleOverflowResolution(allowProbe = true): void {
  if (typeof window === 'undefined') return

  if (debounceId !== null) {
    clearTimeout(debounceId)
    pendingAllowProbe = pendingAllowProbe || allowProbe
  } else {
    pendingAllowProbe = allowProbe
  }

  debounceId = setTimeout(
    () => {
      debounceId = null

      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }

      frameId = requestAnimationFrame(() => {
        frameId = null
        const nextAllowProbe = pendingAllowProbe
        pendingAllowProbe = false
        void resolveOverflow(nextAllowProbe)
      })
    },
    hasResolvedOnce ? RESOLVE_DEBOUNCE_MS + ANIMATION_SETTLE_MS : 0,
  )
}

$effect(() => {
  const key = measurementKey
  const width = rootEl ? Math.round(rootEl.getBoundingClientRect().width) : 0
  const previousWidth = lastResolvedWidth
  const widthChanged = width !== lastResolvedWidth
  const keyChanged = key !== lastResolvedKey

  if (widthChanged) {
    lastResolvedWidth = width
  }
  if (keyChanged) {
    lastResolvedKey = key
  }

  if (!widthChanged && !keyChanged && hasResolvedOnce) return
  const widthGrew = width > previousWidth
  // Prevent jitter: when labels are already hidden, a key-only change should not
  // force a temporary re-show probe. Re-probe only when width actually changes.
  const allowProbe = showButtonText || widthChanged || widthGrew
  scheduleOverflowResolution(allowProbe)
})

onMount(() => {
  if (!rootEl) return

  resizeObserver = new ResizeObserver(() => {
    scheduleOverflowResolution()
  })
  resizeObserver.observe(rootEl)
  scheduleOverflowResolution()

  return () => {
    resizeObserver?.disconnect()
    resizeObserver = null
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
</header>
