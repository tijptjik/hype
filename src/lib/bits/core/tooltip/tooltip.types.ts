// SVELTE
import type { Snippet } from 'svelte'
// BITS-UI
import type { Tooltip, WithoutChild } from 'bits-ui'

export type SimpleTooltipProps = Omit<Tooltip.RootProps, 'open'> & {
  open?: boolean
  trigger: Snippet
  children?: Snippet
  disabled?: boolean
  withProvider?: boolean
  triggerProps?: WithoutChild<Tooltip.TriggerProps>
  triggerClass?: string
  contentProps?: WithoutChild<Tooltip.ContentProps>
  contentClass?: string
  arrowClass?: string
}
