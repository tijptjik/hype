<script lang="ts">
import { toIssueChipParts } from '$lib/client/services/form'
import TriangleAlert from 'virtual:icons/lucide/triangle-alert'
import type { SectionHeaderIssues } from './types'

let { issues = [] }: SectionHeaderIssues = $props()
</script>

{#if issues.length > 0}
  <div class="bits-form__section-header-issues" role="alert" aria-live="polite">
    {#each issues as message (message)}
      {@const chip = toIssueChipParts(message)}
      <span class="bits-form__section-header-issue-chip">
        <span
          class="bits-form__section-header-issue-icon"
          aria-label={chip.code}
          title={chip.code}
        >
          <TriangleAlert class="bits-form__section-header-issue-icon-svg" />
        </span>
        <span class="bits-form__section-header-issue-detail">{chip.detail}</span>
      </span>
    {/each}
  </div>
{/if}
