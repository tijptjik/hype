<script lang="ts">
import { tick } from 'svelte'
import { SimpleTooltip } from '$lib/bits/core'
import type { IndexCardFooterProps } from '../indexCard.types'

let { status = null, breadcrumbs = [], cardWidth = 0 }: IndexCardFooterProps = $props()
const nonFocusableTooltipTriggerProps = { tabindex: -1 }

let breadcrumbMeasureContainer: HTMLDivElement | null = $state(null)
let breadcrumbSlotWidth = $state(0)
let visibleBreadcrumbCount = $state(breadcrumbs.length)
let measuredBreadcrumbGap = $state(0)
let measuredBreadcrumbWidths = $state<number[]>([])
let lastMeasuredBreadcrumbKey = ''
let measureRequestId = 0

function getBreadcrumbGap(element: HTMLElement): number {
  const styles = window.getComputedStyle(element)
  return Number.parseFloat(styles.columnGap || styles.gap || '0') || 0
}

function getBreadcrumbMeasureKey(): string {
  return breadcrumbs
    .map(breadcrumb =>
      [
        breadcrumb.label,
        breadcrumb.icon ? 'icon' : 'no-icon',
        breadcrumb.iconClass ?? '',
      ].join('|'),
    )
    .join('||')
}

function updateVisibleBreadcrumbs(): void {
  if (breadcrumbs.length === 0) {
    visibleBreadcrumbCount = 0
    return
  }

  if (breadcrumbs.length === 1 || measuredBreadcrumbWidths.length <= 1) {
    visibleBreadcrumbCount = breadcrumbs.length
    return
  }

  const availableWidth = Math.max(0, breadcrumbSlotWidth || cardWidth)

  if (!availableWidth) {
    visibleBreadcrumbCount = 1
    return
  }

  let visibleCount = Math.min(breadcrumbs.length, measuredBreadcrumbWidths.length)

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
  const breadcrumbKey = getBreadcrumbMeasureKey()

  if (!breadcrumbKey) {
    lastMeasuredBreadcrumbKey = ''
    measuredBreadcrumbGap = 0
    measuredBreadcrumbWidths = []
    visibleBreadcrumbCount = 0
    return
  }

  if (breadcrumbKey === lastMeasuredBreadcrumbKey) return

  const requestId = measureRequestId + 1
  measureRequestId = requestId

  void (async () => {
    await tick()

    if (requestId !== measureRequestId) return
    if (!breadcrumbMeasureContainer) return

    measuredBreadcrumbGap = getBreadcrumbGap(breadcrumbMeasureContainer)
    measuredBreadcrumbWidths = Array.from(
      breadcrumbMeasureContainer.querySelectorAll<HTMLElement>(
        '.bits-index-card__crumb',
      ),
    ).map(element => element.getBoundingClientRect().width)
    lastMeasuredBreadcrumbKey = breadcrumbKey

    updateVisibleBreadcrumbs()
  })()
})

$effect(() => {
  cardWidth
  breadcrumbSlotWidth
  measuredBreadcrumbGap
  measuredBreadcrumbWidths
  breadcrumbs.length
  updateVisibleBreadcrumbs()
})
</script>

<footer class="bits-index-card__footer">
  <div class="bits-index-card__footer-left">
    {#if status}
      <SimpleTooltip
        disabled={!status.tooltip}
        triggerProps={nonFocusableTooltipTriggerProps}
      >
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
    <div
      bind:clientWidth={breadcrumbSlotWidth}
      class="bits-index-card__breadcrumbs-slot"
    >
      <div class="bits-index-card__breadcrumbs bits-index-card__meta">
        {#each breadcrumbs.slice(0, visibleBreadcrumbCount) as breadcrumb, index (index)}
          <SimpleTooltip
            disabled={!breadcrumb.tooltip}
            triggerProps={nonFocusableTooltipTriggerProps}
          >
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
