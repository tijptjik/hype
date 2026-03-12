<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// TYPES
import type { EntityCardFooterProps } from '../entityCard.types'

let {
  publicationState = null,
  publicationLabel,
  hubCodes,
  visitableLabel,
}: EntityCardFooterProps = $props()
</script>

<footer class="bits-entity-card__footer">
  <div class="bits-entity-card__footer-left">
    {#if publicationState !== null && publicationLabel}
      <span
        class={`bits-entity-card__status ${
          publicationState
            ? 'bits-entity-card__status--published'
            : 'bits-entity-card__status--draft'
        }`}
      >
        {publicationLabel}
      </span>
    {:else if hubCodes}
      <div class="bits-entity-card__meta">{hubCodes}</div>
    {/if}
  </div>

  <div class="bits-entity-card__footer-right">
    {#if visitableLabel}
      <div class="bits-entity-card__meta">{visitableLabel}</div>
    {/if}
  </div>
</footer>
