<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// TYPES
import type { HeaderFacetItem } from '../header.types'
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
  isMeasuring = false,
  onFacetChange,
}: HeaderFacetsProps = $props()

// Keep outgoing keyed slots mounted until their collapse animation finishes.
let slots = $state<HeaderFacetItem[]>(untrack(() => items))
let expanded = $state<string[]>([])

$effect(() => {
  const nextItems = items
  // Incoming facets own visible order; outgoing slots survive only their exit.
  const outgoing = untrack(() => slots).filter(
    slot => !nextItems.some(item => item.ref === slot.ref),
  )
  slots = [...nextItems, ...outgoing]

  // Paint new slots collapsed before expanding; removed slots shrink immediately.
  expanded = untrack(() => expanded).filter(ref =>
    nextItems.some(item => item.ref === ref),
  )
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      expanded = nextItems.map(item => item.ref)
    })
  })
  // Allow the 200ms collapse transition to finish before removing outgoing slots.
  const cleanup = setTimeout(() => {
    slots = nextItems
  }, 250)
  return () => {
    cancelAnimationFrame(frame)
    clearTimeout(cleanup)
  }
})
</script>

{#if slots.length > 0}
  <div class={HEADER_FACETS_WRAP_CLASSES}>
    <ul class={HEADER_FACETS_LIST_CLASSES} style={HEADER_FACETS_LIST_STYLE}>
      {#each slots as facet (facet.ref)}
        {@const isVisible = items.some(item => item.ref === facet.ref)}
        {@const isExpanded =
          isVisible &&
          (isMeasuring || facet.ref === 'core' || expanded.includes(facet.ref))}
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
        <li
          class={[HEADER_FACET_ITEM_CLASSES, isMeasuring && 'transition-none']}
          style:grid-template-columns={isExpanded ? '1fr' : '0fr'}
          style:opacity={isExpanded ? 1 : 0}
          inert={!isExpanded}
          aria-hidden={!isExpanded}
        >
          <div class="min-w-0 overflow-hidden">
            <Button
              text={facet.label}
              attrs={{
                'aria-current': isActive ? 'page' : undefined,
                'data-tooltip': hideLabel || facet.hideLabel ? facet.label : undefined,
              }}
              {color}
              style="ghost"
              class={`${facetButtonClass} w-max whitespace-nowrap`}
              labelClasses={HEADER_BUTTON_LABEL_CLASSES}
              iconComponent={facet.icon}
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
