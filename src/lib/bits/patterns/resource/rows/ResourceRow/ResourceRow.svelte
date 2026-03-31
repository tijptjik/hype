<script lang="ts">
// BITS
import { SimpleTooltip } from '$lib/bits/core'
import { Row } from '$lib/bits/custom'
import { ResourceStatusBadge } from '$lib/bits'
import {
  getResourceRowMetaGridClass,
  getResourceRowClass,
  getResourceRowMetaItemClass,
  getResourceRowMetaLabelClass,
  getResourceRowStatusClass,
  resourceRowMetaCellClass,
  resourceRowMetaIconClass,
  resourceRowMetaIconSvgClass,
  resourceRowStatusRailClass,
} from '$lib/bits/custom/rows/row.styles'
// TYPES
import type { ResourceRowProps } from './resourceRow.types'

let {
  index,
  isSelected = false,
  title,
  description,
  imageSrc,
  imageAlt,
  footerStatus = null,
  breadcrumbs = [],
  breadcrumbColumnCount = breadcrumbs.length,
  breadcrumbVariant = 'default',
  onNavigate,
  onImageClick,
}: ResourceRowProps = $props()

const resolvedBreadcrumbColumnCount = $derived(Math.max(0, breadcrumbColumnCount))
const reversedBreadcrumbs = $derived(
  [...breadcrumbs].reverse().slice(0, resolvedBreadcrumbColumnCount),
)
const nonFocusableTooltipTriggerProps = { tabindex: -1 }

function handleNavigate(event: MouseEvent | KeyboardEvent): void {
  onNavigate?.(event)
}

function handleRowKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    handleNavigate(event)
    return
  }

  if (event.key !== ' ') {
    return
  }

  event.preventDefault()

  if (onImageClick) {
    onImageClick()
    return
  }

  handleNavigate(event)
}

function handleImageClick(): void {
  onImageClick?.()
}

function handleTitleClick(): void {
  handleNavigate(new MouseEvent('click'))
}

function handleDescriptionClick(): void {
  handleNavigate(new MouseEvent('click'))
}

const statusTone = $derived.by(() => {
  if (footerStatus?.tone === 'published') {
    return 'success'
  }

  if (footerStatus?.tone === 'draft') {
    return 'warning'
  }

  return 'neutral'
})
</script>

<Row
  {index}
  {isSelected}
  class={getResourceRowClass({
    breadcrumbColumnCount: resolvedBreadcrumbColumnCount,
    breadcrumbVariant,
  })}
  onclick={event => handleNavigate(event)}
  onkeydown={handleRowKeyDown}
  {imageSrc}
  alt={imageAlt}
  onImageClick={onImageClick ? handleImageClick : undefined}
  {title}
  onTitleClick={handleTitleClick}
  {description}
  onDescriptionClick={handleDescriptionClick}
>
  {#if resolvedBreadcrumbColumnCount > 0}
    <div
      class={getResourceRowMetaGridClass({
        breadcrumbColumnCount: resolvedBreadcrumbColumnCount,
        breadcrumbVariant,
      })}
    >
      {#each Array.from({ length: resolvedBreadcrumbColumnCount }, (_, index) => index) as columnIndex (columnIndex)}
        {@const breadcrumb = reversedBreadcrumbs[columnIndex]}
        <div class={resourceRowMetaCellClass}>
          {#if breadcrumb}
            <SimpleTooltip
              disabled={!breadcrumb.tooltip}
              triggerProps={nonFocusableTooltipTriggerProps}
            >
              {#snippet trigger()}
                <div class={getResourceRowMetaItemClass(breadcrumbVariant)}>
                  {#if breadcrumb.icon}
                    {@const BreadcrumbIcon = breadcrumb.icon}
                    <span
                      class={[resourceRowMetaIconClass, breadcrumb.iconClass]
                        .filter(Boolean)
                        .join(' ')}
                      aria-hidden="true"
                    >
                      <BreadcrumbIcon class={resourceRowMetaIconSvgClass} />
                    </span>
                  {:else}
                    <span class={resourceRowMetaIconClass}></span>
                  {/if}
                  <span class={getResourceRowMetaLabelClass(breadcrumbVariant)}
                    >{breadcrumb.label}</span
                  >
                </div>
              {/snippet}
              {breadcrumb.tooltip}
            </SimpleTooltip>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if footerStatus}
    <div class={resourceRowStatusRailClass}>
      <SimpleTooltip
        disabled={!footerStatus.tooltip}
        triggerProps={nonFocusableTooltipTriggerProps}
      >
        {#snippet trigger()}
          <ResourceStatusBadge
            label={footerStatus.label ?? ''}
            tone={statusTone}
            icon={footerStatus.icon}
            class={getResourceRowStatusClass({ tone: footerStatus.tone })}
          />
        {/snippet}
        {footerStatus.tooltip}
      </SimpleTooltip>
    </div>
  {/if}
</Row>
