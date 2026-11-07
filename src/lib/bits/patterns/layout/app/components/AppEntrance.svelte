<script lang="ts">
// SVELTE
import { onMount, untrack, type Snippet } from 'svelte'
import { prefersReducedMotion } from 'svelte/motion'
// COMPONENTS
import AppSurface from './AppSurface.svelte'
// STYLES
import '#lib/styles/app-entrance.css'

let {
  children,
  ready = false,
  enabled = true,
  onComplete,
}: {
  children: Snippet
  ready?: boolean
  enabled?: boolean
  onComplete?: () => void
} = $props()

// Capture the layout's lifetime decision once; completing this instance must not restart it.
let phase = $state<'waiting' | 'entering' | 'complete'>(
  untrack(() => (enabled ? 'waiting' : 'complete')),
)
let reportedCompletion = false
let fallbackTimer: ReturnType<typeof setTimeout> | undefined
let completionTimer: ReturnType<typeof setTimeout> | undefined

/** Releases pending work when the entrance finishes or its surface unmounts. @returns Nothing. */
function clearTimers(): void {
  clearTimeout(fallbackTimer)
  clearTimeout(completionTimer)
}

/** Starts once, immediately after the map begins fading in. @returns Nothing. */
function startIntro(): void {
  if (phase !== 'waiting') return
  clearTimers()
  phase = prefersReducedMotion.current ? 'complete' : 'entering'
  if (phase === 'entering') {
    // Release animation styles after the 220 ms stagger and 340 ms UI entrance.
    completionTimer = setTimeout(() => {
      phase = 'complete'
    }, 660)
  }
}

onMount(() => {
  // A slow stylesheet or unavailable WebGL must never strand the search/navigation.
  if (prefersReducedMotion.current) phase = 'complete'
  else if (phase === 'waiting') fallbackTimer = setTimeout(startIntro, 1200)
  return clearTimers
})

$effect(() => {
  if (prefersReducedMotion.current) {
    clearTimers()
    phase = 'complete'
  }
})

$effect(() => {
  if (ready) startIntro()
})

$effect(() => {
  if (phase === 'complete' && !reportedCompletion) {
    reportedCompletion = true
    onComplete?.()
  }
})
</script>

<AppSurface intro={phase}> {@render children()} </AppSurface>
