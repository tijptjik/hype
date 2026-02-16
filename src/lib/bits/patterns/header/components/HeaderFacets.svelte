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
        <li class="bits-pattern-header__facet-item">
          <Button
            text={facet.label}
            color={isActive ? 'primary' : 'neutral'}
            style="ghost"
            iconComponent={facet.icon}
            {hideLabel}
            onClick={() => onFacetChange?.(facet.ref)}
          />
        </li>
      {/each}
    </ul>
  </div>
{/if}
