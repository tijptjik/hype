<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// TYPES
import type { HeaderFacetsProps } from './headerPrimitives.types'
// STYLES
import {
  getHeaderFacetButtonClasses,
  HEADER_BUTTON_LABEL_CLASSES,
  HEADER_FACETS_LIST_CLASSES,
  HEADER_FACETS_LIST_STYLE,
  HEADER_FACETS_WRAP_CLASSES,
  HEADER_FACET_ITEM_CLASSES,
} from './headerPrimitives.styles'

let {
  items = [],
  active = false,
  hideLabel = false,
  onFacetChange,
}: HeaderFacetsProps = $props()
</script>

{#if items.length > 0}
  <div class={HEADER_FACETS_WRAP_CLASSES}>
    <ul class={HEADER_FACETS_LIST_CLASSES} style={HEADER_FACETS_LIST_STYLE}>
      {#each items as facet (facet.ref)}
        {@const isActive =
          active === facet.ref || (active === false && facet.ref === 'core')}
        {@const color =
          facet.hasIssues === true ? 'error' : isActive ? 'primary' : 'neutral'}
        {@const facetButtonClass = getHeaderFacetButtonClasses({
          isActive,
          hasIssues: facet.hasIssues === true,
          color,
          hideLabel,
          className: facet.class,
        })}
        <li
          class={HEADER_FACET_ITEM_CLASSES}
          in:fade={{ duration: 120 }}
          out:fade={{ duration: 120 }}
        >
          <Button
            text={facet.label}
            attrs={{ 'aria-current': isActive ? 'page' : undefined }}
            {color}
            style="ghost"
            class={facetButtonClass}
            labelClasses={HEADER_BUTTON_LABEL_CLASSES}
            iconComponent={facet.icon}
            {hideLabel}
            disabled={facet.disabled === true}
            onClick={() => onFacetChange?.(facet.ref)}
          />
        </li>
      {/each}
    </ul>
  </div>
{/if}
