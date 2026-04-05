<script lang="ts">
// SERVICES
import { getFeatureCardDisplayProperties } from '$lib/client/services/property'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// I18N
import { getFPI18n, getI18n, m } from '$lib/i18n'
// TYPES
import type { Feature } from '$lib/db/zod/schema/feature.types'
// LOCAL
import {
  getFeatureCardLayout,
  resolveFeaturePropertyLayout,
} from '../../featureCard.layout'

let {
  feature,
  items,
}: {
  feature: Feature
  items?: Array<{ id: string; label: string; value: string }>
} = $props()

const appCtx = getAppCtx()
const responsiveCtx = getResponsiveCtx()
const userPreferences = $derived(appCtx.getUserPreferences())
const layout = $derived(
  getFeatureCardLayout({
    width: responsiveCtx.visibleWindowWidth,
    height: responsiveCtx.visibleWindowHeight,
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
      value: getFPI18n(property, userPreferences),
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
  class="pointer-events-auto min-h-0 overflow-hidden px-[var(--feature-card-content-padding)]"
>
  <div
    class="grid items-start gap-x-3 gap-y-2 w-120:gap-x-4"
    style={`grid-template-columns: ${layoutResult.templateColumns};`}
  >
    {#each featurePropertyItems as property, index (property.id)}
      {@const cell = layoutResult.cells[index]}
      <div
        class="flex min-w-0 flex-col justify-start"
        style={`grid-column: ${(cell?.column ?? 0) + 1} / span ${cell?.colSpan ?? 1}; grid-row: ${(cell?.row ?? 0) + 1};`}
      >
        <span
          class="font-mono text-xs font-normal uppercase tracking-wide text-gray-400"
        >
          {property.label}
        </span>
        <div
          class={`mt-0.5 overflow-hidden font-medium leading-[1.35] ${
            layoutResult.cellOverflowIds.has(property.id)
              ? 'max-h-[4.1rem] overflow-y-auto overscroll-contain pr-1'
              : ''
          }`}
          style={`display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: ${
            layoutResult.cellOverflowIds.has(property.id) ? 3 : 2
          };`}
        >
          {property.value}
        </div>
      </div>
    {/each}
  </div>
</div>
