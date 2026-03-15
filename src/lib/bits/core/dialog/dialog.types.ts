// SVELTE
import type { Component, Snippet } from 'svelte'
// BITS-UI
import type { Dialog, WithoutChild } from 'bits-ui'

export type DestructiveDialogProps = Omit<Dialog.RootProps, 'open'> & {
  open?: boolean
  title: Snippet
  description: Snippet
  confirmText?: string
  cancelText?: string
  onConfirm?: (event: MouseEvent) => void | Promise<void>
  overlayProps?: WithoutChild<Dialog.OverlayProps>
  contentProps?: WithoutChild<Dialog.ContentProps>
}

export type InfoDialogProps = Omit<Dialog.RootProps, 'open'> & {
  open?: boolean
  title: string
  description?: string
  triggerText?: string
  triggerIconComponent?: Component
  overlayProps?: WithoutChild<Dialog.OverlayProps>
  contentProps?: WithoutChild<Dialog.ContentProps>
  children?: Snippet
}
