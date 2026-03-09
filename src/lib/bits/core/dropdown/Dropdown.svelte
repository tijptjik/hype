<script lang="ts">
import { DropdownMenu } from 'bits-ui'
import type { Component } from 'svelte'

type DropdownItem = {
  label: string
  onSelect?: () => void
  icon?: Component | null
  class?: string
  iconClass?: string
}

let {
  ariaLabel,
  triggerClass = '',
  triggerIcon: TriggerIcon = null,
  triggerIconClass = '',
  contentClass = '',
  contentSide = 'bottom',
  contentSideOffset = 8,
  contentAlign = 'center',
  itemClass = '',
  items = [],
}: {
  ariaLabel: string
  triggerClass?: string
  triggerIcon?: Component | null
  triggerIconClass?: string
  contentClass?: string
  contentSide?: 'top' | 'right' | 'bottom' | 'left'
  contentSideOffset?: number
  contentAlign?: 'start' | 'center' | 'end'
  itemClass?: string
  items?: DropdownItem[]
} = $props()
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger class={triggerClass} aria-label={ariaLabel}>
    {#if TriggerIcon}
      <TriggerIcon class={triggerIconClass} />
    {/if}
  </DropdownMenu.Trigger>

  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class={contentClass}
      side={contentSide}
      sideOffset={contentSideOffset}
      align={contentAlign}
    >
      {#each items as item, index (`${item.label}-${index}`)}
        <DropdownMenu.Item
          class={[itemClass, item.class].filter(Boolean).join(' ')}
          onSelect={() => item.onSelect?.()}
        >
          {#if item.icon}
            <item.icon class={item.iconClass} />
          {/if}
          <span>{item.label}</span>
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
