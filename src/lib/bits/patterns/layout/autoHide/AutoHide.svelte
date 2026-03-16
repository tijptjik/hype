<script lang="ts">
import { onDestroy, onMount } from 'svelte'
import type { AutoHideProps } from './autoHide.types'

let {
  children,
  enabled = false,
  isOpen = false,
  onOpenVisual,
  onCloseVisual,
  enterDelay = 750,
  leaveDelay = 250,
  edgeThreshold = 15,
}: AutoHideProps = $props()

let isHovering = $state(false)
let autoHideTimeout = $state<ReturnType<typeof setTimeout> | null>(null)
let autoHideEnterTimeout = $state<ReturnType<typeof setTimeout> | null>(null)
let elementRef = $state<HTMLElement | null>(null)
let isWindowFocused = $state(true)
let lastMousePosition = $state({ x: 0, y: 0 })

function clearHideTimeout(): void {
  if (autoHideTimeout) {
    clearTimeout(autoHideTimeout)
    autoHideTimeout = null
  }
}

function clearEnterTimeout(): void {
  if (autoHideEnterTimeout) {
    clearTimeout(autoHideEnterTimeout)
    autoHideEnterTimeout = null
  }
}

function handleGlobalMouseMove(event: MouseEvent): void {
  lastMousePosition = { x: event.clientX, y: event.clientY }
}

function handleDocumentMouseLeave(): void {
  lastMousePosition = { x: -9999, y: -9999 }
}

function isMouseWithinElementBounds(): boolean {
  if (!elementRef) {
    return false
  }

  const rect = elementRef.getBoundingClientRect()
  const { x, y } = lastMousePosition

  return (
    isWindowFocused &&
    x >= rect.left &&
    x <= rect.right &&
    y >= rect.top &&
    y <= rect.bottom
  )
}

function openIfHoverStillValid(initialX?: number): void {
  if (!enabled || isOpen || !isMouseWithinElementBounds()) {
    return
  }

  if (typeof initialX === 'number' && initialX < edgeThreshold) {
    const currentX = lastMousePosition.x

    if (currentX === initialX) {
      window.setTimeout(() => {
        if (lastMousePosition.x !== currentX) {
          onOpenVisual?.()
          isHovering = true
        }
      }, 50)
      return
    }
  }

  onOpenVisual?.()
  isHovering = true
}

$effect(() => {
  const handleWindowFocus = () => {
    isWindowFocused = true
  }

  const handleWindowBlur = () => {
    isWindowFocused = false
  }

  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('blur', handleWindowBlur)

  return () => {
    window.removeEventListener('focus', handleWindowFocus)
    window.removeEventListener('blur', handleWindowBlur)
  }
})

function handleMouseEnter(): void {
  clearEnterTimeout()

  if (!enabled || isOpen) {
    return
  }

  autoHideEnterTimeout = setTimeout(() => {
    if (!isMouseWithinElementBounds()) {
      return
    }

    const initialX = lastMousePosition.x

    if (initialX < edgeThreshold) {
      window.setTimeout(() => openIfHoverStillValid(initialX), 50)
      return
    }

    onOpenVisual?.()
    isHovering = true
  }, enterDelay)

  clearHideTimeout()
}

function handleMouseLeave(): void {
  clearEnterTimeout()

  if (!enabled || !isHovering || isOpen) {
    return
  }

  autoHideTimeout = setTimeout(() => {
    onCloseVisual?.()
    isHovering = false
    autoHideTimeout = null
  }, leaveDelay)
}

onMount(() => {
  document.addEventListener('mousemove', handleGlobalMouseMove)
  document.addEventListener('mouseleave', handleDocumentMouseLeave)
})

onDestroy(() => {
  document.removeEventListener('mousemove', handleGlobalMouseMove)
  document.removeEventListener('mouseleave', handleDocumentMouseLeave)
  clearEnterTimeout()
  clearHideTimeout()
})
</script>

<div
  bind:this={elementRef}
  class="bits-layout-autohide"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  {@render children()}
</div>
