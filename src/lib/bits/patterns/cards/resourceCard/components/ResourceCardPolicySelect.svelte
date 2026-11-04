<script lang="ts">
// SVELTE
import type { Component } from 'svelte'
// COMPONENTS
import Select from '#lib/bits/core/select/Select.svelte'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// ICONS
import InfoIcon from 'virtual:icons/lucide/info'

let {
  value,
  label,
  items,
  note,
  showInfo = true,
  isEditing,
  disabled,
  onChange,
  class: className = '',
}: {
  value: string
  label: string
  items: Array<{
    value: string
    label: string
    description: string
    icon: Component<{ class?: string }>
  }>
  note?: string
  showInfo?: boolean
  isEditing: boolean
  disabled: boolean
  onChange: (value: string) => void
  class?: string
} = $props()
const selected = $derived(items.find(item => item.value === value) ?? items[0])
</script>

<div
  class={`bits-theme text-foreground flex max-w-full min-w-0 items-center gap-1 ${className}`}
>
  <div class="relative max-w-full min-w-0">
    <span
      class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
      aria-hidden="true"
    >
      <selected.icon class="size-4" />
    </span>
    <Select
      {value}
      {items}
      {isEditing}
      {disabled}
      allowDeselect={false}
      variant="ghost"
      placeholder={label}
      triggerAttrs={{ 'aria-label': label }}
      triggerClass="h-auto min-h-10 w-auto max-w-full gap-2 rounded-lg py-2 pl-8 pr-3 hover:bg-primary/10 [&>span]:whitespace-normal! [&>span]:overflow-visible! [&>span]:break-words! [&>span]:text-left!"
      displayClass="h-auto! min-h-10 border-0! bg-transparent! shadow-none! [&>div]:pl-8! [&>div]:pr-3! [&_span]:whitespace-normal! [&_span]:overflow-visible! [&_span]:break-words!"
      contentClass="z-[240]!"
      onValueChange={onChange}
    />
  </div>
  {#if showInfo}
    <SimpleTooltip
      triggerProps={{ 'aria-label': `About ${label.toLowerCase()}`, role: 'button' }}
    >
      {#snippet trigger()}
        <span
          class="text-muted-foreground inline-flex size-8 shrink-0 items-center justify-center"
        >
          <InfoIcon class="size-4" aria-hidden="true" />
        </span>
      {/snippet}
      <p class="mb-3 font-semibold">{label}</p>
      <ul class="space-y-3">
        {#each items as item (item.value)}
          <li>
            <strong class="font-semibold">{item.label}</strong>
            <p>{item.description}</p>
          </li>
        {/each}
      </ul>
      {#if note}
        <p class="mt-3">{note}</p>
      {/if}
    </SimpleTooltip>
  {/if}
</div>
