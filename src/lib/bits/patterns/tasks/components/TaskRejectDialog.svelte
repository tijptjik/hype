<script lang="ts">
import { Dialog } from 'bits-ui'
import { m } from '$lib/i18n'
import XIcon from 'virtual:icons/lucide/x'

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
      class="fixed left-1/2 top-1/2 z-[1001] w-[min(92vw,36rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/12 bg-neutral-950 p-6 text-white shadow-2xl"
    >
      <div class="flex items-start justify-between gap-6">
        <div>
          <Dialog.Title
            class="text-lg font-semibold uppercase tracking-[0.18em] text-white/92"
          >
            {m.north_level_niklas_tap()}
          </Dialog.Title>
        </div>

        <Dialog.Close
          class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/72 transition hover:bg-white/[0.08] hover:text-white"
          aria-label="Close rejection dialog"
        >
          <XIcon class="h-5 w-5" />
        </Dialog.Close>
      </div>

      <textarea
        bind:value
        class="mt-5 h-32 w-full rounded-2xl border border-white/12 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-white/28"
        placeholder={m.placeholder__internal_use_only()}
        onkeydown={handleReasonKeydown}
      ></textarea>

      <div class="mt-5 flex justify-end gap-3">
        <button
          type="button"
          class="inline-flex h-11 items-center rounded-full border border-white/12 px-4 text-sm text-white/78 transition hover:bg-white/[0.06] hover:text-white"
          onclick={() => {
            isOpen = false
          }}
        >
          {m.cancel()}
        </button>
        <button
          type="button"
          class="inline-flex h-11 items-center rounded-full bg-rose-500 px-5 text-sm font-medium text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-45"
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
