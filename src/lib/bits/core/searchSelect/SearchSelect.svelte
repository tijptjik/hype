<script lang="ts">
// SVELTE
import { tick, type Component } from 'svelte'
import { fade } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// BITS UI
import { Combobox } from 'bits-ui'
// ICONS
import Search from 'virtual:icons/lucide/search'
import X from 'virtual:icons/lucide/x'
import ResourceIcon from '#lib/bits/custom/resourceIcon/ResourceIcon.svelte'
import Check from 'virtual:icons/lucide/check'
let {
  label,
  items,
  value = '',
  disabled = false,
  resetOnSelect = false,
  clearOnOpen = false,
  plain = false,
  selectedDisplay = false,
  selectedToken = false,
  icon: Icon = Search,
  onCreate,
  createLabel = 'Create',
  onSelect,
  onSearch,
}: {
  label: string
  items: {
    value: string
    label: string
    keywords?: string
    imageFramed?: boolean
    imageFallbackSrcs?: string[]
    image?: string
    href?: string
  }[]
  value?: string
  disabled?: boolean
  resetOnSelect?: boolean
  clearOnOpen?: boolean
  plain?: boolean
  selectedDisplay?: boolean
  selectedToken?: boolean
  icon?: Component
  onCreate?: (name: string) => void
  createLabel?: string
  onSelect: (value: string) => void
  onSearch?: (query: string) => void
} = $props()
const selectedItem = $derived(items.find(item => item.value === value))
const createValue = $props.id()
let input = $state<HTMLInputElement | null>(null)
let selection = $state('')
let inputText = $state('')
let query = $state('')
let open = $state(false)
$effect(() => {
  selection = value
})
$effect(() => {
  if (!open && !resetOnSelect)
    inputText = items.find(item => item.value === value)?.label ?? ''
})
// Clear the editable label for both input-click and keyboard/trigger opening.
$effect(() => {
  if (open && clearOnOpen && !query) inputText = ''
})
$effect(() => {
  if (open && selectedToken) {
    // Reopening a selected token starts a fresh search, independent of its old query.
    if (value) {
      query = ''
      inputText = ''
    }
    void tick().then(() => input?.focus({ preventScroll: true }))
  }
})
// Bound rendered options while searching the complete taxonomy before slicing.
const matches = $derived(
  items
    .filter(item =>
      [item.label, item.value, item.keywords ?? ''].some(text =>
        text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      ),
    )
    .slice(0, 100),
)
const canCreate = $derived(Boolean(onCreate && query.trim() && matches.length === 0))
</script>
{#if selectedDisplay && value}
  <div
    in:fade={{ duration: prefersReducedMotion.current ? 0 : 140 }}
    class="group flex min-h-12 min-w-0 items-center gap-3 px-4 py-2"
  >
    {#if selectedItem?.href}
      <a
        href={selectedItem.href}
        class="hover:text-primary focus-visible:outline-primary flex min-w-0 flex-1 items-center gap-3 rounded-md"
      >
        <ResourceIcon
          src={selectedItem.image}
          fallbackSrcs={selectedItem.imageFallbackSrcs}
          framed={selectedItem.imageFramed}
          class={selectedItem.imageFramed ? 'size-12' : 'size-7'}
        />
        <span class="min-w-0 text-sm">{selectedItem.label}</span>
      </a>
    {:else}
      <ResourceIcon
        src={selectedItem?.image}
        fallbackSrcs={selectedItem?.imageFallbackSrcs}
        framed={selectedItem?.imageFramed}
        class={selectedItem?.imageFramed ? 'size-12' : 'size-7'}
      />
      <span class="min-w-0 flex-1 text-sm">{selectedItem?.label ?? value}</span>
    {/if}
    <button
      type="button"
      aria-label="Clear group"
      {disabled}
      class="text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100"
      onclick={() => {
        onSelect('')
        void tick().then(() => input?.focus({ preventScroll: true }))
      }}
    >
      <X class="size-4" />
    </button>
  </div>
{:else}
  <div in:fade={{ duration: prefersReducedMotion.current ? 0 : 140 }}>
    <Combobox.Root
      type="single"
      bind:value={selection}
      bind:open
      inputValue={inputText}
      {items}
      {disabled}
      onValueChange={value => {
        const create = value === createValue
        const name = query.trim()
        open = false
        query = ''
        if (create) onCreate?.(name)
        else onSelect(value)
        void tick().then(() => {
          if (resetOnSelect || create) {
            selection = ''
            inputText = ''
          }
          input?.focus({ preventScroll: true })
        })
      }}
      onOpenChange={open => {
        if (!open) query = ''
        else if (!query) onSearch?.('')
      }}
    >
      <div class="relative min-w-0">
        {#if selectedToken && value && !open}
          <button
            type="button"
            class="bits-form__select-trigger absolute inset-0 w-full pl-9! text-left"
            aria-label={`${label}: ${selectedItem?.label ?? value}`}
            {disabled}
            onclick={() => {
              open = true
            }}
          >
            <span class="bg-muted rounded px-2 py-0.5 text-sm"
              >{selectedItem?.label ?? value}</span
            >
          </button>
        {/if}
        <Combobox.Input
          bind:ref={input}
          clearOnDeselect={resetOnSelect}
          aria-label={label}
          placeholder={label}
          class={`bits-form__select-trigger w-full pl-9! ${plain ? 'bg-transparent!' : ''} ${selectedToken && value && !open ? 'invisible' : ''}`}
          onclick={() => {
            if (!disabled) open = true
          }}
          oninput={event => {
            query = event.currentTarget.value
            open = true
            onSearch?.(query)
          }}
        />
        <Combobox.Trigger
          aria-label={`Open ${label}`}
          class="text-muted-foreground absolute inset-y-0 left-0 px-3"
          ><Icon class="size-4" /></Combobox.Trigger
        >
      </div>
      <Combobox.Portal>
        <Combobox.Content
          class={`bits-form__select-content z-[100] ${selectedToken ? 'w-80 max-w-[calc(100vw-2rem)] min-w-80' : 'w-[var(--bits-combobox-anchor-width)]'}`}
          sideOffset={4}
        >
          <Combobox.Viewport class="bits-form__select-viewport max-h-64">
            {#each matches as item (item.value)}
              <Combobox.Item
                value={item.value}
                label={item.label}
                class="bits-form__select-item flex h-auto! min-h-10 items-center justify-between gap-3 py-2"
              >
                <span
                  class="flex min-w-0 items-center gap-3 break-words whitespace-normal"
                >
                  {#if selectedDisplay}
                    <ResourceIcon
                      src={item.image}
                      fallbackSrcs={item.imageFallbackSrcs}
                      class="size-6"
                    />
                  {/if}
                  {item.label}
                </span>
                {#if value === item.value}
                  <Check class="size-4" />
                {/if}
              </Combobox.Item>
            {:else}
              {#if !canCreate}
                <p class="text-muted-foreground px-3 py-2 text-sm">No matches</p>
              {/if}
            {/each}
            {#if canCreate}
              <Combobox.Item
                value={createValue}
                label={`${createLabel} “${query.trim()}”`}
                class="bits-form__select-item border-border border-t"
              >
                {createLabel}
                “{query.trim()}”
              </Combobox.Item>
            {/if}
          </Combobox.Viewport>
        </Combobox.Content>
      </Combobox.Portal>
    </Combobox.Root>
  </div>
{/if}
