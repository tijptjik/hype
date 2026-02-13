import type { Component } from 'svelte'
import type { HTMLAttributes } from 'svelte/elements'

export type HeaderSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface HeaderProps extends HTMLAttributes<HTMLDivElement> {
  text?: string
  description?: string
  icon?: Component
  size?: HeaderSize
  ref?: HTMLDivElement | null
}
