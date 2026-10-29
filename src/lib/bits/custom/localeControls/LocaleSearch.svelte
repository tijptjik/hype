<!-- biome-ignore-all lint/a11y/noNoninteractiveElementToInteractiveRole: The listbox exposes options with both combobox arrow navigation and sequential keyboard focus. -->
<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
import { languageFont } from './localeFont.js'
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
const results = $derived(
  searchLocaleOptions(options, query).filter(
    option => !selectedLocales.includes(option.tag),
  ),
)
const activeIndex = $derived(Math.min(active, results.length - 1))
onMount(() => input.focus({ preventScroll: true }))

/** Arrow keys preview results; Tab advances past the highlighted result into the list. */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault()
    // The popover must not process the same Tab again after focus moves to its last control.
    event.stopPropagation()
    if (!results.length) onClose()
    else document.getElementById(`${id}-${(activeIndex + 1) % results.length}`)?.focus()
    return
  }
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
  class="w-full min-w-0 rounded-xl border border-border/20 bg-panel p-3 text-foreground shadow-xl"
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
      class="min-h-11 min-w-0 flex-1 rounded-md border border-border/30 bg-foreground/3 px-3 text-sm text-foreground! focus-visible:outline-1 focus-visible:outline-primary/30"
    >
    <button
      type="button"
      tabindex="-1"
      aria-label={labels.close}
      onclick={onClose}
      class="size-11 shrink-0 text-foreground! rounded-md hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-primary"
    >
      ×
    </button>
  </div>
  <ul
    id={`${id}-results`}
    role="listbox"
    tabindex="-1"
    aria-label={labels.search}
    class="mt-2 max-h-64 overflow-y-auto overscroll-contain"
  >
    {#each results as option, index (option.tag)}
      <li role="presentation">
        <button
          type="button"
          id={`${id}-${index}`}
          role="option"
          aria-selected={index === activeIndex}
          onfocus={() => (active = index)}
          onpointerdown={event => event.preventDefault()}
          onclick={() => onSelect(option.tag)}
          class={`grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground! transition-colors outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/30 hover:bg-primary/8 ${index === activeIndex ? 'bg-primary/10 ring-1 ring-inset ring-primary/25' : ''}`}
        >
          <span class="min-w-0 whitespace-normal break-words"
            ><span
              lang={option.tag}
              dir="auto"
              style:font-family={languageFont(option.tag)}
              class="font-semibold text-foreground!"
              >{option.autonym}</span
            ><span class="block text-muted-foreground">{option.name}</span></span
          >
          <span class="text-right text-xs text-muted-foreground">{option.tag} </span>
        </button>
      </li>
    {/each}
  </ul>
  {#if results.length === 0}
    <p role="status" class="p-3 text-sm text-muted-foreground">{labels.noResults}</p>
  {/if}
</div>
