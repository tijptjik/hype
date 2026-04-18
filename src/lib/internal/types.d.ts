import type { Snippet } from 'svelte'
import type {
  attachRef,
  Box,
  ReadableBoxedValues,
  WritableBoxedValues,
} from 'svelte-toolbelt'

export type OnChangeFn<T> = (value: T) => void

export type WithChild<
  Props extends Record<PropertyKey, unknown> = {},
  SnippetProps extends Record<PropertyKey, unknown> = { _default: never },
  Ref = HTMLElement,
> = Omit<Props, 'child' | 'children'> & {
  child?: SnippetProps extends { _default: never }
    ? Snippet<[{ props: Record<string, unknown> }]>
    : Snippet<[SnippetProps & { props: Record<string, unknown> }]>
  children?: SnippetProps extends { _default: never }
    ? Snippet
    : Snippet<[SnippetProps]>
  style?: Record<string, unknown> | string | null | undefined
  ref?: Ref | null | undefined
}

export type Without<T extends object, U extends object> = Omit<T, keyof U>

export type WithRefOpts<T = {}> = T &
  ReadableBoxedValues<{ id: string }> &
  WritableBoxedValues<{ ref: HTMLElement | null }>

export type BitsEvent<
  T extends Event = Event,
  U extends HTMLElement = HTMLElement,
> = T & {
  currentTarget: U
}

export type BitsPointerEvent<T extends HTMLElement = HTMLElement> = BitsEvent<
  PointerEvent,
  T
>
export type BitsKeyboardEvent<T extends HTMLElement = HTMLElement> = BitsEvent<
  KeyboardEvent,
  T
>

export type RefAttachment<T extends HTMLElement = HTMLElement> = ReturnType<
  typeof attachRef<T>
>

export type ElementRef = Box<HTMLElement | null>
