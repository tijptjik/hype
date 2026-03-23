<script lang="ts">
// BITS
import { Row } from '$lib/bits/custom'
import * as VirtualListPrimitive from '$lib/bits/custom/index/src'
import StatsPips from '$lib/bits/custom/featureStats/components/StatsPips.svelte'
import * as FeatureRowPrimitive from './components'
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// ICONS
import DatabaseIcon from 'virtual:icons/lucide/database'
import BookOpenIcon from 'virtual:icons/lucide/book-open'
import LanguagesIcon from 'virtual:icons/lucide/languages'
import ImageIcon from 'virtual:icons/lucide/image'
import TagsIcon from 'virtual:icons/lucide/tags'
import PenIcon from 'virtual:icons/lucide/pen'
// I18N
import { m } from '$lib/i18n'
// SERVICES
import { getFeatureIdenticonUrl } from '$lib/client/services/image'
// TYPES
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { FeatureRowStatMap } from '$lib/types'
import type { FeatureRowProps } from './featureRow.types'

let {
  adminCtx,
  entity,
  model,
  index,
  onImageClick,
  isSelected = false,
}: FeatureRowProps = $props()

const statSections = $derived([
  {
    key: 'status',
    title: m.filters__status(),
    icon: DatabaseIcon,
    statuses: model.stats.status,
    className: 'bits-resource-row-stats__status',
  },
  {
    key: 'content',
    title: m.filters__content(),
    icon: BookOpenIcon,
    statuses: model.stats.content,
    className: 'bits-resource-row-stats__content',
  },
  {
    key: 'translation',
    title: m.filters__translation(),
    icon: LanguagesIcon,
    statuses: model.stats.translation,
    className: 'bits-resource-row-stats__translation',
  },
  {
    key: 'image',
    title: m.organisation__images(),
    icon: ImageIcon,
    statuses: model.stats.image,
    className: 'bits-resource-row-stats__image',
  },
  {
    key: 'category',
    title: m.filters__categories(),
    icon: TagsIcon,
    statuses: model.stats.category,
    className: 'bits-resource-row-stats__category',
  },
  {
    key: 'specifier',
    title: m.admin__forms_common_specifiers_short(),
    icon: PenIcon,
    statuses: model.stats.freeform,
    className: 'bits-resource-row-stats__specifier',
  },
])

function toPlaceholderStatuses(statuses: FeatureRowStatMap): string[] {
  return Object.keys(statuses)
}

const fallbackImageSrc = $derived(
  entity.image
    ? undefined
    : getFeatureIdenticonUrl(`${entity.id}:${model.title || 'feature'}`),
)

function handleRowKeyDown(event: KeyboardEvent): void {
  if (isSelected) return

  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    navigateOnAdmin(adminCtx, FirstClassResource.feature, entity.id)
    return
  }

  if (event.key === ' ' || event.key === 'Space') {
    event.preventDefault()
    event.stopPropagation()
    if (entity.image && onImageClick) {
      onImageClick(entity.image as ImageCtxEnvelope, entity)
    }
  }
}

function handleImageClick(image: ImageCtxEnvelope): void {
  onImageClick?.(image, entity)
}

function handleTitleClick(): void {
  navigateOnAdmin(adminCtx, FirstClassResource.feature, entity.id)
}

function handleDescriptionClick(): void {
  navigateOnAdmin(adminCtx, FirstClassResource.feature, entity.id, 'address')
}
</script>

<Row
  {index}
  {isSelected}
  variant="feature"
  onclick={handleTitleClick}
  onkeydown={handleRowKeyDown}
  image={entity.image}
  imageSrc={fallbackImageSrc}
  alt={model.imageAlt}
  onImageClick={entity.image ? (handleImageClick as (image: unknown) => void) : undefined}
  title={model.title || m.deft_dry_chipmunk_blink()}
  onTitleClick={handleTitleClick}
  description={model.description}
  onDescriptionClick={handleDescriptionClick}
>
  <div class="bits-resource-row__stats">
    <VirtualListPrimitive.Secondary>
      {#snippet children()}
        <div class="bits-resource-row-stats">
          {#each statSections as section (section.key)}
            <div class={section.className}>
              <StatsPips
                title={section.title}
                icon={section.icon}
                statuses={section.statuses}
                showTitle={false}
              />
            </div>
          {/each}
        </div>
      {/snippet}
      {#snippet fallback()}
        <div
          class="bits-resource-row-stats bits-resource-row-stats--placeholder"
          aria-hidden="true"
        >
          {#each statSections as section (section.key)}
            {@const PlaceholderIcon = section.icon}
            <div
              class={`${section.className} bits-resource-row-stats__placeholder-column`}
            >
              <div class="bits-theme bits-feature-stat bits-feature-stat--placeholder">
                <span class="bits-feature-stat__title">
                  <PlaceholderIcon class="bits-feature-stat__icon-svg" />
                </span>
                <div class="bits-feature-stat__pips">
                  {#each toPlaceholderStatuses(section.statuses) as pipKey (pipKey)}
                    <span
                      class="bits-feature-stat__pip bits-feature-stat__pip--pending"
                    ></span>
                  {/each}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/snippet}
    </VirtualListPrimitive.Secondary>
  </div>
  <FeatureRowPrimitive.StatusSection
    isPublished={model.isPublished}
    isPendingReview={model.isPendingReview}
  />
</Row>
