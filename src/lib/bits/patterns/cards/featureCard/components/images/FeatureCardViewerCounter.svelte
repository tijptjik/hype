<script lang="ts">
import { onDestroy } from 'svelte'

const COUNTER_SETTLE_MS = 420

let {
  currentIndex,
  loadedIndex,
  totalCount,
}: {
  currentIndex: number
  loadedIndex: number
  totalCount: number
} = $props()

let settledNumber = $state(1)
let reelNumbers = $state<number[]>([1])
let phase = $state<'idle' | 'spinning' | 'settling'>('idle')
let settleTimer: ReturnType<typeof setTimeout> | null = null

const currentNumber = $derived(currentIndex >= 0 ? currentIndex + 1 : 0)
const displayedNumber = $derived(loadedIndex >= 0 ? loadedIndex + 1 : currentNumber)
const translatePercent = $derived(phase === 'settling' ? -75 : 0)

function clearSettleTimer(): void {
  if (!settleTimer) return

  clearTimeout(settleTimer)
  settleTimer = null
}

$effect(() => {
  if (totalCount <= 1 || currentNumber === 0) {
    clearSettleTimer()
    settledNumber = Math.max(currentNumber, displayedNumber, 1)
    reelNumbers = [settledNumber]
    phase = 'idle'
    return
  }

  if (currentNumber !== displayedNumber) {
    clearSettleTimer()
    reelNumbers = [settledNumber, settledNumber, settledNumber, currentNumber]
    phase = 'spinning'
    return
  }

  if (currentNumber !== settledNumber) {
    clearSettleTimer()
    reelNumbers = [settledNumber, settledNumber, settledNumber, currentNumber]
    phase = 'settling'
    settleTimer = setTimeout(() => {
      settledNumber = currentNumber
      reelNumbers = [currentNumber]
      phase = 'idle'
      settleTimer = null
    }, COUNTER_SETTLE_MS)
    return
  }

  clearSettleTimer()
  reelNumbers = [settledNumber]
  phase = 'idle'
})

onDestroy(() => {
  clearSettleTimer()
})
</script>

{#if totalCount > 1}
  <div
    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-black/55 px-3 py-1.5 font-mono text-xs text-white/92 backdrop-blur-sm"
  >
    <div class="relative h-4 overflow-hidden tabular-nums" aria-live="polite">
      <div
        class={`flex flex-col ${phase === 'spinning' ? 'animate-[feature-card-viewer-counter-spin_0.55s_linear_infinite]' : ''} ${phase === 'settling' ? 'transition-transform duration-[420ms] ease-[cubic-bezier(0.2,0.84,0.2,1)]' : ''}`}
        style={`transform: translateY(${translatePercent}%);`}
      >
        {#each reelNumbers as number, index (`${number}-${index}-${phase}`)}
          <span class="flex h-4 items-center">{number}</span>
        {/each}
      </div>
    </div>
    <span class="text-white/55">/</span>
    <span class="tabular-nums text-white/88">{totalCount}</span>
  </div>
{/if}

<style>
@keyframes feature-card-viewer-counter-spin {
  from {
    transform: translateY(0%);
  }

  to {
    transform: translateY(-75%);
  }
}
</style>
