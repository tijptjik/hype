<script lang="ts">
// BITS-UI
import { ContextMenu } from 'bits-ui'
// BITS
import { cx } from '#lib/bits/utils.js'
// TYPES
import type { ContextMenuProps } from './contextMenu.types.js'

let { children, items, class: className = '' }: ContextMenuProps = $props()

/** Open the same menu from a focused child with the standard context-menu keys. */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return
  event.preventDefault()
  const trigger = event.currentTarget as HTMLElement
  const rect = (event.target as HTMLElement).getBoundingClientRect()
  trigger.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }),
  )
}
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger class={cx('block min-w-0', className)} onkeydown={onKeydown}
    >{@render children()}</ContextMenu.Trigger
  >
  <ContextMenu.Portal>
    <ContextMenu.Content
      class="border-border bg-panel text-base-content z-[1200] min-w-48 rounded-xl border p-1.5 shadow-xl"
    >
      {#each items as item (item.label)}
        <ContextMenu.Item
          disabled={item.disabled}
          onSelect={() => item.onSelect?.()}
          class={cx(
            'flex items-center gap-3 rounded-lg px-3 py-3 text-sm outline-none data-[highlighted]:bg-raised data-[disabled]:pointer-events-none data-[disabled]:opacity-35',
            item.class,
          )}
        >
          {#if item.icon}
            <item.icon class={cx('size-4 shrink-0', item.iconClass)} />
          {/if}
          <span class="min-w-0 break-words whitespace-normal">{item.label}</span>
        </ContextMenu.Item>
      {/each}
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
