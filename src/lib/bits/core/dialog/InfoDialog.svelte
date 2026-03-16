<script lang="ts">
import { Dialog } from 'bits-ui'
import { Button } from '$lib/bits/core'
import type { Snippet } from 'svelte'
import type { Component } from 'svelte'
import type { WithoutChild } from 'bits-ui'
import type { Dialog as DialogPrimitive } from 'bits-ui'

type Props = Omit<DialogPrimitive.RootProps, 'open'> & {
  open?: boolean
  title: string
  description?: string
  triggerText?: string
  triggerIconComponent?: Component
  overlayProps?: WithoutChild<DialogPrimitive.OverlayProps>
  contentProps?: WithoutChild<DialogPrimitive.ContentProps>
  children?: Snippet
}

let {
  open = $bindable(false),
  title,
  description,
  triggerText = 'Info',
  triggerIconComponent,
  overlayProps,
  contentProps,
  children,
  ...restProps
}: Props = $props()
</script>

<Dialog.Root bind:open {...restProps}>
  <Dialog.Trigger>
    <Button
      text={triggerText}
      iconComponent={triggerIconComponent}
      modifier="circle"
      style="ghost"
      color="neutral"
    />
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay class="bits-dialog__overlay" {...overlayProps} />
    <Dialog.Content class="bits-dialog__content bits-theme" {...contentProps}>
      <Dialog.Title class="bits-dialog__title">{title}</Dialog.Title>
      {#if description?.length}
        <Dialog.Description class="bits-dialog__description">
          {description}
        </Dialog.Description>
      {/if}
      <div class="bits-feature-info">{@render children?.()}</div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
