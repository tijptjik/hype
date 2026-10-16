<script lang="ts">
// BITS COMPONENTS
import { TextArea } from '#lib/bits/custom/form/index.js'
import HubPolicyDocumentBody from '#lib/bits/patterns/policies/hubPolicyDialog/components/HubPolicyDocumentBody.svelte'
// SERVICES
import { renderPolicyMarkdown } from '#lib/services/policy.js'
// TYPES
import type { ComponentProps } from 'svelte'

let { isEditing = false, ...field }: ComponentProps<typeof TextArea> = $props()

const renderedHtml = $derived(renderPolicyMarkdown(field.value))
</script>

<!-- Keep the remote-form control mounted so other tabs can submit its value. -->
<div hidden={!isEditing}>
  <TextArea {...field} {isEditing} />
</div>

{#if !isEditing}
  <section class="min-w-0 space-y-3 py-2">
    <h3 class="text-sm font-semibold text-muted-foreground">{field.label}</h3>
    <HubPolicyDocumentBody
      html={renderedHtml}
      class="min-w-0 overflow-x-auto break-words"
    />
  </section>
{/if}
