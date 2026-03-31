<script lang="ts">
import { onDestroy, tick } from 'svelte'
import type { Snippet } from 'svelte'

type CrossfadeItem = {
  id: number
  key: string
  value: unknown
  isCurrent: boolean
}

type CrossfadeValueProps = {
  valueKey: string | number | null | undefined
  value: unknown
  duration?: number
  layout?: 'inline' | 'block'
  tag?: keyof HTMLElementTagNameMap
  contentTag?: keyof HTMLElementTagNameMap
  class?: string
  contentClass?: string
  children?: Snippet<[any]>
}

let {
  valueKey,
  value,
  duration = 240,
  layout = 'inline',
  tag = 'span',
  contentTag = 'span',
  class: className = '',
  contentClass = '',
  children,
}: CrossfadeValueProps = $props()

let nextItemId = 0
let cleanupTimer: ReturnType<typeof setTimeout> | undefined
let frameId: number | undefined
let previousKey = String(valueKey ?? '')
let currentSnapshot: CrossfadeItem = {
  id: ++nextItemId,
  key: previousKey,
  value,
  isCurrent: true,
}
let currentItem = $state(currentSnapshot)
let previousItem = $state<CrossfadeItem | null>(null)
let isTransitionActive = $state(false)

const rootClass = $derived(
  [
    'bits-crossfade-value',
    `bits-crossfade-value--${layout}`,
    previousItem ? 'bits-crossfade-value--transitioning' : '',
    previousItem && isTransitionActive ? 'bits-crossfade-value--transition-active' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)
const itemClass = $derived(
  ['bits-crossfade-value__item', contentClass].filter(Boolean).join(' '),
)

function clearCleanupTimer(): void {
  if (!cleanupTimer) return
  clearTimeout(cleanupTimer)
  cleanupTimer = undefined
}

function clearFrame(): void {
  if (frameId === undefined) return
  cancelAnimationFrame(frameId)
  frameId = undefined
}

$effect(() => {
  const nextKey = String(valueKey ?? '')
  if (nextKey === previousKey) {
    currentSnapshot = {
      ...currentSnapshot,
      value,
    }
    currentItem = currentSnapshot
    return
  }

  clearCleanupTimer()
  clearFrame()

  previousItem = {
    ...currentSnapshot,
    isCurrent: false,
  }
  currentSnapshot = {
    id: ++nextItemId,
    key: nextKey,
    value,
    isCurrent: true,
  }
  currentItem = currentSnapshot
  previousKey = nextKey
  isTransitionActive = false

  void tick().then(() => {
    frameId = requestAnimationFrame(() => {
      frameId = undefined
      isTransitionActive = true
    })
  })

  cleanupTimer = setTimeout(() => {
    previousItem = null
    isTransitionActive = false
    cleanupTimer = undefined
  }, duration)
})

onDestroy(() => {
  clearCleanupTimer()
  clearFrame()
})
</script>

<svelte:element
  this={tag}
  class={rootClass}
  style={`--bits-crossfade-duration:${duration}ms`}
>
  {#if previousItem}
    <svelte:element
      this={contentTag}
      class={itemClass}
      class:bits-crossfade-value__item--previous={true}
      aria-hidden="true"
    >
      {@render children?.(previousItem.value)}
    </svelte:element>
  {/if}

  <svelte:element
    this={contentTag}
    class={itemClass}
    class:bits-crossfade-value__item--current={true}
    aria-hidden="false"
  >
    {@render children?.(currentItem.value)}
  </svelte:element>
</svelte:element>
