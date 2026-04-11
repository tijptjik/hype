// BITS-UI
import type { Dialog, WithoutChild } from 'bits-ui'

export type HubPolicyDialogProps = Omit<Dialog.RootProps, 'open'> & {
  open?: boolean
  title: string
  markdown?: string | null
  triggerText?: string
  hideTrigger?: boolean
  emptyText?: string
  triggerClass?: string
  overlayProps?: WithoutChild<Dialog.OverlayProps>
  contentProps?: WithoutChild<Dialog.ContentProps>
}
