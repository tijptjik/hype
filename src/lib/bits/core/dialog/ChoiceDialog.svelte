<script lang="ts">
// BITS-UI
import { Dialog } from 'bits-ui'
// TYPES
import type { Snippet } from 'svelte'

let {
  title,
  description,
  onCancel,
  children,
}: {
  title: string
  description: string
  onCancel: () => void
  children: Snippet
} = $props()
let returnFocus: HTMLElement | null = null
</script>

<Dialog.Root
  open={true}
  onOpenChange={open => {
    if (!open) onCancel()
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm" />
    <Dialog.Content
      class="border-border bg-panel text-foreground fixed top-1/2 left-1/2 z-[1001] max-h-[90dvh] w-[min(92vw,36rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-2xl"
      onOpenAutoFocus={() => {
        returnFocus =
          document.activeElement instanceof HTMLElement ? document.activeElement : null
      }}
      onCloseAutoFocus={event => {
        event.preventDefault()
        returnFocus?.focus()
      }}
    >
      <Dialog.Title class="text-lg font-semibold">{title}</Dialog.Title>
      <Dialog.Description class="mt-3 text-sm leading-relaxed"
        >{description}</Dialog.Description
      >
      <div class="mt-6 flex flex-wrap justify-end gap-2">{@render children()}</div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
