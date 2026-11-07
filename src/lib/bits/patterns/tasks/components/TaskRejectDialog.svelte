<script lang="ts">
import { m } from '#lib/i18n.js'
import MorphDialog from '#lib/bits/core/dialog/MorphDialog.svelte'

let {
  open: isOpen = $bindable(false),
  value = $bindable(''),
  isBusy = false,
  source = null,
  onConfirm,
}: {
  open?: boolean
  value?: string
  isBusy?: boolean
  source?: HTMLElement | null
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

<MorphDialog
  bind:open={isOpen}
  busy={isBusy}
  {source}
  title={m.north_level_niklas_tap()}
  closeLabel="Close rejection dialog"
>
  <textarea
    bind:value
    aria-label={m.north_level_niklas_tap()}
    disabled={isBusy}
    class="border-foreground/12 bg-surface text-foreground focus:border-foreground/28 h-32 w-full rounded-lg border px-4 py-3 text-sm transition outline-none"
    placeholder={m.placeholder__internal_use_only()}
    onkeydown={handleReasonKeydown}
  ></textarea>

  {#snippet footer()}
    <button
      type="button"
      class="border-foreground/12 text-foreground/78 hover:bg-foreground/[0.06] hover:text-foreground inline-flex h-11 items-center rounded-lg border px-4 text-sm transition"
      disabled={isBusy}
      onclick={() => {
        isOpen = false
      }}
    >
      {m.cancel()}
    </button>
    <button
      type="button"
      class="bg-error text-error-content hover:bg-error/90 inline-flex h-11 items-center rounded-lg px-5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45"
      disabled={isBusy}
      onclick={() => {
        void onConfirm?.()
      }}
    >
      {m.alive_north_albatross_lead()}
    </button>
  {/snippet}
</MorphDialog>
