// SVELTE
import type { Snippet } from 'svelte'
// BITS-UI
import type { Popover, WithoutChild } from 'bits-ui'

export type SimpleTooltipProps = Omit<Popover.RootProps, 'open'> & {
  open?: boolean
  trigger: Snippet
  children?: Snippet
  disabled?: boolean
  showArrow?: boolean
  triggerProps?: WithoutChild<Popover.TriggerProps>
  triggerClass?: string
  contentProps?: WithoutChild<Popover.ContentProps>
  contentClass?: string
}
