<script lang="ts">
// BITS-UI
import { Dialog } from 'bits-ui'
// SERVICES
import { renderPolicyMarkdown } from '$lib/services/policy'
// COMPONENTS
import * as HubPolicyDialogPrimitive from './components'
// TYPES
import type { HubPolicyDialogProps } from './hubPolicyDialog.types'

let {
  open = $bindable(false),
  title,
  markdown,
  triggerText = 'Open policy',
  hideTrigger = false,
  emptyText,
  triggerClass = '',
  overlayProps,
  contentProps,
  ...restProps
}: HubPolicyDialogProps = $props()

const renderedHtml = $derived(renderPolicyMarkdown(markdown))
</script>

<Dialog.Root bind:open {...restProps}>
  {#if !hideTrigger}
    <Dialog.Trigger>
      <HubPolicyDialogPrimitive.HubPolicyTriggerLink
        text={triggerText}
        class={triggerClass}
      />
    </Dialog.Trigger>
  {/if}
  <Dialog.Portal>
    <Dialog.Overlay class="bits-dialog__overlay" {...overlayProps} />
    <Dialog.Content
      class="bits-dialog__content bits-dialog__content--policy bits-theme"
      {...contentProps}
    >
      <HubPolicyDialogPrimitive.HubPolicyDialogContent
        {title}
        html={renderedHtml}
        {emptyText}
      />
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
