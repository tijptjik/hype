<script lang="ts">
import { tick } from 'svelte'
// BITS COMPONENTS
import { SimpleTooltip } from '$lib/bits/core'
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import EyeIcon from 'virtual:icons/lucide/eye'
import EyeOffIcon from 'virtual:icons/lucide/eye-off'
import LayersIcon from 'virtual:icons/lucide/layers-3'
import OrganisationIcon from 'virtual:icons/lucide/users-round'
import ProjectIcon from 'virtual:icons/lucide/layout-grid'
// TYPES
import type { EntityCardFooterProps } from '../entityCard.types'

let {
  publicationState = null,
  shortLabel = '',
  breadcrumbs = [],
  cardWidth = 0,
}: EntityCardFooterProps = $props()

let statusMeasureContainer: HTMLSpanElement | null = $state(null)
let breadcrumbMeasureContainer: HTMLDivElement | null = $state(null)
let visibleBreadcrumbCount = $state(breadcrumbs.length)
let measuredStatusWidth = $state(0)
let measuredBreadcrumbGap = $state(0)
let measuredBreadcrumbWidths = $state<number[]>([])

const FOOTER_HORIZONTAL_PADDING_PX = 48
const FOOTER_CLUSTER_GAP_PX = 12

function getBreadcrumbIcon(
  kind: NonNullable<EntityCardFooterProps['breadcrumbs']>[number]['kind'],
) {
  switch (kind) {
    case 'organisation':
      return OrganisationIcon
    case 'project':
      return ProjectIcon
    case 'layer':
      return LayersIcon
  }
}

function getBreadcrumbTooltipLabel(
  kind: NonNullable<EntityCardFooterProps['breadcrumbs']>[number]['kind'],
): string {
  switch (kind) {
    case 'organisation':
      return m.field_organisation()
    case 'project':
      return m.deft_mealy_ant_vent()
    case 'layer':
      return m.active_bold_cobra_grin()
  }
}

function getBreadcrumbGap(element: HTMLElement): number {
  const styles = window.getComputedStyle(element)
  return Number.parseFloat(styles.columnGap || styles.gap || '0') || 0
}

function updateVisibleBreadcrumbs(): void {
  visibleBreadcrumbCount = breadcrumbs.length
  const footerContentWidth = Math.max(0, cardWidth - FOOTER_HORIZONTAL_PADDING_PX)
  const availableWidth = Math.max(
    0,
    footerContentWidth -
      measuredStatusWidth -
      (measuredStatusWidth > 0 && breadcrumbs.length > 0 ? FOOTER_CLUSTER_GAP_PX : 0),
  )

  if (measuredBreadcrumbWidths.length <= 1) return

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
  shortLabel
  publicationState
  void (async () => {
    await tick()

    measuredStatusWidth = statusMeasureContainer?.getBoundingClientRect().width ?? 0
    measuredBreadcrumbGap = breadcrumbMeasureContainer
      ? getBreadcrumbGap(breadcrumbMeasureContainer)
      : 0
    measuredBreadcrumbWidths = breadcrumbMeasureContainer
      ? Array.from(
          breadcrumbMeasureContainer.querySelectorAll<HTMLElement>(
            '.bits-entity-card__crumb',
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

<footer class="bits-entity-card__footer">
  <div class="bits-entity-card__footer-left">
    {#if publicationState !== null || shortLabel}
      <SimpleTooltip disabled={publicationState === null}>
        {#snippet trigger()}
          <span
            class={[
              'bits-entity-card__status',
              'bits-entity-card__status-shell',
              publicationState === true ? 'bits-entity-card__status--published' : '',
              publicationState === false ? 'bits-entity-card__status--draft' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {#if publicationState !== null}
              <span class="bits-entity-card__status-icon" aria-hidden="true">
                {#if publicationState}
                  <EyeIcon />
                {:else}
                  <EyeOffIcon />
                {/if}
              </span>
            {/if}
            {#if shortLabel}
              <span class="bits-entity-card__status-label">{shortLabel}</span>
            {/if}
          </span>
        {/snippet}
        {publicationState ? m.published() : m.forms__unpublished()}
      </SimpleTooltip>
    {/if}
  </div>

  <div class="bits-entity-card__footer-right">
    <div class="bits-entity-card__breadcrumbs-slot">
      <div class="bits-entity-card__breadcrumbs bits-entity-card__meta">
        {#each breadcrumbs.slice(0, visibleBreadcrumbCount) as breadcrumb (breadcrumb.kind)}
          {@const BreadcrumbIcon = getBreadcrumbIcon(breadcrumb.kind)}
          <SimpleTooltip>
            {#snippet trigger()}
              <span class="bits-entity-card__crumb">
                <span class="bits-entity-card__crumb-label">{breadcrumb.label}</span>
                <span
                  class={`bits-entity-card__crumb-icon bits-entity-card__crumb-icon--${breadcrumb.kind}`}
                  aria-hidden="true"
                >
                  <BreadcrumbIcon />
                </span>
              </span>
            {/snippet}
            {getBreadcrumbTooltipLabel(breadcrumb.kind)}
          </SimpleTooltip>
        {/each}
      </div>

      <span
        bind:this={statusMeasureContainer}
        class="bits-entity-card__status bits-entity-card__status-shell bits-entity-card__status--measure"
        aria-hidden="true"
      >
        {#if publicationState !== null}
          <span class="bits-entity-card__status-icon">
            {#if publicationState}
              <EyeIcon />
            {:else}
              <EyeOffIcon />
            {/if}
          </span>
        {/if}
        {#if shortLabel}
          <span class="bits-entity-card__status-label">{shortLabel}</span>
        {/if}
      </span>

      <div
        bind:this={breadcrumbMeasureContainer}
        class="bits-entity-card__breadcrumbs bits-entity-card__breadcrumbs--measure bits-entity-card__meta"
        aria-hidden="true"
      >
        {#each breadcrumbs as breadcrumb (breadcrumb.kind)}
          {@const BreadcrumbIcon = getBreadcrumbIcon(breadcrumb.kind)}
          <span class="bits-entity-card__crumb">
            <span class="bits-entity-card__crumb-label">{breadcrumb.label}</span>
            <span
              class={`bits-entity-card__crumb-icon bits-entity-card__crumb-icon--${breadcrumb.kind}`}
            >
              <BreadcrumbIcon />
            </span>
          </span>
        {/each}
      </div>
    </div>
  </div>
</footer>
