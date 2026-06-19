<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
// COMPONENTS
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import MagnifyingGlass from 'virtual:icons/lucide/search'
// TYPES
import type { ImportSearchBoxItem, ImportSearchBoxProps } from './importSearch.types'

let {
  id,
  value = '',
  results = [],
  label,
  ariaLabel,
  placeholder,
  size = 'md',
  dropdown = 'inline',
  searchFor,
  inputClass = '',
  tone = 'primary',
  onInput,
  onFocus,
  onSelect,
  onInputKeydown,
  onResultKeydown,
}: ImportSearchBoxProps = $props()

const inputRootClass = $derived(
  cx('input input-bordered w-full pr-10', size === 'sm' ? 'input-sm' : '', inputClass),
)
const iconClass = $derived(size === 'sm' ? 'h-4 w-4' : 'h-5 w-5')
const avatarClass = $derived(size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm')
const titleClass = $derived(size === 'sm' ? 'text-sm font-medium' : 'font-medium')
const subtitleClass = $derived(size === 'sm' ? 'text-xs' : 'text-sm')
const fallbackClass = $derived(
  tone === 'success'
    ? 'bg-success text-success-content'
    : 'bg-primary text-primary-content',
)
const resultsClass = $derived(
  cx(
    'max-h-60 overflow-y-auto rounded-lg border border-base-content/20 bg-base-100',
    dropdown === 'floating'
      ? 'absolute left-0 top-full z-50 mt-3 w-full shadow-lg'
      : 'space-y-1',
  ),
)

function handleInput(event: Event): void {
  const target = event.currentTarget as HTMLInputElement
  void onInput?.(target.value, event)
}

function handleSelect(item: ImportSearchBoxItem, event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  onSelect(item, event)
}
</script>

<div class="space-y-2">
  {#if label}
    <div class="label">
      <span class="label-text">{label}</span>
    </div>
  {/if}

  <div class="relative">
    <input
      {id}
      type="text"
      {placeholder}
      aria-label={ariaLabel}
      class={inputRootClass}
      {value}
      data-search-for={searchFor}
      data-layer-search-for={searchFor}
      tabindex="0"
      oninput={handleInput}
      onfocus={onFocus}
      onkeydown={onInputKeydown}
    >
    <div class="pointer-events-none absolute inset-y-0 right-2 flex items-center pr-3">
      <Icon src={MagnifyingGlass} class={cx(iconClass, 'text-base-content/50')} />
    </div>

    {#if results.length > 0}
      <div class={resultsClass}>
        {#each results as item, index (item.id)}
          <button
            type="button"
            class="flex w-full items-center gap-3 p-3 text-left transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-base-200 focus:bg-base-200 focus:outline-none"
            data-invalid-value={searchFor}
            data-result-index={index}
            tabindex="0"
            onclick={event => handleSelect(item, event)}
            onkeydown={event => onResultKeydown?.(event, item, index)}
          >
            {#if item.image}
              <img
                src={item.image}
                alt={item.title}
                class={cx(avatarClass, 'shrink-0 rounded-full object-cover')}
              >
            {:else}
              <div
                class={cx(
                  'flex shrink-0 items-center justify-center rounded-full font-medium',
                  avatarClass,
                  fallbackClass,
                )}
              >
                {item.fallback ?? item.title.charAt(0).toUpperCase() ?? '?'}
              </div>
            {/if}
            <div class="min-w-0 flex-1">
              <div class={titleClass}>{item.title}</div>
              {#if item.subtitle}
                <div class={cx(subtitleClass, 'text-base-content/70')}>
                  {item.subtitle}
                </div>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
