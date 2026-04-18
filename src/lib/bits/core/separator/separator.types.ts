import type { HTMLAttributes } from 'svelte/elements'

export type SeparatorOrientation = 'horizontal' | 'vertical'
export type SeparatorVariant = 'default' | 'dot'

export interface SeparatorProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'id' | 'style'> {
  id?: string
  style?: string
  orientation?: SeparatorOrientation
  decorative?: boolean
  variant?: SeparatorVariant
}
