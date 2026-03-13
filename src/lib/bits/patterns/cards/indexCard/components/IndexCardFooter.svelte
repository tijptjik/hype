<script lang="ts">
import { tick } from 'svelte'
import { SimpleTooltip } from '$lib/bits/core'
import type { IndexCardFooterProps } from '../indexCard.types'

let { status = null, breadcrumbs = [], cardWidth = 0 }: IndexCardFooterProps = $props()

let statusMeasureContainer: HTMLSpanElement | null = $state(null)
let breadcrumbMeasureContainer: HTMLDivElement | null = $state(null)
let visibleBreadcrumbCount = $state(breadcrumbs.length)
let measuredStatusWidth = $state(0)
let measuredBreadcrumbGap = $state(0)
let measuredBreadcrumbWidths = $state<number[]>([])

const FOOTER_HORIZONTAL_PADDING_PX = 48
const FOOTER_CLUSTER_GAP_PX = 12

function getBreadcrumbGap(element: HTMLElement): number {
  const styles = window.getComputedStyle(element)
  return Number.parseFloat(styles.columnGap || styles.gap || '0') || 0
}

function updateVisibleBreadcrumbs(): void {
  visibleBreadcrumbCount = breadcrumbs.length

  if (measuredBreadcrumbWidths.length <= 1) {
    return
  }

  const footerContentWidth = Math.max(0, cardWidth - FOOTER_HORIZONTAL_PADDING_PX)
  const availableWidth = Math.max(
    0,
    footerContentWidth -
      measuredStatusWidth -
      (measuredStatusWidth > 0 && breadcrumbs.length > 0 ? FOOTER_CLUSTER_GAP_PX : 0),
  )

  if (!availableWidth) {
    visibleBreadcrumbCount = 1
    return
  }

  let visibleCount = measuredBreadcrumbWidths.length

  while (visibleCount > 1) {
    const width = measuredBreadcrumbWidths
      .slice(0, visibleCount)
      .reduce((total, elementWidth) => total + elementWidth, 0)
    const totalWidth = width + measuredBreadcrumbGap * Math.max(0, visibleCount - 1)

    if (totalWidth <= availableWidth) break
    visibleCount -= 1
  }

  visibleBreadcrumbCount = visibleCount
}

$effect(() => {
  breadcrumbs
  status
  void (async () => {
    await tick()

    measuredStatusWidth = statusMeasureContainer?.getBoundingClientRect().width ?? 0
    measuredBreadcrumbGap = breadcrumbMeasureContainer
      ? getBreadcrumbGap(breadcrumbMeasureContainer)
      : 0
    measuredBreadcrumbWidths = breadcrumbMeasureContainer
      ? Array.from(
          breadcrumbMeasureContainer.querySelectorAll<HTMLElement>(
            '.bits-index-card__crumb',
          ),
        ).map(element => element.getBoundingClientRect().width)
      : []

    updateVisibleBreadcrumbs()
  })()
})

$effect(() => {
  cardWidth
  measuredStatusWidth
  measuredBreadcrumbGap
  measuredBreadcrumbWidths
  updateVisibleBreadcrumbs()
})
</script>

<footer class="bits-index-card__footer">
  <div class="bits-index-card__footer-left">
    {#if status}
      <SimpleTooltip disabled={!status.tooltip}>
        {#snippet trigger()}
          <span
            class={[
              'bits-index-card__status',
              'bits-index-card__status-shell',
              status.tone === 'published' ? 'bits-index-card__status--published' : '',
              status.tone === 'draft' ? 'bits-index-card__status--draft' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {#if status.icon}
              {@const StatusIcon = status.icon}
              <span class="bits-index-card__status-icon" aria-hidden="true">
                <StatusIcon />
              </span>
            {/if}
            {#if status.label}
              <span class="bits-index-card__status-label">{status.label}</span>
            {/if}
          </span>
        {/snippet}
        {status.tooltip}
      </SimpleTooltip>
    {/if}
  </div>

  <div class="bits-index-card__footer-right">
    <div class="bits-index-card__breadcrumbs-slot">
      <div class="bits-index-card__breadcrumbs bits-index-card__meta">
        {#each breadcrumbs.slice(0, visibleBreadcrumbCount) as breadcrumb, index (index)}
          <SimpleTooltip disabled={!breadcrumb.tooltip}>
            {#snippet trigger()}
              <span class="bits-index-card__crumb">
                <span class="bits-index-card__crumb-label">{breadcrumb.label}</span>
                {#if breadcrumb.icon}
                  {@const BreadcrumbIcon = breadcrumb.icon}
                  <span
                    class={['bits-index-card__crumb-icon', breadcrumb.iconClass]
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden="true"
                  >
                    <BreadcrumbIcon />
                  </span>
                {/if}
              </span>
            {/snippet}
            {breadcrumb.tooltip}
          </SimpleTooltip>
        {/each}
      </div>

      <span
        bind:this={statusMeasureContainer}
        class="bits-index-card__status bits-index-card__status-shell bits-index-card__status--measure"
        aria-hidden="true"
      >
        {#if status?.icon}
          {@const StatusIcon = status.icon}
          <span class="bits-index-card__status-icon"> <StatusIcon /> </span>
        {/if}
        {#if status?.label}
          <span class="bits-index-card__status-label">{status.label}</span>
        {/if}
      </span>

      <div
        bind:this={breadcrumbMeasureContainer}
        class="bits-index-card__breadcrumbs bits-index-card__breadcrumbs--measure bits-index-card__meta"
        aria-hidden="true"
      >
        {#each breadcrumbs as breadcrumb, index (index)}
          <span class="bits-index-card__crumb">
            <span class="bits-index-card__crumb-label">{breadcrumb.label}</span>
            {#if breadcrumb.icon}
              {@const BreadcrumbIcon = breadcrumb.icon}
              <span
                class={['bits-index-card__crumb-icon', breadcrumb.iconClass]
                  .filter(Boolean)
                  .join(' ')}
              >
                <BreadcrumbIcon />
              </span>
            {/if}
          </span>
        {/each}
      </div>
    </div>
  </div>
</footer>
