import type { HTMLButtonAttributes, HTMLSpanAttributes } from 'svelte/elements'

type BitsPrimitive<T> = Omit<T, 'style' | 'id' | 'children'> & {
  id?: string
}

export type BitsPrimitiveButtonAttributes = BitsPrimitive<HTMLButtonAttributes>
export type BitsPrimitiveSpanAttributes = BitsPrimitive<HTMLSpanAttributes>
