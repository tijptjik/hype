import type { HTMLAttributes } from 'svelte/elements'

export type SeparatorOrientation = 'horizontal' | 'vertical'
export type SeparatorVariant = 'default' | 'dot'

export interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: SeparatorOrientation
  decorative?: boolean
  variant?: SeparatorVariant
}
