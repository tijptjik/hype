<script lang="ts">
import { SimpleTooltip } from '#lib/bits/core/index.js'
import { toIssueChipParts } from '#lib/client/services/form.js'
import TriangleAlert from 'virtual:icons/proicons/alert-triangle'
import type { SectionHeaderIssues } from './types'

let { issues = [] }: SectionHeaderIssues = $props()
</script>

{#if issues.length > 0}
  <div
    class="flex flex-wrap items-center justify-center gap-2"
    role="alert"
    aria-live="polite"
  >
    {#each issues as message (message)}
      {@const chip = toIssueChipParts(message)}
      <span
        class="inline-flex items-stretch overflow-hidden rounded-md border border-error/40 bg-error/10 text-foreground"
      >
        <SimpleTooltip disabled={!chip.code}>
          {#snippet trigger()}
            <span
              class="inline-flex items-center justify-center border-r border-error/25 px-3 py-1 text-error"
            >
              <TriangleAlert class="bits-form__section-header-issue-icon-svg" />
            </span>
          {/snippet}
          {chip.code}
        </SimpleTooltip>
        <span class="px-4 py-1 text-sm font-medium">{chip.detail}</span>
      </span>
    {/each}
  </div>
{/if}
