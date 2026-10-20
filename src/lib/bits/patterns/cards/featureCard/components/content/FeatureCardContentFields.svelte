<script lang="ts">
import FeaturePropertyValue from './FeaturePropertyValue.svelte'
// SERVICES
import { getFeatureCardDisplayProperties } from '#lib/client/services/property.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import {
  getSurfaceLayoutCtx,
  SurfaceLayout,
} from '#lib/context/surfaceLayout.svelte.js'
import { getResponsiveCtx } from '#lib/context/responsive.svelte.js'
// I18N
import { getFeaturePropertyDisplay, getFPI18n, getI18n, m } from '#lib/i18n.js'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
// LOCAL
import {
  getFeatureCardLayout,
  resolveFeaturePropertyLayout,
} from '../../featureCard.layout'
import { getFeatureCardResponsiveWidth } from '../../featureCard.utils'

let {
  feature,
  items,
}: {
  feature: Feature
  items?: import('../FeatureCardContent.types').FeaturePropertyItem[]
} = $props()

const appCtx = getSurfaceCtx()
const responsiveCtx = getResponsiveCtx()
const surfaceLayout = getSurfaceLayoutCtx() ?? new SurfaceLayout(responsiveCtx)
const userPreferences = $derived(appCtx.getUserPreferences())
const responsiveWidth = $derived(
  getFeatureCardResponsiveWidth(responsiveCtx, surfaceLayout),
)
const layout = $derived(
  getFeatureCardLayout({
    width: responsiveCtx.visibleWindowWidth,
    height: responsiveCtx.visibleWindowHeight,
    responsiveWidth,
  }),
)

const featureProperties = $derived(
  getFeatureCardDisplayProperties(appCtx, feature.layerId, feature).filter(
    property =>
      property.property?.key !== 'grade' &&
      getFPI18n(property, userPreferences) !== '-' &&
      getFPI18n(property, userPreferences) !== m.great_crazy_squid_promise(),
  ),
)
const featurePropertyItems = $derived.by(
  () =>
    items ??
    featureProperties.map(property => ({
      id: property.propertyId,
      label: getI18n(property.property, 'label', userPreferences),
      value:
        property.property?.dataType === 'link'
          ? (() => {
              const display = getFeaturePropertyDisplay(property, userPreferences)
              return display.kind === 'links'
                ? display.links
                    .map((link, index) =>
                      display.numbered ? `${index + 1} ↗` : `${link.label} ↗`,
                    )
                    .join('  ')
                : getFPI18n(property, userPreferences)
            })()
          : getFPI18n(property, userPreferences),
      display: getFeaturePropertyDisplay(property, userPreferences),
    })),
)

let availableWidth = $state(0)
let containerElement: HTMLDivElement | null = $state(null)
const layoutResult = $derived.by(() =>
  resolveFeaturePropertyLayout(featurePropertyItems, Math.max(availableWidth, 0), 12),
)

$effect(() => {
  if (!containerElement) return

  const observer = new ResizeObserver(entries => {
    availableWidth = entries[0]?.contentRect.width ?? 0
  })

  observer.observe(containerElement)

  return () => observer.disconnect()
})
</script>

<div
  bind:this={containerElement}
  class="pointer-events-auto min-h-0 overflow-hidden pr-[var(--feature-card-content-padding)] pl-[calc(var(--feature-card-content-padding)+4px)]"
>
  <div
    class="grid items-start gap-x-3 gap-y-2"
    style={`grid-template-columns: ${layoutResult.templateColumns}; grid-template-rows: ${layoutResult.rowHeights.map(height => `${height}px`).join(' ')};`}
  >
    {#each featurePropertyItems as property, index (property.id)}
      {@const cell = layoutResult.cells[index]}
      <div
        class="flex min-w-0 flex-col justify-start"
        style={`grid-column: ${(cell?.column ?? 0) + 1} / span ${cell?.colSpan ?? 1}; grid-row: ${(cell?.row ?? 0) + 1};`}
      >
        <span
          class="font-mono text-xs font-normal uppercase leading-4 text-muted-foreground"
        >
          {property.label}
        </span>
        <div
          class={`mt-0.5 overflow-hidden break-words text-base font-medium leading-[22px] ${
            property.display?.kind === 'links'
              ? 'max-h-[88px] overflow-y-auto overscroll-contain pr-1'
              : layoutResult.cellOverflowIds.has(property.id)
                ? 'max-h-[4.1rem] overflow-y-auto overscroll-contain pr-1'
                : ''
          }`}
          style={`display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: ${
            property.display?.kind === 'links' ? 'unset' : (cell?.scrollAfterLines ?? 2)
          };`}
        >
          <FeaturePropertyValue display={property.display} value={property.value} />
        </div>
      </div>
    {/each}
  </div>
</div>
