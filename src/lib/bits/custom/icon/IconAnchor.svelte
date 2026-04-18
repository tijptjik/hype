<script lang="ts">
import { Popover } from 'bits-ui'

import { cx } from '$lib/bits/utils'

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
  sideOffset = 12,
}: IconAnchorProps = $props()

const rootClasses = $derived(cx('bits-theme relative z-30', className))
const triggerClasses = $derived(
  cx(
    'inline-flex h-12 w-12 items-center justify-center rounded-full border-none bg-glass-result opacity-70 transition-opacity duration-200 hover:opacity-90',
    triggerClass,
  ),
)
const contentClasses = $derived(
  cx(
    'z-50 max-w-sm rounded-xl border border-base-50 bg-base-100 p-3 shadow-xl',
    contentClass,
  ),
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
        <Popover.Content class={contentClasses} side="top" {sideOffset} {align}>
          {@render children()}
        </Popover.Content>
      </Popover.Portal>
    {/if}
  </Popover.Root>
</div>
