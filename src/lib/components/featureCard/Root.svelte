<script lang="ts">
// ACTIONS
import { clickOutside } from '$lib/actions'
// Animation
import { fade, scale } from 'svelte/transition'
import { cubicInOut } from 'svelte/easing'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
// ENUMS
import { PageState } from '$lib/enums'

// CONTEXT
let appCtx = getAppCtx()
let omniCtx = getOmniCtx()

// STATE : PROPS
let { children }: { children: any } = $props()

// STATE : DERIVED
let horizontalOffset = $derived(appCtx.getHorizontalOffset())

// PAGE STATE HANDLING
function handleOutroStart() {
  if (omniCtx.pageState === PageState.NeedTransition) {
    omniCtx.pageState = PageState.Transitioning
  }
}

function handleOutroEnd() {
  if (omniCtx.pageState === PageState.Transitioning) {
    omniCtx.pageState = PageState.ReadyToNav
    omniCtx.resetToSearch(false)
  }
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target?.dataset?.type === 'marker') {
    const featureId = target.dataset.featureId
    if (featureId) {
      omniCtx.handleFeatureSelection(featureId)
    }
  } else if (target.localName === 'canvas') {
    omniCtx.closeCard()
  }
}

// src/lib/actions/preventTouchScroll.ts
export function preventTouchScroll(node: HTMLElement) {
  const preventDefault = (e: TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  // Note: We need to specify passive: false to allow preventDefault()
  node.addEventListener('touchstart', preventDefault, { passive: false })
  node.addEventListener('touchmove', preventDefault, { passive: false })
  node.addEventListener('touchend', preventDefault, { passive: false })

  return {
    destroy() {
      node.removeEventListener('touchstart', preventDefault)
      node.removeEventListener('touchmove', preventDefault)
      node.removeEventListener('touchend', preventDefault)
    },
  }
}

// src/lib/actions/conditionalTouchScroll.ts
export function conditionalTouchScroll(node: HTMLElement, options = { threshold: 10 }) {
  let startX = 0
  let startY = 0
  let isDragging = false

  const handleTouchStart = (e: TouchEvent) => {
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    isDragging = false
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging) {
      const deltaX = e.touches[0].clientX - startX
      const deltaY = e.touches[0].clientY - startY

      // If movement is greater than threshold, consider it a drag
      if (
        Math.abs(deltaX) > options.threshold ||
        Math.abs(deltaY) > options.threshold
      ) {
        isDragging = true
      }
    }

    if (isDragging) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const handleTouchEnd = (e: TouchEvent) => {
    if (isDragging) {
      e.preventDefault()
      e.stopPropagation()
    }
    isDragging = false
  }

  node.addEventListener('touchstart', handleTouchStart, { passive: true })
  node.addEventListener('touchmove', handleTouchMove, { passive: false })
  node.addEventListener('touchend', handleTouchEnd, { passive: false })

  return {
    destroy() {
      node.removeEventListener('touchstart', handleTouchStart)
      node.removeEventListener('touchmove', handleTouchMove)
      node.removeEventListener('touchend', handleTouchEnd)
    },
    update(newOptions: { threshold: number }) {
      options = newOptions
    },
  }
}
</script>

{#if omniCtx.state.isCardOpen}
  <div
    class="flex-grow-1 pointer-events-none relative z-20 mx-auto flex h-full w-full max-w-[520px] p-0 pb-[68px] duration-300 w-112:my-4 w-112:h-auto w-112:px-4"
    style="transform: translateX({horizontalOffset}px);"
  >
    <!-- Shadow wrapper -->
    <div
      class="relative h-full w-full"
      style="box-shadow: 0 0 10px rgba(59, 130, 246, 0.2), 0 0 20px rgba(59, 130, 246, 0.1);"
    >
      <!-- Scroll container -->
      <div
        class="h-full w-full overflow-x-auto overflow-y-hidden"
        use:conditionalTouchScroll={{ threshold: 200 }}
      >
        <div
          id="feature-card"
          class="relative flex h-full max-h-[calc(100dvh-132px)] w-full flex-col overflow-x-visible rounded-none px-0 shadow-xl w-112:max-h-[calc(100dvh-162px)] w-112:rounded-lg"
          in:scale={{
            duration: 300,
            delay: 0,
            easing: cubicInOut,
            start: 1,
            opacity: 0.3
          }}
          out:scale={{ duration: 300, easing: cubicInOut, start: 1, opacity: 0.3 }}
          onoutrostart={handleOutroStart}
          onoutroend={handleOutroEnd}
          use:clickOutside={(e) => handleClickOutside(e)}
        >
          {@render children()}
        </div>
      </div>
    </div>
  </div>
{/if}

{#if omniCtx.pageState === PageState.Transitioning}
  <div
    class="fixed inset-x-[24px] z-50"
    in:fade={{ duration: 200 }}
    out:fade={{ duration: 200 }}
  >
    <div
      class="mx-auto w-fit translate-y-[42vh] rounded-full bg-black p-4 text-center text-2xl text-base-content"
    >
      <div class="flex items-center justify-center gap-2">
        <span class="loading loading-ring"></span>
      </div>
    </div>
  </div>
{/if}
