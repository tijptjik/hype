import type { Component, Snippet } from 'svelte'
import type { HTMLAttributes } from 'svelte/elements'

export interface HeaderRootProps extends HTMLAttributes<HTMLDivElement> {
  ref?: HTMLDivElement | null
  class?: string
  style?: string
  children?: Snippet
}

export interface HeaderIconProps extends HTMLAttributes<HTMLElement> {
  icon?: Component
  href?: string
  class?: string
  children?: Snippet
}

export interface HeaderTitleProps extends HTMLAttributes<HTMLParagraphElement> {
  text?: string
  class?: string
  children?: Snippet
}

export interface HeaderSubtitleProps extends HTMLAttributes<HTMLParagraphElement> {
  text?: string
  class?: string
  children?: Snippet
}
