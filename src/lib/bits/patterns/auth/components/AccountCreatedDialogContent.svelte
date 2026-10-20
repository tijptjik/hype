<script lang="ts">
// BITS COMPONENTS
import { Dialog } from 'bits-ui'
// ICONS
import CheckCircle from 'virtual:icons/proicons/checkmark-circle'
// I18N
import { m } from '#lib/i18n.js'

let {
  onClose,
}: {
  onClose?: () => void | Promise<void>
} = $props()

/** Dismisses the account-created dialog after the user has read the verification guidance. */
function handleClose(): void {
  void onClose?.()
}
</script>

<section
  class="w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-panel/95 p-6 text-center text-foreground shadow-2xl"
>
  <div
    class="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-success/30 bg-success/10 text-success"
  >
    <CheckCircle class="h-9 w-9" aria-hidden="true" />
  </div>
  <Dialog.Title class="mt-5 text-2xl font-semibold"
    >{m.guest__account_created()}</Dialog.Title
  >
  <Dialog.Description class="mt-3 text-sm leading-6 text-muted-foreground"
    >{m.guest__verification_sent()}</Dialog.Description
  >
  <button
    class="mt-7 w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-content transition hover:bg-primary/90"
    type="button"
    onclick={handleClose}
  >
    {m.guest__close()}
  </button>
</section>
