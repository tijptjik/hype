import type { Component } from 'svelte'

export type HeaderSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface HeaderCrumb {
  name: string
  href: string
}

export interface HeaderProps {
  text?: string
  description?: string
  hideTitle?: boolean
  hideDescription?: boolean
  icon?: Component
  crumbs?: HeaderCrumb[]
  size?: HeaderSize
  ref?: HTMLDivElement | null
  id?: string
  class?: string
  style?: string | null
}
