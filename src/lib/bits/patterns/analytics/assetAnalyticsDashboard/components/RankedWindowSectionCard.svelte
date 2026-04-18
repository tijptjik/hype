<script lang="ts">
// BITS
import * as AnalyticsCardPrimitive from '$lib/bits/custom/analyticsCard/components'
import { cx } from '$lib/bits/utils'
// I18N
import { m } from '$lib/i18n'
// LOCAL
import ImagePopoverCell from './ImagePopoverCell.svelte'
import {
  formatAnalyticsCount,
  toAnalyticsTransformationBadges,
  type AnalyticsTransformationBadge,
} from '../assetAnalyticsDashboard.utils'
// TYPES
import type {
  AssetAnalyticsRankedImage,
  AssetAnalyticsRankedTransformation,
} from '$lib/types'
import type {
  AssetAnalyticsDashboardWindowSectionKind,
  AssetAnalyticsRankedWindowSectionCardProps,
} from '../assetAnalyticsDashboard.types'

let {
  kind,
  windowData,
  windowError,
  assetEnvironment,
}: AssetAnalyticsRankedWindowSectionCardProps = $props()

const sectionCopy: Record<
  AssetAnalyticsDashboardWindowSectionKind,
  {
    header: string
    tooltip: string
    empty: string
  }
> = {
  transformations: {
    header: 'Transformations',
    tooltip: 'Top requested transformation signatures for this time window.',
    empty: 'No transformation requests recorded.',
  },
  images: {
    header: 'Images',
    tooltip: 'Most requested public IDs in this time window.',
    empty: 'No image requests recorded.',
  },
  missingImages: {
    header: 'Missing images',
    tooltip: 'Most requested public IDs that returned 404 in this time window.',
    empty: 'No missing-image requests recorded.',
  },
  serverErrorImages: {
    header: '5xx assets',
    tooltip: 'Most requested public IDs that returned 5xx errors in this time window.',
    empty: 'No 5xx asset requests recorded.',
  },
}

function getTransformationBadges(transformKey: string): AnalyticsTransformationBadge[] {
  return toAnalyticsTransformationBadges(transformKey)
}

function getBadgeClass(category: AnalyticsTransformationBadge['category']): string {
  if (category === 'cropMode') return 'border-primary/35 bg-primary/15 text-primary'
  if (category === 'gravity') return 'border-accent/35 bg-accent/15 text-accent'
  if (category === 'quality')
    return 'border-secondary/35 bg-secondary/15 text-secondary'
  if (category === 'format') return 'border-info/35 bg-info/15 text-info'
  if (category === 'dimensions') return 'border-warning/35 bg-warning/15 text-warning'

  return 'border-base-300 bg-[#121212] text-foreground'
}

function getItems():
  | AssetAnalyticsRankedTransformation[]
  | AssetAnalyticsRankedImage[] {
  if (!windowData) return []
  if (kind === 'transformations') return windowData.topTransformations
  if (kind === 'images') return windowData.topImages
  if (kind === 'missingImages') return windowData.topMissingImages
  return windowData.topServerErrorImages
}

const items = $derived(getItems())
</script>

<section
  class="min-h-0 rounded-[1.4rem] border border-base-300 bg-[#121212] px-4 pt-4 pb-6"
>
  <div class="mb-3 flex items-start justify-between gap-3">
    <AnalyticsCardPrimitive.SectionHeader
      class="min-w-0 flex-1"
      title={sectionCopy[kind].header}
      tooltip={sectionCopy[kind].tooltip}
    />
    <span class="text-xs text-foreground-alt"
      >{formatAnalyticsCount(items.length)}</span
    >
  </div>

  {#if !windowData}
    <AnalyticsCardPrimitive.EmptyState
      title={windowError ? 'Analytics window unavailable' : 'No analytics window available'}
      description={windowError
        ? windowError
        : 'This time range has not been emitted by the analytics engine yet.'}
    />
  {:else if items.length === 0}
    <p class="text-sm text-foreground-alt">{sectionCopy[kind].empty}</p>
  {:else if kind === 'transformations'}
    <div class="max-h-[24rem] overflow-y-auto">
      <table class="w-full text-left text-sm">
        <thead
          class="sticky top-0 text-xs uppercase tracking-[0.18em] text-foreground-alt"
        >
          <tr>
            <th class="pb-2 pr-3 font-medium">Instructions</th>
            <th class="w-[5.5rem] pb-2 text-right font-medium">Requests</th>
          </tr>
        </thead>
        <tbody>
          {#each (items as AssetAnalyticsRankedTransformation[]).slice(0, 25) as item}
            <tr class="border-t border-white/8 align-top">
              <td class="py-2 pr-3">
                <div class="flex max-w-full flex-wrap gap-1.5">
                  {#each getTransformationBadges(item.transformKey) as badge}
                    <span
                      class={cx(
                        'inline-flex grow items-center justify-center rounded-full border px-2 py-1 text-[11px] font-medium',
                        getBadgeClass(badge.category),
                      )}
                    >
                      {badge.label}
                    </span>
                  {/each}
                </div>
              </td>
              <td class="w-14 py-2 text-right text-foreground">
                {formatAnalyticsCount(item.requests)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="max-h-[24rem] overflow-y-auto">
      <table class="w-full table-fixed text-left text-sm">
        <thead
          class="sticky top-0 text-xs uppercase tracking-[0.18em] text-foreground-alt"
        >
          <tr>
            <th class="pb-2 pr-3 font-medium">{m.analytics__public_id()}</th>
            <th class="pb-2 text-right font-medium">
              {kind === 'missingImages' ? '404s' : kind === 'serverErrorImages' ? '5xx' : 'Requests'}
            </th>
          </tr>
        </thead>
        <tbody>
          {#each (items as AssetAnalyticsRankedImage[]).slice(0, 25) as item}
            <tr class="border-t border-white/8 align-top">
              <td class="py-2 pr-3">
                <ImagePopoverCell
                  publicId={item.publicId}
                  environment={assetEnvironment}
                />
              </td>
              <td
                class={cx(
                  'py-2 text-right',
                  kind === 'missingImages'
                    ? 'text-warning'
                    : kind === 'serverErrorImages'
                      ? 'text-error'
                      : 'text-foreground',
                )}
              >
                {formatAnalyticsCount(item.requests)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
