<script lang="ts">
import { Dialog } from 'bits-ui'
import { m } from '#lib/i18n.js'
import XIcon from 'virtual:icons/proicons/cancel'

let {
  open: isOpen = $bindable(false),
  value = $bindable(''),
  isBusy = false,
  onConfirm,
}: {
  open?: boolean
  value?: string
  isBusy?: boolean
  onConfirm?: () => void | Promise<void>
} = $props()

function handleReasonKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return
  if (!(event.ctrlKey || event.metaKey)) return
  if (event.shiftKey || event.altKey || event.isComposing || isBusy) return

  event.preventDefault()
  void onConfirm?.()
}
</script>

<Dialog.Root bind:open={isOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm" />
    <Dialog.Content
      onEscapeKeydown={event => {
        if (isBusy) event.preventDefault()
      }}
      onInteractOutside={event => {
        if (isBusy) event.preventDefault()
      }}
      class="fixed left-1/2 top-1/2 z-[1001] w-[min(92vw,36rem)] -translate-x-1/2 -translate-y-1/2 max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-panel p-6 text-foreground shadow-2xl"
    >
      <div class="flex items-start justify-between gap-6">
        <div>
          <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">
            {m.north_level_niklas_tap()}
          </Dialog.Title>
        </div>

        <Dialog.Close
          class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/[0.04] text-foreground/72 transition hover:bg-foreground/[0.08] hover:text-foreground"
          disabled={isBusy}
          aria-label="Close rejection dialog"
        >
          <XIcon class="h-5 w-5" />
        </Dialog.Close>
      </div>

      <textarea
        bind:value
        aria-label={m.north_level_niklas_tap()}
        disabled={isBusy}
        class="mt-5 h-32 w-full rounded-lg border border-foreground/12 bg-surface px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/28"
        placeholder={m.placeholder__internal_use_only()}
        onkeydown={handleReasonKeydown}
      ></textarea>

      <div class="mt-5 flex justify-end gap-3">
        <button
          type="button"
          class="inline-flex h-11 items-center rounded-lg border border-foreground/12 px-4 text-sm text-foreground/78 transition hover:bg-foreground/[0.06] hover:text-foreground"
          disabled={isBusy}
          onclick={() => {
            isOpen = false
          }}
        >
          {m.cancel()}
        </button>
        <button
          type="button"
          class="inline-flex h-11 items-center rounded-lg bg-error px-5 text-sm font-medium text-error-content transition hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isBusy}
          onclick={() => {
            void onConfirm?.()
          }}
        >
          {m.alive_north_albatross_lead()}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
