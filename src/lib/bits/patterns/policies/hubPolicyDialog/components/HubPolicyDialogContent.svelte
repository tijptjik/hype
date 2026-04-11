<script lang="ts">
// BITS-UI
import { Dialog } from 'bits-ui'
// ICONS
import XIcon from 'virtual:icons/lucide/x'
// COMPONENTS
import HubPolicyDocumentBody from './HubPolicyDocumentBody.svelte'
// TYPES
import type { HubPolicyDialogContentProps } from './hubPolicyDialogPrimitives.types'

let {
  title,
  html = '',
  emptyText = 'No policy content available yet.',
}: HubPolicyDialogContentProps = $props()
</script>

<div class="flex items-start justify-between gap-4">
  <Dialog.Title class="bits-dialog__title">{title}</Dialog.Title>
  <Dialog.Close
    class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/72 transition hover:bg-white/[0.08] hover:text-white"
    aria-label="Close policy dialog"
  >
    <XIcon class="h-5 w-5" />
  </Dialog.Close>
</div>
<HubPolicyDocumentBody
  class="mt-4 max-h-[70vh] overflow-y-auto pr-2"
  {html}
  {emptyText}
/>
