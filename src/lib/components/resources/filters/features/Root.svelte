<script lang="ts">
import { tick } from 'svelte'
// I18N
import { m } from '$lib/i18n'
// ANIMATION
import { fly, slide, fade } from 'svelte/transition'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import StatusSection from './Status.svelte'
import ImageSection from './Images.svelte'
import AuthorshipSection from './Authorship.svelte'
import TranslationSection from './Translation.svelte'
import ClassifierSection from './Classifiers.svelte'
import SpecifierSection from './Specifiers.svelte'
import ResourceSortControl from '$lib/components/resources/common/ResourceSortControl.svelte'
// ICONS
import {
  CircleStack,
  Photo,
  Language,
  Tag,
  Pencil,
  Funnel,
  BookOpen,
  XMark,
} from '@steeze-ui/heroicons'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// TYPES
import type {
  FeatureViewFilters,
  FeatureTranslationFilterKey,
  FeatureStatusFilterKey,
  FeatureImageFilterKey,
  FeatureAuthorshipFilterKey,
} from '$lib/types'
import { AppCtx } from '$lib/context/app.svelte'
import { FirstClassResource } from '$lib/enums'

let { count } = $props()

const adminCtx = getAdminCtx()

// STATE
let activeSection: string | null = $state(null)
let showSectionMenu = $derived(
  adminCtx.appCtx.state.ui.controlMode.feature === 'filter',
)
let controlMode = $derived(adminCtx.appCtx.state.ui.controlMode.feature)
let filterControlsElement: HTMLDivElement | undefined = $state()
let filterMenuElement: HTMLDivElement | undefined = $state()
let filterActiveControlsElement: HTMLDivElement | undefined = $state()
let sortCollisionElement: HTMLDivElement | undefined = $state()
let isSortMenuOpen = $state(false)
let isFilterSuppressedByCollision = $state(false)
let shouldRestoreFilterAfterCollision = $state(false)
let collisionCheckTimeout: ReturnType<typeof setTimeout> | null = null
let isSuperAdmin = $derived(
  Boolean(
    adminCtx.appCtx.user &&
      'superAdmin' in adminCtx.appCtx.user &&
      adminCtx.appCtx.user.superAdmin,
  ),
)

// FILTER SECTIONS CONFIG
const filterSections = {
  status: { icon: CircleStack, title: m.filters__status() },
  authorship: { icon: BookOpen, title: m.filters__content() },
  translation: { icon: Language, title: m.filters__translation() },
  image: { icon: Photo, title: m.filters__image() },
  classifier: { icon: Tag, title: m.sunny_day_lemur_conquer_short() },
  specifier: { icon: Pencil, title: m.admin__forms_common_specifiers_short() },
}

const filterKeys: Record<string, (keyof FeatureViewFilters)[]> = {
  status: [
    'isPublished',
    'isPendingReview',
    'isArchived',
    'isIntangible',
    'isVisitable',
  ] as FeatureStatusFilterKey[],
  image: [
    'hasImage',
    'isOneImagePublished',
    'isAllImagePublished',
  ] as FeatureImageFilterKey[],
  authorship: [
    'hasTitle',
    'hasDescription',
    'hasDisplayAddress',
  ] as FeatureAuthorshipFilterKey[],
  translation: [
    'isTitleTranslated',
    'isDescriptionTranslated',
    'isAddressTranslated',
    'isSpecifierTranslated',
  ],
}

const getFilterCount = (section: string) => {
  const featureFilters = adminCtx.appCtx.state.viewFilters.feature
  let count = 0

  if (section === 'status') {
    count = filterKeys[section].filter(filterKey => {
      // isArchived is for SuperAdmin only so we ignore
      return (
        featureFilters[filterKey as FeatureTranslationFilterKey] !== null &&
        filterKey !== 'isArchived'
      )
    }).length
    return count
  }

  if (section === 'translation') {
    filterKeys[section].forEach(featureKey => {
      const filterValue = featureFilters[featureKey as FeatureTranslationFilterKey]
      if (filterValue && typeof filterValue === 'object') {
        Object.values(filterValue).forEach(v => {
          if (v !== null) count++
        })
      }
    })
  } else if (section === 'classifier' || section === 'specifier') {
    // Handle property-based filters (classifiers and specifiers)
    const propertiesFilter = featureFilters.properties
    if (propertiesFilter && typeof propertiesFilter === 'object') {
      const properties = [...adminCtx.appCtx.cache.property.values()].filter(
        p => p.type === (section === 'classifier' ? 'classifier' : 'specifier'),
      )
      properties.forEach(property => {
        if (
          propertiesFilter[property.id] !== null &&
          propertiesFilter[property.id] !== undefined
        ) {
          count++
        }
      })
    }
  } else if (filterKeys[section]) {
    filterKeys[section].forEach(key => {
      if (key === 'isArchived') {
        if (!isSuperAdmin) return
      }
      if (featureFilters[key as keyof FeatureViewFilters] !== null) {
        count++
      }
    })
  }
  return count
}

const totalFilterCount = $derived(() => {
  let total = 0
  for (const section of Object.keys(filterSections)) {
    total += getFilterCount(section)
  }
  return total
})

const COLLISION_SETTLE_DURATION_MS = 340

// HANDLERS
function selectSection(sectionKey: string) {
  if (activeSection == sectionKey) {
    activeSection == null
  }
  activeSection = sectionKey
  showSectionMenu = false
  void resolveFilterCollisionAgainstSort()
}

function handleAnchorHover() {
  if (isFilterSuppressedByCollision) {
    isFilterSuppressedByCollision = false
    void resolveFilterCollisionAgainstSort()
    return
  }

  if (!activeSection) {
    if (showSectionMenu) return
    showSectionMenu = true
    void resolveFilterCollisionAgainstSort()
    return
  }

  showSectionMenu = !showSectionMenu
  void resolveFilterCollisionAgainstSort()
}

function toggleSectionMenu() {
  if (isFilterSuppressedByCollision) {
    isFilterSuppressedByCollision = false
    void resolveFilterCollisionAgainstSort()
    return
  }

  showSectionMenu = !showSectionMenu
  void resolveFilterCollisionAgainstSort()
}

function resetFilters() {
  adminCtx.resetViewFilters()
}

function areRectsOverlapping(left: DOMRect, right: DOMRect): boolean {
  return (
    left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top
  )
}

function clearCollisionCheckTimeout(): void {
  if (!collisionCheckTimeout) return
  clearTimeout(collisionCheckTimeout)
  collisionCheckTimeout = null
}

function getVisibleFilterCollisionElement(): HTMLDivElement | undefined {
  if (showSectionMenu) return filterMenuElement ?? filterControlsElement
  return filterActiveControlsElement ?? filterControlsElement
}

function hasFilterSortCollision(): boolean {
  const collisionTarget = getVisibleFilterCollisionElement()
  if (!collisionTarget || !sortCollisionElement) return false

  return areRectsOverlapping(
    collisionTarget.getBoundingClientRect(),
    sortCollisionElement.getBoundingClientRect(),
  )
}

function applyCollisionState(): boolean {
  const hasCollision = hasFilterSortCollision()
  if (!hasCollision) return false
  isFilterSuppressedByCollision = true
  shouldRestoreFilterAfterCollision = true
  return true
}

function closeSortMenuIfNeeded(): boolean {
  if (!isSortMenuOpen || !hasFilterSortCollision()) return false
  isSortMenuOpen = false
  return true
}

async function resolveFilterCollisionAgainstSort(): Promise<void> {
  if (!isSortMenuOpen || controlMode !== 'filter' || isFilterSuppressedByCollision)
    return

  clearCollisionCheckTimeout()
  collisionCheckTimeout = setTimeout(() => {
    collisionCheckTimeout = null
    void tick().then(() => {
      closeSortMenuIfNeeded()
    })
  }, COLLISION_SETTLE_DURATION_MS)
}

async function handleSortOpenChange(isSortOpen: boolean): Promise<void> {
  if (!isSortOpen) {
    clearCollisionCheckTimeout()
    if (shouldRestoreFilterAfterCollision) {
      isFilterSuppressedByCollision = false
      shouldRestoreFilterAfterCollision = false
    }
    return
  }

  if (controlMode !== 'filter') return

  clearCollisionCheckTimeout()
  isFilterSuppressedByCollision = false
  collisionCheckTimeout = setTimeout(() => {
    collisionCheckTimeout = null
    void tick().then(() => {
      applyCollisionState()
    })
  }, COLLISION_SETTLE_DURATION_MS)
}

$effect(() => {
  return () => {
    clearCollisionCheckTimeout()
  }
})
</script>

<div
  class="relative flex h-16 w-full flex-row items-center justify-between gap-4 bg-base-200"
  transition:slide
>
  {#if controlMode === 'filter'}
    <div
      class="group/sections bg-200 mx-4 flex h-16 items-center gap-4 bg-base-200"
      bind:this={filterControlsElement}
    >
      <!-- Anchor -->
      <div
        class="group/anchor mr-4 flex items-center justify-center opacity-70 transition-opacity duration-300 hover:opacity-100"
        onmouseenter={handleAnchorHover}
      >
        <button
          class="flex h-9 items-center gap-2 rounded-xl border border-base-300 bg-transparent px-4 text-sm font-medium text-base-content/80 transition-colors duration-300 hover:bg-base-300/10 hover:text-base-content"
          onclick={toggleSectionMenu}
        >
          <Icon
            src={activeSection
            ? filterSections[activeSection as keyof typeof filterSections].icon
            : Funnel}
            class="h-4 w-4"
          />
          <span class="hidden sm:inline"
            >{activeSection
            ? filterSections[activeSection as keyof typeof filterSections].title
            : m.filters__filter_by()}</span
          >
        </button>
      </div>
      <div class="relative flex flex-row items-center">
        <!-- SECTION SELECTION MODE: Show all sections horizontally -->
        <div
          class="absolute z-30 flex h-16 items-center gap-2 bg-base-200"
          class:hidden={isFilterSuppressedByCollision}
          bind:this={filterMenuElement}
        >
          <!-- All Section Options -->
          {#each Object.entries(filterSections) as [ key, section ], idx (key)}
            {#if showSectionMenu && activeSection !== key}
              <button
                class="btn btn-ghost btn-sm relative h-10 gap-2 hover:bg-transparent hover:text-white"
                in:fly={{ x: 20, duration: 300, delay: 50 * idx }}
                out:fade={{ duration: 300 }}
                onclick={() => selectSection(key)}
              >
                <Icon src={section.icon} class="h-4 w-4" />
                <span class="hidden lg:inline">{section.title}</span>
                {#if getFilterCount(key) > 0}
                  <div
                    class="badge badge-secondary badge-xs absolute -right-1 -top-1"
                  ></div>
                {/if}
              </button>
            {/if}
          {/each}
        </div>
        <div
          class="absolute z-20 flex w-auto flex-row justify-center gap-2 transition-opacity duration-300 {showSectionMenu
          ? 'opacity-0'
          : 'opacity-100'}"
          class:hidden={isFilterSuppressedByCollision}
          bind:this={filterActiveControlsElement}
        >
          <!-- Active Section Filters -->
          {#if activeSection === 'status'}
            <StatusSection />
          {:else if activeSection === 'image'}
            <ImageSection />
          {:else if activeSection === 'authorship'}
            <AuthorshipSection />
          {:else if activeSection === 'translation'}
            <TranslationSection />
          {:else if activeSection === 'classifier'}
            <ClassifierSection />
          {:else if activeSection === 'specifier'}
            <SpecifierSection />
          {/if}
        </div>
      </div>
    </div>
  {/if}
  <div class="flex items-center gap-4 pr-8 text-base-content/60">
    <div bind:this={sortCollisionElement}>
      <ResourceSortControl
        bind:isOpen={isSortMenuOpen}
        resource={FirstClassResource.feature}
        onOpenChange={handleSortOpenChange}
      />
    </div>
    <div class="text-sm">
      <span>{count}</span>
      <span>{m.busy_flaky_mayfly_chop()}</span>
    </div>
    <button
      class="btn btn-circle btn-ghost btn-sm"
      onclick={resetFilters}
      disabled={totalFilterCount() === 0}
    >
      <Icon src={XMark} class="h-4 w-4" />
    </button>
  </div>
</div>
