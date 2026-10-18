import type { SwapProps } from '#lib/bits/custom/swap/swap.types.js'

export interface SwapFieldProps extends Omit<SwapProps, 'attrs' | 'type'> {
  required?: boolean
  name?: string
  value?: string
  id?: string
}
