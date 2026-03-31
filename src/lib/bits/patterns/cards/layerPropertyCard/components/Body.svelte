<script lang="ts">
import { Card } from '$lib/bits/custom'
import { SimpleTooltip } from '$lib/bits/core'
import type { LayerPropertyCardBodyProps } from '../layerPropertyCard.types'

let {
  name = null,
  scopeLabel = null,
  scopeTone = 'project',
  iconTitle = null,
  iconComponent = null,
  class: className = '',
}: LayerPropertyCardBodyProps = $props()

const IconComponent = $derived(iconComponent)
</script>

<Card.Body title={name || '-'} class={`bits-form__layer-card-body ${className}`}>
  {#snippet tags()}
    <div class="bits-form__layer-card-meta">
      {#if IconComponent}
        <SimpleTooltip disabled={!iconTitle}>
          {#snippet trigger()}
            <span
              class={`bits-form__layer-card-type-icon-wrap bits-form__layer-card-type-icon-wrap--${scopeTone}`}
              aria-label={iconTitle ?? undefined}
            >
              <IconComponent class="bits-form__layer-card-type-icon" />
            </span>
          {/snippet}
          {iconTitle ?? ''}
        </SimpleTooltip>
      {/if}
      {#if scopeLabel}
        <span
          class={`bits-form__layer-card-scope bits-form__layer-card-scope--${scopeTone}`}
        >
          {scopeLabel}
        </span>
      {/if}
    </div>
  {/snippet}
</Card.Body>
