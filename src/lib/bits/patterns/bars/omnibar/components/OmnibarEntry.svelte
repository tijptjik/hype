<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// ICONS
import Funnel from 'virtual:icons/proicons/filter'
import Target from 'virtual:icons/proicons/target'
// ENUMS
import { OmniCollection } from '#lib/enums.js'
// TYPES
import type { OmnibarEntryProps } from './omnibarPrimitives.types'

let { result, onSelection, onPreview }: OmnibarEntryProps = $props()

onDestroy(() => onPreview?.(result.ref, false))

function selectResult(): void {
  onSelection?.(result.ref)
}

function handleClick(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
  selectResult()
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return

  event.preventDefault()
  event.stopPropagation()
  selectResult()
}
</script>

<div class="hover:bg-base-200 flex shrink-0 items-center gap-1 pr-2 pl-3">
  <button
    type="button"
    class="focus-visible:text-primary grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 py-2 pl-1 text-left text-sm outline-none"
    aria-pressed={result.enabled}
    onclick={handleClick}
    onpointerenter={() => onPreview?.(result.ref, true)}
    onpointerleave={() => onPreview?.(result.ref, false)}
    onfocus={() => onPreview?.(result.ref, true)}
    onblur={() => onPreview?.(result.ref, false)}
    onkeydown={handleKeyDown}
  >
    <span
      class="h-1.5 w-1.5 rounded-full {result.enabled
        ? 'bg-primary'
        : 'bg-base-content/60'}"
    ></span>
    <span class="min-w-0 break-words whitespace-normal">{result.name}</span>
    {#if result.count > 0 && result.collectionType !== OmniCollection.feature}
      <span class="text-base-content/60 w-8 text-center font-mono select-none">
        {result.count}
      </span>
    {/if}
  </button>
  {#if result.control}
    <button
      type="button"
      class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg outline-none hover:bg-raised focus-visible:text-primary {result
        .control.pressed
        ? 'text-primary'
        : 'text-base-content/60'}"
      aria-label={result.control.label}
      aria-pressed={result.control.pressed}
      onclick={event => {
        event.stopPropagation()
        result.control?.onClick()
      }}
    >
      {#if result.control.kind === 'target'}
        <Target class="size-5" />
      {:else}
        <Funnel class="size-5" />
      {/if}
    </button>
  {/if}
</div>
