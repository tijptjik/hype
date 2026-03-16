<script lang="ts">
import { Popover } from 'bits-ui'
import Icon from './Icon.svelte'
import type { IconAnchorProps } from './iconAnchor.types'

let {
  icon,
  children,
  position = 'right',
  open = $bindable(false),
  label = 'Open details',
  class: className = '',
  triggerClass = '',
  contentClass = '',
}: IconAnchorProps = $props()

const rootClasses = $derived(
  ['bits-theme', 'bits-icon-anchor', className].join(' ').trim(),
)
const triggerClasses = $derived(
  ['bits-icon-anchor__trigger', triggerClass].filter(Boolean).join(' '),
)
const contentClasses = $derived(
  ['bits-icon-anchor__content', contentClass].filter(Boolean).join(' '),
)
const align = $derived(position === 'left' ? 'start' : 'end')
</script>

<div class={rootClasses}>
  <Popover.Root bind:open>
    <Popover.Trigger class={triggerClasses} aria-label={label}>
      <Icon src={icon} size="lg" strokeWidth={2} />
    </Popover.Trigger>

    {#if children}
      <Popover.Portal>
        <Popover.Content class={contentClasses} side="top" sideOffset={12} {align}>
          {@render children()}
        </Popover.Content>
      </Popover.Portal>
    {/if}
  </Popover.Root>
</div>
