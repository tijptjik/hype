<script lang="ts">
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// TYPES
import type { HeaderFacetsProps } from './headerPrimitives.types'

let {
  items = [],
  active = false,
  hideLabel = false,
  onFacetChange,
}: HeaderFacetsProps = $props()
</script>

{#if items.length > 0}
  <div class="bits-pattern-header__facets-wrap">
    <ul class="bits-pattern-header__facets">
      {#each items as facet (facet.ref)}
        {@const isActive = active === facet.ref || (active === false && facet.ref === 'core')}
        {@const color = facet.hasIssues ? 'error' : isActive ? 'primary' : 'neutral'}
        {@const facetButtonClass = [
          'bits-pattern-header__facet-btn',
          facet.hasIssues ? 'bits-pattern-header__facet-btn--issue' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        <li class="bits-pattern-header__facet-item">
          <Button
            text={facet.label}
            {color}
            style="ghost"
            class={facetButtonClass}
            iconComponent={facet.icon}
            {hideLabel}
            onClick={() => onFacetChange?.(facet.ref)}
          />
        </li>
      {/each}
    </ul>
  </div>
{/if}
