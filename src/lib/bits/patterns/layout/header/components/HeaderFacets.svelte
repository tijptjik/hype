<script lang="ts">
// TRANSLATION STATUS
import { translatingTab } from '#lib/forms/translationReview.js'
import TranslatingIcon from 'virtual:icons/lucide/loader-circle'
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

// Render known destination tabs at full width from the first paint.
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
          hideLabel: hideLabel || facet.hideLabel,
          className: facet.class,
        })}
        <li class={HEADER_FACET_ITEM_CLASSES} aria-hidden={false}>
          <div class="min-w-0 overflow-hidden">
            <Button
              text={facet.label}
              attrs={{
                'aria-current': isActive ? 'page' : undefined,
                'data-facet-ref': facet.ref,
                'aria-busy': $translatingTab === facet.ref ? true : undefined,
                'data-tooltip': hideLabel || facet.hideLabel ? facet.label : undefined,
              }}
              {color}
              style="ghost"
              class={`${facetButtonClass} w-max whitespace-nowrap`}
              labelClasses={HEADER_BUTTON_LABEL_CLASSES}
              iconComponent={$translatingTab === facet.ref
                ? TranslatingIcon
                : facet.icon}
              iconClasses={$translatingTab === facet.ref ? 'animate-spin' : ''}
              hideLabel={hideLabel || facet.hideLabel}
              disabled={facet.disabled === true}
              onClick={() => onFacetChange?.(facet.ref)}
            />
          </div>
        </li>
      {/each}
    </ul>
  </div>
{/if}
