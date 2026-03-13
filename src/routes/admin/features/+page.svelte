<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// SERVICES
import {
  createPropertyFilterSection,
  createSortable,
  createSortables,
  createToggleFilter,
  createTranslationFilter,
} from '$lib/client/services/filters'
// COMPONENTS
import FullScreenViewer from '$lib/components/modals/FullScreenViewer.svelte'
import FeatureCard from '$lib/components/resources/cards/FeatureIndexCard.svelte'
// BITS PATTERNS
import {
  CompletionFooter,
  FeatureRow,
  ResourceFilterBar,
  ResourceIndex,
} from '$lib/bits'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// I18N
import { m } from '$lib/i18n'
// ICONS
import FeatureIcon from 'virtual:icons/lucide/map-pin'
import StatusIcon from 'virtual:icons/lucide/circle-dot-dashed'
import BookOpenIcon from 'virtual:icons/lucide/book-open'
import LanguagesIcon from 'virtual:icons/lucide/languages'
import ImageIcon from 'virtual:icons/lucide/image'
import TagsIcon from 'virtual:icons/lucide/tags'
import PenLineIcon from 'virtual:icons/lucide/pen-line'
// TYPES
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { Feature } from '$lib/db/zod/schema/feature.types'
import type { ResourceFilterBarConfig } from '$lib/types'

const filters = {
  resource: FirstClassResource.feature,
  sections: [
    {
      key: 'status',
      title: m.filters__status(),
      icon: StatusIcon,
      filters: [
        createToggleFilter('isPendingReview', {
          label: m.plain_broad_shell_dart(),
          invertBoolean: true,
          falseLabel: m.filters__not(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('isPublished', {
          label: m.published(),
          falseLabel: m.filters__not(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('isVisitable', {
          label: m.dry_aware_squirrel_cheer(),
          falseLabel: m.filters__not(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('isIntangible', {
          label: m.teary_fit_maggot_heart(),
          falseLabel: m.filters__not(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('isArchived', {
          label: m.bad_swift_cheetah_surge(),
          falseLabel: m.filters__not(),
          trueLabel: m.filters__is(),
          superAdminOnly: true,
        }),
      ],
    },
    {
      key: 'authorship',
      title: m.filters__content(),
      icon: BookOpenIcon,
      filters: [
        createToggleFilter('hasTitle', {
          label: m.feature__title(),
          falseLabel: m.filters__no(),
          trueLabel: m.filters__has(),
          transformOffset: 8,
        }),
        createToggleFilter('hasDescription', {
          label: m.feature__description(),
          falseLabel: m.filters__no(),
          trueLabel: m.filters__has(),
          transformOffset: 8,
        }),
        createToggleFilter('hasDisplayAddress', {
          label: m.feature__address(),
          falseLabel: m.filters__no(),
          trueLabel: m.filters__has(),
          transformOffset: 8,
        }),
      ],
    },
    {
      key: 'translation',
      title: m.filters__translation(),
      icon: LanguagesIcon,
      filters: [
        createTranslationFilter('isTitleTranslated', {
          label: m.feature__title(),
        }),
        createTranslationFilter('isDescriptionTranslated', {
          label: m.feature__description(),
        }),
        createTranslationFilter('isAddressTranslated', {
          label: m.feature__address(),
        }),
        createTranslationFilter('isSpecifierTranslated', {
          label: m.spicy_ideal_butterfly_revive(),
          superAdminOnly: true,
        }),
      ],
    },
    {
      key: 'image',
      title: m.filters__image(),
      icon: ImageIcon,
      filters: [
        createToggleFilter('hasImage', {
          label: m.feature__images(),
          falseLabel: m.filters__no(),
          trueLabel: m.awful_ok_polecat_rise(),
          transformOffset: 8,
        }),
        createToggleFilter('isOneImagePublished', {
          label: m.published(),
          falseLabel: m.royal_civil_goldfish_fetch(),
          trueLabel: m.awful_ok_polecat_rise(),
          transformOffset: 8,
        }),
        createToggleFilter('isAllImagePublished', {
          label: m.published(),
          falseLabel: m.filters__not_all(),
          trueLabel: m.filters__all(),
          transformOffset: 8,
        }),
      ],
    },
    createPropertyFilterSection({
      key: 'classifier',
      title: m.sunny_day_lemur_conquer_short(),
      icon: TagsIcon,
      type: 'property',
      propertyType: 'classifier',
    }),
    createPropertyFilterSection({
      key: 'specifier',
      title: m.admin__forms_common_specifiers_short(),
      icon: PenLineIcon,
      type: 'property',
      propertyType: 'specifier',
      falseLabel: m.filters__no(),
      trueLabel: m.filters__has(),
      transformOffset: -10,
    }),
  ],
} satisfies ResourceFilterBarConfig

const sortables = createSortables([
  createSortable('modifiedAt', m.sort__updated()),
  createSortable('createdAt', m.sort__age()),
  createSortable('title', m.feature__title()),
  createSortable('description', m.filters__content()),
  createSortable('displayAddress', m.feature__address()),
])

// CONTEXT
const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()
adminCtx.setFacet(false, false, FirstClassResource.feature)

// STATE
let listContainer: HTMLElement | null = $state(null)

let selectedImage = $state<ImageCtxEnvelope | null>(null)
let selectedFeature = $state<Feature | null>(null)
let selectedFeatureIndex = $state<number>(-1)

let entities: Feature[] = $derived(
  adminCtx.getViewFilteredResource<Feature>(FirstClassResource.feature),
)

$effect(() => {
  headerCtrl.setHeaderForIndex(m.omni__title_features(), FeatureIcon)
  headerCtrl.setControlBar(ResourceFilterBar, {
    resource: FirstClassResource.feature,
    count: entities.length,
    filters,
    sortables,
  })
  headerCtrl.setFooter(CompletionFooter, { entities })
})
// Derived states for navigation capability
let canNavigatePrevious = $derived(() => {
  if (selectedFeatureIndex <= 0) return false
  // Check if there's any feature with an image before the current index
  for (let i = selectedFeatureIndex - 1; i >= 0; i--) {
    if (entities[i]?.image) return true
  }
  return false
})

let canNavigateNext = $derived(() => {
  if (selectedFeatureIndex < 0) return false
  // Check if there's any feature with an image after the current index
  for (let i = selectedFeatureIndex + 1; i < entities.length; i++) {
    if (entities[i]?.image) return true
  }
  return false
})

function openModal(image: ImageCtxEnvelope, feature: Feature) {
  selectedImage = image
  selectedFeature = feature
  selectedFeatureIndex = entities.findIndex(f => f.id === feature.id)
}

function closeModal() {
  // Store the index before clearing state
  const indexToFocus = selectedFeatureIndex
  selectedImage = null
  selectedFeature = null
  selectedFeatureIndex = -1
  // Restore focus to the last active row
  if (indexToFocus >= 0) {
    setTimeout(() => updateRowFocus(indexToFocus), 25)
  }
}

function navigateToNextFeature() {
  if (selectedFeatureIndex < 0) return
  // Find the next feature with an image
  for (let i = selectedFeatureIndex + 1; i < entities.length; i++) {
    const nextFeature = entities[i]
    if (nextFeature?.image) {
      selectedFeature = nextFeature
      selectedImage = nextFeature.image as ImageCtxEnvelope
      selectedFeatureIndex = i
      updateRowFocus(i)
      return
    }
  }
}

function navigateToPreviousFeature() {
  if (selectedFeatureIndex <= 0) return

  // Find the previous feature with an image
  for (let i = selectedFeatureIndex - 1; i >= 0; i--) {
    const prevFeature = entities[i]
    if (prevFeature?.image) {
      selectedFeature = prevFeature
      selectedImage = prevFeature.image as ImageCtxEnvelope
      selectedFeatureIndex = i
      updateRowFocus(i)
      return
    }
  }
}

interface VirtualListViewportElement extends Element {
  scrollToIndex?: (index: number, alignToTop?: boolean, smoothScroll?: boolean) => void
}

function updateRowFocus(index: number) {
  // Use the virtual list's scrollToIndex method
  const virtualList = listContainer?.querySelector(
    'svelte-virtual-list-viewport',
  ) as VirtualListViewportElement | null

  if (virtualList?.scrollToIndex) {
    // Scroll to the index using the virtual list's built-in method
    virtualList.scrollToIndex(index, true, false)

    // Focus the row after scrolling
    setTimeout(() => {
      const rowSelector = `[data-entity-index="${index}"][role="button"]`
      const targetRow = listContainer?.querySelector(rowSelector) as HTMLElement
      if (targetRow) {
        targetRow.focus()
      }
    }, 50)
  } else {
    // Fallback: focus immediately if row is already visible
    setTimeout(() => {
      const rowSelector = `[data-entity-index="${index}"][role="button"]`
      const targetRow = listContainer?.querySelector(rowSelector) as HTMLElement
      if (targetRow) {
        targetRow.focus()
      }
    }, 0)
  }
}
</script>

<ResourceIndex resource={FirstClassResource.feature} {entities} bind:listContainer>
  {#snippet card(entity: Feature)}
    <FeatureIndexCard {entity} />
  {/snippet}
  {#snippet row(entity, index)}
    <FeatureRow
      {entity}
      {index}
      {adminCtx}
      onImageClick={openModal}
      isSelected={selectedFeatureIndex === index && selectedImage !== null}
    />
  {/snippet}
</ResourceIndex>

<!-- MODAL -->
{#if selectedImage && selectedFeature}
  <FullScreenViewer
    appCtx={adminCtx.appCtx}
    {adminCtx}
    image={selectedImage}
    feature={selectedFeature}
    canNavigatePrevious={canNavigatePrevious()}
    canNavigateNext={canNavigateNext()}
    onClose={closeModal}
    onNavigateNext={navigateToNextFeature}
    onNavigatePrevious={navigateToPreviousFeature}
  />
{/if}
