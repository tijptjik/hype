// SVELTE
import type { Snippet } from 'svelte'
// BITS-UI
import type { Popover, WithoutChild } from 'bits-ui'

export type PopoverProps = Omit<Popover.RootProps, 'open'> & {
  open?: boolean
  trigger: Snippet
  children?: Snippet
  triggerProps?: WithoutChild<Popover.TriggerProps>
  triggerClass?: string
  contentProps?: WithoutChild<Popover.ContentProps>
  contentClass?: string
}
