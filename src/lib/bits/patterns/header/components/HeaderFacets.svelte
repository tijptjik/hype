<script lang="ts">
// BITS COMPONENTS
import { Button, Separator } from '$lib/bits/core'
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
        {@const FacetIcon = facet.icon}
        <li class="bits-pattern-header__facet-item">
          {#snippet facetIcon()}
            <FacetIcon />
          {/snippet}
          <Button
            text={facet.label}
            color={isActive ? 'primary' : 'neutral'}
            style="ghost"
            icon={FacetIcon ? facetIcon : undefined}
            {hideLabel}
            onClick={() => onFacetChange?.(facet.ref)}
          />
        </li>
      {/each}
    </ul>
  </div>
{/if}
