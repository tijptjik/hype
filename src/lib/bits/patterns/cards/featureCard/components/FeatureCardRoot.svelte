<script lang="ts">
// SVELTE
import { tick } from 'svelte'
// ACTIONS
import { clickOutside } from '$lib/actions'
// CONTEXT
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// LOCAL
import { getFeatureCardLayout, getFeatureCardLayoutVars } from '../featureCard.layout'
import { getFeatureCardRootVars } from '../featureCard.styles'
import type { FeatureCardLayout } from '../featureCard.types'
import { getFeatureCardResponsiveWidth } from '../featureCard.utils'

const CARD_CONTENT_REVEAL_DELAY_MS = 120
const CARD_SHELL_TRANSITION_MS = 260

type RootProps = {
  children: import('svelte').Snippet
  heightBudgetPx?: number | null
  onLayoutChange?: (layout: FeatureCardLayout) => void
  onContentVisibilityChange?: (visible: boolean) => void
}

let {
  children,
  heightBudgetPx = null,
  onLayoutChange,
  onContentVisibilityChange,
}: RootProps = $props()

const omniCtx = getOmniCtx()
const responsiveCtx = getResponsiveCtx()

const horizontalOffset = $derived(responsiveCtx.getAppMainOffsetX())
const responsiveWidth = $derived(getFeatureCardResponsiveWidth(responsiveCtx))
const layout = $derived(
  getFeatureCardLayout({
    width: responsiveCtx.visibleWindowWidth,
    height: responsiveCtx.visibleWindowHeight,
    responsiveWidth,
    heightBudgetPx,
  }),
)
const shellStyle = $derived.by(() =>
  [
    getFeatureCardRootVars({
      layout,
      horizontalOffsetPx: horizontalOffset,
      availableWidthPx: responsiveWidth,
    }),
    `transform: translateX(var(--feature-card-horizontal-offset))`,
    `padding-inline: var(--feature-card-inline-padding)`,
    `padding-top: var(--feature-card-shell-top-padding)`,
    'padding-bottom: calc(var(--feature-card-shell-bottom-padding) + env(safe-area-inset-bottom))',
    getFeatureCardLayoutVars(layout),
  ].join('; '),
)
const cardStyle = $derived.by(() =>
  [
    'max-width: var(--feature-card-max-width)',
    'height: var(--feature-card-max-height)',
    'min-height: var(--feature-card-max-height)',
    'max-height: var(--feature-card-max-height)',
  ].join('; '),
)

let shellElement = $state<HTMLDivElement | null>(null)
let isCardShellAnimating = $state(false)
let isCardContentVisible = $state(omniCtx.state.isCardOpen)
let contentRevealTimer: ReturnType<typeof setTimeout> | null = null
let activeAnimationPhase = $state<'idle' | 'opening' | 'closing'>('idle')

$effect(() => {
  onLayoutChange?.(layout)
})

/**
 * Clears the deferred content reveal so repeated state changes cannot leak timers.
 */
function clearContentRevealTimer(): void {
  if (contentRevealTimer) {
    clearTimeout(contentRevealTimer)
    contentRevealTimer = null
  }
}

/**
 * Reveals the heavy card internals after the shell has nearly settled.
 */
function scheduleCardContentReveal(): void {
  clearContentRevealTimer()
  isCardContentVisible = false
  contentRevealTimer = setTimeout(() => {
    isCardContentVisible = true
    contentRevealTimer = null
  }, CARD_CONTENT_REVEAL_DELAY_MS)
}

/**
 * Computes the FLIP transform from one viewport rect to another.
 *
 * @param sourceRect Starting viewport rect.
 * @param targetRect Ending viewport rect.
 * @returns Transform string that maps the target box back to the source box.
 */
function getCardFlipTransform(
  sourceRect: {
    left: number
    top: number
    width: number
    height: number
  },
  targetRect: {
    left: number
    top: number
    width: number
    height: number
  },
): string {
  const translateX = sourceRect.left - targetRect.left
  const translateY = sourceRect.top - targetRect.top
  const scaleX = sourceRect.width / targetRect.width
  const scaleY = sourceRect.height / targetRect.height

  return `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`
}

/**
 * Animates the real card shell between its resting layout and a measured source/target rect.
 *
 * @param direction Whether the shell is opening from a source or closing to a target.
 */
async function animateCardShell(direction: 'opening' | 'closing'): Promise<void> {
  if (direction === 'opening') {
    await tick()
  }

  const measuredShell = shellElement
  if (!measuredShell) {
    if (direction === 'opening') {
      omniCtx.finishCardOpenTransition()
      isCardContentVisible = true
    } else {
      omniCtx.finishCardCloseTransition()
    }
    activeAnimationPhase = 'idle'
    return
  }

  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const restingRect = measuredShell.getBoundingClientRect()
  const shellRadiusPx = Number.parseFloat(
    getComputedStyle(measuredShell).borderTopLeftRadius,
  )
  const restingRadiusPx = Number.isFinite(shellRadiusPx) ? shellRadiusPx : 0
  const sourceRect =
    direction === 'opening'
      ? omniCtx.cardTransition.sourceRect
      : omniCtx.cardTransition.targetRect
  const sourceRadiusPx =
    direction === 'opening'
      ? omniCtx.cardTransition.sourceRadiusPx
      : omniCtx.cardTransition.targetRadiusPx

  if (!sourceRect) {
    if (direction === 'opening') {
      omniCtx.finishCardOpenTransition()
      isCardContentVisible = true
    } else {
      omniCtx.finishCardCloseTransition()
    }
    activeAnimationPhase = 'idle'
    return
  }

  clearContentRevealTimer()
  isCardShellAnimating = true
  isCardContentVisible = false

  const endTransform = getCardFlipTransform(sourceRect, restingRect)
  const keyframes =
    direction === 'opening'
      ? [
          {
            transformOrigin: 'top left',
            transform: endTransform,
            borderRadius: `${sourceRadiusPx}px`,
            opacity: 0.88,
          },
          {
            transformOrigin: 'top left',
            transform: 'translate(0px, 0px) scale(1, 1)',
            borderRadius: `${restingRadiusPx}px`,
            opacity: 1,
          },
        ]
      : [
          {
            transformOrigin: 'top left',
            transform: 'translate(0px, 0px) scale(1, 1)',
            borderRadius: `${restingRadiusPx}px`,
            opacity: 1,
          },
          {
            transformOrigin: 'top left',
            transform: endTransform,
            borderRadius: `${sourceRadiusPx}px`,
            opacity: 0.08,
          },
        ]

  if (reduceMotion || typeof measuredShell.animate !== 'function') {
    measuredShell.style.transformOrigin = 'top left'
    measuredShell.style.transform = ''
    measuredShell.style.opacity = '1'
    measuredShell.style.borderRadius = ''

    if (direction === 'opening') {
      omniCtx.finishCardOpenTransition()
      isCardShellAnimating = false
      activeAnimationPhase = 'idle'
      isCardContentVisible = true
    } else {
      isCardShellAnimating = false
      activeAnimationPhase = 'idle'
      omniCtx.finishCardCloseTransition()
    }
    return
  }

  const animation = measuredShell.animate(keyframes, {
    duration: CARD_SHELL_TRANSITION_MS,
    easing:
      direction === 'opening'
        ? 'cubic-bezier(0.22, 1, 0.36, 1)'
        : 'cubic-bezier(0.4, 0, 1, 1)',
    fill: 'both',
  })

  try {
    await animation.finished
  } catch {
    animation.cancel()
  } finally {
    animation.cancel()
    measuredShell.style.transformOrigin = 'top left'
    measuredShell.style.transform = ''
    measuredShell.style.opacity = '1'
    measuredShell.style.borderRadius = ''

    isCardShellAnimating = false
    activeAnimationPhase = 'idle'

    if (direction === 'opening') {
      omniCtx.finishCardOpenTransition()
      scheduleCardContentReveal()
    } else {
      omniCtx.finishCardCloseTransition()
    }
  }
}

$effect(() => {
  const isCardOpen = omniCtx.state.isCardOpen
  const transitionPhase = omniCtx.cardTransition.phase

  if (!isCardOpen) {
    clearContentRevealTimer()
    isCardContentVisible = false
    activeAnimationPhase = 'idle'
    return
  }

  if (transitionPhase !== 'idle' && activeAnimationPhase !== transitionPhase) {
    activeAnimationPhase = transitionPhase
    void animateCardShell(transitionPhase)
    return
  }

  if (transitionPhase === 'idle' && !isCardShellAnimating && !contentRevealTimer) {
    isCardContentVisible = true
  }
})

$effect(() => {
  const isContentVisible = isCardContentVisible
  onContentVisibilityChange?.(isContentVisible)
})

/**
 * Handles outside clicks for canvas dismissals and marker handoff.
 *
 * @param event Outside click event payload.
 */
function handleClickOutside(event: MouseEvent): void {
  const target = event.target as HTMLElement

  if (target?.dataset?.type === 'marker') {
    const featureId = target.dataset.featureId
    if (featureId) {
      omniCtx.handleFeatureSelection(featureId)
    }
    return
  }

  if (target?.localName === 'canvas') {
    omniCtx.closeCard()
  }
}
</script>

{#snippet cardChrome(cardStyle: string)}
  <div
    bind:this={shellElement}
    id="feature-card-shell"
    class="feature-card-chrome relative mx-auto flex w-full flex-col motion-reduce:transition-none"
    style={cardStyle}
  >
    <!-- Border chrome and inner fill live on the outer shell; the surface handles
         pointer events, transitions, and outside-click detection. -->
    <div
      id="feature-card"
      class={`feature-card-surface pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col ${isCardContentVisible ? 'bg-transparent' : 'bg-black'}`}
    >
      <div
        aria-hidden={isCardContentVisible}
        class={`pointer-events-none absolute inset-0 z-0 bg-black transition-opacity duration-180 ease-out motion-reduce:transition-none ${isCardContentVisible ? 'opacity-0' : 'opacity-100'}`}
      ></div>
      <div
        aria-hidden={!isCardContentVisible}
        class={`relative z-10 flex min-h-0 flex-1 flex-col transition-opacity duration-180 ease-out motion-reduce:transition-none ${isCardContentVisible ? 'opacity-100' : 'opacity-0'}`}
      >
        {@render children()}
      </div>
    </div>
  </div>
{/snippet}

{#if omniCtx.state.isCardOpen}
  <div
    class="pointer-events-none relative z-20 mx-auto flex h-full w-full"
    style={shellStyle}
    use:clickOutside={handleClickOutside}
  >
    {@render cardChrome(cardStyle)}
  </div>
{/if}

<style>
.feature-card-chrome {
  box-sizing: border-box;
  position: relative;
  border: var(--feature-card-border-width) solid black;
  border-radius: var(--feature-card-chrome-radius);
  overflow: hidden;
  isolation: isolate;
  contain: layout paint;
  will-change: transform, opacity, border-radius;
  box-shadow: var(--feature-card-chrome-shadow);
}

.feature-card-surface {
  position: relative;
  z-index: 10;
  overflow: hidden;
  border-radius: 0;
  contain: paint;
  transform: translateZ(0);
  box-shadow: var(--feature-card-surface-shadow);
}
</style>
