<script lang="ts">
// BITS COMPONENTS
import { Dialog } from 'bits-ui'
// ICONS
import CheckCircle from 'virtual:icons/lucide/circle-check'
// I18N
import { m } from '$lib/i18n'

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
  class="w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/15 bg-neutral-950/95 p-6 text-center text-white shadow-2xl"
>
  <div
    class="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-300/10 text-emerald-300"
  >
    <CheckCircle class="h-9 w-9" aria-hidden="true" />
  </div>
  <Dialog.Title class="mt-5 text-2xl font-semibold"
    >{m.guest__account_created()}</Dialog.Title
  >
  <Dialog.Description class="mt-3 text-sm leading-6 text-white/70"
    >{m.guest__verification_sent()}</Dialog.Description
  >
  <button
    class="mt-7 w-full rounded-lg bg-[#4987E2] px-4 py-2 font-medium text-white transition hover:bg-[#4987E2]/90"
    type="button"
    onclick={handleClose}
  >
    {m.guest__close()}
  </button>
</section>
