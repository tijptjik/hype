<script lang="ts">
// TYPES
import type { HubPolicyDocumentBodyProps } from './hubPolicyDialogPrimitives.types'

let {
  html = '',
  emptyText = 'No policy content available yet.',
  class: className = '',
}: HubPolicyDocumentBodyProps = $props()
</script>

<div
  class={`bits-feature-info text-sm leading-7 text-base-content/85 ${className}`.trim()}
>
  {#if html.length}
    <div
      class="space-y-4 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_em]:italic [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_hr]:my-6 [&_li]:ml-5 [&_li]:list-disc [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:my-3 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-base-300 [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-base-300 [&_th]:bg-base-200 [&_th]:px-3 [&_th]:py-2 [&_ul]:space-y-2 [&_ul]:pl-5"
    >
      {@html html}
    </div>
  {:else}
    <p class="text-sm text-base-content/65">{emptyText}</p>
  {/if}
</div>
