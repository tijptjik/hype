<script lang="ts">
// BITS-UI
import { DropdownMenu } from 'bits-ui'
// BITS
import { cx } from '$lib/bits/utils'
// TYPES
import type { DropdownProps } from './dropdown.types'

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
}: DropdownProps = $props()

const resolvedTriggerClass = $derived(
  cx(
    'inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/78 transition hover:bg-white/[0.06] hover:text-white',
    triggerClass,
  ),
)

const resolvedTriggerIconClass = $derived(cx('h-5 w-5', triggerIconClass))
const resolvedContentClass = $derived(
  cx(
    'z-[1200] min-w-[12rem] rounded-2xl border border-white/10 bg-neutral-950/98 p-2 text-white shadow-2xl backdrop-blur-xl',
    contentClass,
  ),
)
const resolvedItemClass = $derived(
  cx(
    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/82 outline-none transition hover:bg-white/[0.06] hover:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-35',
    itemClass,
  ),
)
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger class={resolvedTriggerClass} aria-label={ariaLabel}>
    {#if TriggerIcon}
      <TriggerIcon class={resolvedTriggerIconClass} />
    {/if}
  </DropdownMenu.Trigger>

  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class={resolvedContentClass}
      side={contentSide}
      sideOffset={contentSideOffset}
      align={contentAlign}
    >
      {#each items as item, index (`${item.label}-${index}`)}
        <DropdownMenu.Item
          class={cx(resolvedItemClass, item.class)}
          disabled={item.disabled}
          onSelect={() => item.onSelect?.()}
        >
          {#if item.icon}
            <item.icon class={cx('h-4 w-4 shrink-0', item.iconClass)} />
          {/if}
          <span>{item.label}</span>
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
