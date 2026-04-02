<script lang="ts">
// ENUMS
import { OmniCollection } from '$lib/enums'
// TYPES
import type { OmnibarEntryProps } from './omnibarPrimitives.types'

let { result, onSelection }: OmnibarEntryProps = $props()

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

<div
  class="flex shrink-0 cursor-pointer select-none items-center gap-2 px-4 py-2 pr-3 text-sm outline-none hover:bg-base-200 focus:bg-base-200"
  tabindex="0"
  role="option"
  onclick={handleClick}
  onkeydown={handleKeyDown}
>
  <div class="h-1.5 w-1.5 select-none rounded-full bg-base-content/60"></div>
  <span class="grow">{result.name}</span>
  {#if result.count > 0 && result.collectionType !== OmniCollection.feature}
    <span class="w-6 select-none text-center font-mono text-base-content/60">
      {result.count}
    </span>
  {/if}
</div>
