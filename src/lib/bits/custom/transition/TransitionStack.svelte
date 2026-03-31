<script lang="ts">
import { onDestroy } from 'svelte'
import { fade } from 'svelte/transition'
import type { Snippet } from 'svelte'

const persistedDisplayState = new Map<string, { key: string; value: unknown }>()

type TransitionStackProps = {
  valueKey: string | number | null | undefined
  value: unknown
  isReady?: boolean
  persistenceKey?: string | null
  duration?: number
  class?: string
  currentClass?: string
  previousClass?: string
  children?: Snippet<[any]>
  previous?: Snippet<[any]>
}

let {
  valueKey,
  value,
  isReady = true,
  persistenceKey = null,
  duration = 160,
  class: className = '',
  currentClass = '',
  previousClass = '',
  children,
  previous,
}: TransitionStackProps = $props()

let previousValue = $state<unknown | null>(null)
const initialPersistedState = persistenceKey
  ? (persistedDisplayState.get(persistenceKey) ?? null)
  : null

let displayValue = $state(initialPersistedState?.value ?? value)
let displayKey = $state(initialPersistedState?.key ?? String(valueKey ?? ''))
let cleanupTimer: ReturnType<typeof setTimeout> | undefined

const rootClass = $derived(
  ['bits-transition-stack', className].filter(Boolean).join(' '),
)
const currentLayerClass = $derived(
  [
    'bits-transition-stack__layer',
    'bits-transition-stack__layer--current',
    currentClass,
  ]
    .filter(Boolean)
    .join(' '),
)
const previousLayerClass = $derived(
  [
    'bits-transition-stack__layer',
    'bits-transition-stack__layer--previous',
    previousClass,
  ]
    .filter(Boolean)
    .join(' '),
)

function clearCleanupTimer(): void {
  if (!cleanupTimer) return
  clearTimeout(cleanupTimer)
  cleanupTimer = undefined
}

function persistDisplayState(nextKey: string, nextValue: unknown): void {
  if (!persistenceKey) return
  persistedDisplayState.set(persistenceKey, {
    key: nextKey,
    value: nextValue,
  })
}

$effect(() => {
  const nextKey = String(valueKey ?? '')

  if (!displayKey) {
    if (!isReady) return
    displayKey = nextKey
    displayValue = value
    persistDisplayState(displayKey, displayValue)
    return
  }

  if (!isReady) return

  if (nextKey === displayKey) {
    displayValue = value
    persistDisplayState(displayKey, displayValue)
    return
  }

  clearCleanupTimer()

  previousValue = displayValue
  displayKey = nextKey
  displayValue = value
  persistDisplayState(displayKey, displayValue)

  cleanupTimer = setTimeout(() => {
    previousValue = null
    cleanupTimer = undefined
  }, duration)
})

onDestroy(() => {
  clearCleanupTimer()
})
</script>

<div class={rootClass}>
  {#if previousValue !== null}
    <div class={previousLayerClass} out:fade={{ duration }}>
      {@render (previous ?? children)?.(previousValue)}
    </div>
  {/if}

  {#key displayKey}
    <div class={currentLayerClass} in:fade={{ duration }}>
      {@render children?.(displayValue)}
    </div>
  {/key}
</div>
