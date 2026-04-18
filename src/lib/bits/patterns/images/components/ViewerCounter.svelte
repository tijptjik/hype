<script lang="ts">
import { onDestroy } from 'svelte'

const COUNTER_SETTLE_MS = 180

let {
  requestedIndex,
  loadedIndex,
  pendingIndex,
  totalCount,
  showTotalCount = true,
}: {
  requestedIndex: number
  loadedIndex: number
  pendingIndex: number
  totalCount: number
  showTotalCount?: boolean
} = $props()

let settledNumber = $state(1)
let transitionNumbers = $state<number[]>([1])
let phase = $state<'idle' | 'settling'>('idle')
let translateRem = $state(0)
let settleTimer: ReturnType<typeof setTimeout> | null = null
let motionFrame: number | null = null

const requestedNumber = $derived(requestedIndex >= 0 ? requestedIndex + 1 : 0)
const loadedNumber = $derived(loadedIndex >= 0 ? loadedIndex + 1 : 0)
const isPending = $derived(
  pendingIndex >= 0 && requestedNumber !== 0 && requestedNumber !== loadedNumber,
)

function clearSettleTimer(): void {
  if (!settleTimer) return

  clearTimeout(settleTimer)
  settleTimer = null
}

function clearMotionFrame(): void {
  if (motionFrame === null) return

  cancelAnimationFrame(motionFrame)
  motionFrame = null
}

function resetCounter(number: number): void {
  clearSettleTimer()
  clearMotionFrame()
  settledNumber = number
  transitionNumbers = [number]
  translateRem = 0
  phase = 'idle'
}

function startSettle(nextNumber: number): void {
  clearSettleTimer()
  clearMotionFrame()

  if (settledNumber === nextNumber) {
    resetCounter(nextNumber)
    return
  }

  transitionNumbers = [settledNumber, nextNumber]
  translateRem = 0
  phase = 'settling'

  motionFrame = requestAnimationFrame(() => {
    translateRem = -1
    motionFrame = null
  })

  settleTimer = setTimeout(() => {
    resetCounter(nextNumber)
  }, COUNTER_SETTLE_MS)
}

$effect(() => {
  if (totalCount <= 1 || (requestedNumber === 0 && loadedNumber === 0)) {
    resetCounter(Math.max(requestedNumber, loadedNumber, 1))
    return
  }

  if (loadedNumber !== 0 && loadedNumber !== settledNumber) {
    startSettle(loadedNumber)
    return
  }

  if (phase !== 'settling' && transitionNumbers.length !== 1) {
    resetCounter(settledNumber)
  }
})

onDestroy(() => {
  clearSettleTimer()
  clearMotionFrame()
})
</script>

{#if totalCount > 1}
  <div
    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-black/55 px-3 py-1.5 font-mono text-xs leading-none text-white/92 backdrop-blur-sm"
  >
    <div
      class="relative h-[1rem] w-[0.9rem] overflow-hidden tabular-nums"
      aria-live="polite"
    >
      <div
        class={phase === 'settling'
          ? 'flex flex-col transition-transform duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]'
          : 'flex flex-col'}
        style={`transform: translateY(${translateRem}rem);`}
      >
        {#each transitionNumbers as number, index (`${number}-${index}-${phase}`)}
          <span
            class={`flex h-[1rem] shrink-0 items-center justify-center ${isPending && index === 0 && phase === 'idle' ? 'animate-[feature-card-viewer-counter-pulse_900ms_ease-in-out_infinite]' : ''}`}
          >
            {number}
          </span>
        {/each}
      </div>
    </div>
    {#if showTotalCount}
      <span class="flex h-[1rem] items-center text-white/55">/</span>
      <span class="flex h-[1rem] items-center tabular-nums text-white/88"
        >{totalCount}</span
      >
    {/if}
  </div>
{/if}

<style>
@keyframes -global-feature-card-viewer-counter-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.72;
  }
}
</style>
