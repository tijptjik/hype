<!-- biome-ignore-all lint/a11y/noNoninteractiveElementToInteractiveRole: ARIA combobox listbox/options use aria-activedescendant with DOM focus in the input. -->
<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// LOCAL
import { searchLocaleOptions } from './localeControls.js'
// TYPES
import type { LocaleControlLabels, LocaleOption } from './localeControls.types.js'

let {
  options,
  selectedLocales,
  labels,
  onSelect,
  onClose,
}: {
  options: readonly LocaleOption[]
  selectedLocales: readonly string[]
  labels: LocaleControlLabels
  onSelect: (tag: string) => void
  onClose: () => void
} = $props()
const id = $props.id()
let query = $state('')
let active = $state(0)
let input: HTMLInputElement
const results = $derived(searchLocaleOptions(options, query))
const activeIndex = $derived(Math.min(active, results.length - 1))
onMount(() => input.focus())

/** Keep keyboard focus in the combobox while navigating its results. */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    onClose()
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    active = results.length
      ? (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) %
        results.length
      : 0
    document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: 'nearest' })
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const result = results[activeIndex]
    if (result) onSelect(result.tag)
  }
}
</script>

<div
  class="mt-2 w-full min-w-0 rounded-xl border border-border bg-background p-3 shadow-sm"
>
  <div class="flex min-w-0 items-center gap-2">
    <input
      bind:this={input}
      role="combobox"
      aria-label={labels.search}
      aria-expanded="true"
      aria-controls={`${id}-results`}
      aria-autocomplete="list"
      aria-activedescendant={activeIndex >= 0 ? `${id}-${activeIndex}` : undefined}
      value={query}
      oninput={event => {
        query = event.currentTarget.value
        active = 0
      }}
      onkeydown={onKeydown}
      placeholder={labels.search}
      class="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-transparent px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
    >
    <button
      type="button"
      aria-label={labels.close}
      onclick={onClose}
      class="size-11 shrink-0 rounded-md hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-primary"
    >
      ×
    </button>
  </div>
  <ul
    id={`${id}-results`}
    role="listbox"
    aria-label={labels.search}
    class="mt-2 max-h-64 overflow-y-auto overscroll-contain"
  >
    {#each results as option, index (option.tag)}
      <!-- biome-ignore lint/a11y/useFocusableInteractive: The combobox input owns focus and targets this option with aria-activedescendant. -->
      <li id={`${id}-${index}`} role="option" aria-selected={index === activeIndex}>
        <button
          type="button"
          tabindex="-1"
          onpointerdown={event => event.preventDefault()}
          onclick={() => onSelect(option.tag)}
          class={`grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/10 ${index === activeIndex ? 'bg-foreground/5' : ''}`}
        >
          <span class="min-w-0 whitespace-normal break-words"
            ><span lang={option.tag} class="font-semibold">{option.autonym}</span
            ><span class="block text-muted-foreground">{option.name}</span></span
          >
          <span class="text-right text-xs text-muted-foreground"
            >{option.tag}
            {#if selectedLocales.includes(option.tag)}
              <span class="block">{labels.selected}</span>
            {/if}</span
          >
        </button>
      </li>
    {/each}
  </ul>
  {#if results.length === 0}
    <p role="status" class="p-3 text-sm text-muted-foreground">{labels.noResults}</p>
  {/if}
</div>
