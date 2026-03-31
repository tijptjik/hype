<script lang="ts">
// BITS-UI
import { Dialog } from 'bits-ui'
// BITS
import Button from '../button/Button.svelte'
// I18N
import { m } from '$lib/i18n'
// TYPES
import type { DestructiveDialogProps } from './dialog.types'

let {
  open = $bindable(false),
  title,
  description,
  confirmText = m.best_swift_opossum_inspire(),
  cancelText = m.cancel(),
  onConfirm,
  overlayProps,
  contentProps,
  ...restProps
}: DestructiveDialogProps = $props()

function handleCancel(event: MouseEvent): void {
  event.preventDefault()
  open = false
}

async function handleConfirm(event: MouseEvent): Promise<void> {
  event.preventDefault()
  await onConfirm?.(event)
  open = false
}
</script>

<Dialog.Root bind:open {...restProps}>
  <Dialog.Portal>
    <Dialog.Overlay class="bits-dialog__overlay" {...overlayProps} />
    <Dialog.Content class="bits-dialog__content bits-theme" {...contentProps}>
      <Dialog.Title class="bits-dialog__title"> {@render title()} </Dialog.Title>
      <Dialog.Description class="bits-dialog__description">
        {@render description()}
      </Dialog.Description>
      <div class="bits-dialog__actions">
        <Button
          text={cancelText}
          color="neutral"
          style="ghost"
          onClick={handleCancel}
        />
        <Button
          text={confirmText}
          color="error"
          class="text-white"
          onClick={handleConfirm}
        />
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
