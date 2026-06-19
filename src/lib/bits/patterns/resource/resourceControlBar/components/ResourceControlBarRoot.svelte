<script lang="ts">
// SVELTE
import { tick } from 'svelte'
// COMPONENTS
import FilterCtrl from './ResourceControlBarFilterCtrl.svelte'
import FilterReset from './ResourceControlBarFilterReset.svelte'
import ResultCount from './ResourceControlBarResultCount.svelte'
import SortCtrl from './ResourceControlBarSortCtrl.svelte'
// TYPES
import type { ResourceControlBarRootProps } from './resourceControlBarPrimitives.types'

let {
  filterLabel,
  filterIcon,
  hasActiveSection = false,
  disableMenuToggle = false,
  showBulkEdit = false,
  showSort = true,
  count,
  resetDisabled = false,
  onReset,
  filterMenuContent,
  filterActiveContent,
  sortContent,
  bulkContent,
  class: className = '',
}: ResourceControlBarRootProps = $props()

// ---
/********************
 *  1. LOCAL STATE
 ************/
// +++ Local State

let showMenu = $state(false)
let rootWidth = $state(0)
let filterRootElement: HTMLDivElement | undefined = $state()
let filterMenuElement: HTMLDivElement | undefined = $state()
let filterActiveElement: HTMLDivElement | undefined = $state()
let sortRootElement: HTMLDivElement | undefined = $state()
let isSortOpen = $state(false)
let bulkRootElement: HTMLDivElement | undefined = $state()
let isBulkOpen = $state(false)
let isFilterSuppressedByCollision = $state(false)
let shouldRestoreFilterAfterCollision = $state(false)
let collisionCheckTimeout: ReturnType<typeof setTimeout> | null = $state(null)
let widthChangeDebounceTimeout: ReturnType<typeof setTimeout> | null = $state(null)
let lastResolvedRootWidth = $state<number | null>(null)
let mostRecentOpenedControl = $state<RightControlCollisionOwner | null>(null)

const COLLISION_SETTLE_DURATION_MS = 340
const WIDTH_CHANGE_DEBOUNCE_MS = 40

type RightControlCollisionOwner = 'filter' | 'bulk' | 'sort'

// ---

// ---
/********************
 *  2. LOCAL HELPERS
 ************/
// +++ Local Helpers

function clearCollisionCheckTimeout(): void {
  if (!collisionCheckTimeout) return
  clearTimeout(collisionCheckTimeout)
  collisionCheckTimeout = null
}

function clearWidthChangeDebounceTimeout(): void {
  if (!widthChangeDebounceTimeout) return
  clearTimeout(widthChangeDebounceTimeout)
  widthChangeDebounceTimeout = null
}

function areRectsOverlapping(left: DOMRect, right: DOMRect): boolean {
  return (
    left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top
  )
}

function getVisibleFilterCollisionElement(): HTMLDivElement | undefined {
  if (showMenu) return filterMenuElement ?? filterRootElement
  return filterActiveElement ?? filterRootElement
}

function getVisibleRightCollisionElements(): HTMLDivElement[] {
  const elements: HTMLDivElement[] = []
  if (isBulkOpen && bulkRootElement) elements.push(bulkRootElement)
  if (isSortOpen && sortRootElement) elements.push(sortRootElement)
  return elements
}

function hasFilterRightControlCollision(): boolean {
  const collisionTarget = getVisibleFilterCollisionElement()
  if (!collisionTarget) return false

  const targetRect = collisionTarget.getBoundingClientRect()
  return getVisibleRightCollisionElements().some(element =>
    areRectsOverlapping(targetRect, element.getBoundingClientRect()),
  )
}

function hasFilterBulkCollision(): boolean {
  const collisionTarget = getVisibleFilterCollisionElement()
  if (!collisionTarget || !bulkRootElement || !isBulkOpen) return false

  return areRectsOverlapping(
    collisionTarget.getBoundingClientRect(),
    bulkRootElement.getBoundingClientRect(),
  )
}

function applyCollisionState(): boolean {
  const hasCollision = hasFilterRightControlCollision()
  if (!hasCollision) return false
  isFilterSuppressedByCollision = true
  shouldRestoreFilterAfterCollision = true
  return true
}

function closeBulkMenuIfNeeded(): boolean {
  if (!isBulkOpen || !hasFilterBulkCollision()) return false
  isBulkOpen = false
  shouldRestoreFilterAfterCollision = false
  isFilterSuppressedByCollision = false
  return true
}

function closeSortMenuIfNeeded(): boolean {
  if (!isSortOpen || !hasFilterRightControlCollision()) return false
  isSortOpen = false
  return true
}

async function resolveFilterCollisionAgainstRightControls(
  openedControl: RightControlCollisionOwner | null = null,
): Promise<void> {
  if ((!isSortOpen && !isBulkOpen) || isFilterSuppressedByCollision) return

  const collisionOwner = openedControl ?? mostRecentOpenedControl
  clearCollisionCheckTimeout()
  collisionCheckTimeout = setTimeout(() => {
    collisionCheckTimeout = null
    void tick().then(() => {
      if (collisionOwner === 'filter') {
        closeBulkMenuIfNeeded()
        closeSortMenuIfNeeded()
        return
      }

      if (hasFilterBulkCollision()) {
        applyCollisionState()
        return
      }

      closeSortMenuIfNeeded()
    })
  }, COLLISION_SETTLE_DURATION_MS)
}

async function handleFilterAnchorHover(): Promise<void> {
  if (disableMenuToggle) return

  if (isFilterSuppressedByCollision) {
    mostRecentOpenedControl = 'filter'
    isFilterSuppressedByCollision = false
    void resolveFilterCollisionAgainstRightControls('filter')
    return
  }

  if (!hasActiveSection) {
    if (showMenu) return
    mostRecentOpenedControl = 'filter'
    showMenu = true
    void resolveFilterCollisionAgainstRightControls('filter')
    return
  }

  const nextShowMenu = !showMenu
  if (nextShowMenu) {
    mostRecentOpenedControl = 'filter'
  }
  showMenu = !showMenu
  void resolveFilterCollisionAgainstRightControls(nextShowMenu ? 'filter' : null)
}

async function handleFilterAnchorClick(_event: MouseEvent): Promise<void> {
  if (disableMenuToggle) return

  if (isFilterSuppressedByCollision) {
    mostRecentOpenedControl = 'filter'
    isFilterSuppressedByCollision = false
    void resolveFilterCollisionAgainstRightControls('filter')
    return
  }

  const nextShowMenu = !showMenu
  if (nextShowMenu) {
    mostRecentOpenedControl = 'filter'
  }
  showMenu = nextShowMenu
  void resolveFilterCollisionAgainstRightControls(nextShowMenu ? 'filter' : null)
}

async function handleSortOpenChange(isOpen: boolean): Promise<void> {
  isSortOpen = isOpen

  if (!isOpen) {
    clearCollisionCheckTimeout()
    if (shouldRestoreFilterAfterCollision) {
      isFilterSuppressedByCollision = false
      shouldRestoreFilterAfterCollision = false
    }
    return
  }

  mostRecentOpenedControl = 'sort'
  clearCollisionCheckTimeout()
  isFilterSuppressedByCollision = false
  collisionCheckTimeout = setTimeout(() => {
    collisionCheckTimeout = null
    void tick().then(() => {
      applyCollisionState()
    })
  }, COLLISION_SETTLE_DURATION_MS)
}

async function handleBulkOpenChange(isOpen: boolean): Promise<void> {
  isBulkOpen = isOpen

  if (!isOpen) {
    if (shouldRestoreFilterAfterCollision && !isSortOpen) {
      isFilterSuppressedByCollision = false
      shouldRestoreFilterAfterCollision = false
    }
    return
  }

  mostRecentOpenedControl = 'bulk'
  clearCollisionCheckTimeout()
  isFilterSuppressedByCollision = false
  collisionCheckTimeout = setTimeout(() => {
    collisionCheckTimeout = null
    void tick().then(() => {
      applyCollisionState()
    })
  }, COLLISION_SETTLE_DURATION_MS)
}

function notifyFilterLayoutChange(): void {
  void resolveFilterCollisionAgainstRightControls()
}

function closeMenu(): void {
  mostRecentOpenedControl = 'filter'
  showMenu = false
  void resolveFilterCollisionAgainstRightControls('filter')
}

// ---

// ---
/********************
 *  3. EFFECTS
 ************/
// +++ Effects

$effect(() => {
  showMenu = !hasActiveSection
})

$effect(() => {
  const nextWidth = rootWidth
  if (nextWidth <= 0) return

  if (lastResolvedRootWidth === null) {
    lastResolvedRootWidth = nextWidth
    return
  }

  if (nextWidth === lastResolvedRootWidth) return

  lastResolvedRootWidth = nextWidth
  clearWidthChangeDebounceTimeout()
  widthChangeDebounceTimeout = setTimeout(() => {
    widthChangeDebounceTimeout = null
    void resolveFilterCollisionAgainstRightControls()
  }, WIDTH_CHANGE_DEBOUNCE_MS)

  return () => {
    clearWidthChangeDebounceTimeout()
  }
})

$effect(() => {
  return () => {
    clearCollisionCheckTimeout()
    clearWidthChangeDebounceTimeout()
    lastResolvedRootWidth = null
  }
})

// ---
</script>

{#snippet menuContent()}
  {#if filterMenuContent}
    {@render filterMenuContent({
      notifyLayoutChange: notifyFilterLayoutChange,
      closeMenu,
    })}
  {/if}
{/snippet}

{#snippet activeContent()}
  {#if filterActiveContent}
    {@render filterActiveContent({ notifyLayoutChange: notifyFilterLayoutChange })}
  {/if}
{/snippet}

<div
  class={`bits-theme bits-resource-filter-bar ${className}`.trim()}
  bind:clientWidth={rootWidth}
>
  <div class="bits-resource-filter-bar__left">
    <FilterCtrl
      label={filterLabel}
      icon={filterIcon}
      onHover={handleFilterAnchorHover}
      onClick={handleFilterAnchorClick}
      {showMenu}
      isCollapsed={isFilterSuppressedByCollision}
      bind:rootElement={filterRootElement}
      bind:menuElement={filterMenuElement}
      bind:activeElement={filterActiveElement}
      {menuContent}
      {activeContent}
    />
  </div>

  <div class="bits-resource-filter-bar__right">
    {#if showBulkEdit && bulkContent}
      <SortCtrl bind:rootElement={bulkRootElement}>
        {@render bulkContent({
          isBulkOpen,
          handleBulkOpenChange,
        })}
      </SortCtrl>
    {/if}
    {#if isBulkOpen && showSort && sortContent}
      <span class="bits-resource-bulk-edit__sort-separator" aria-hidden="true"></span>
    {/if}
    {#if showSort && sortContent}
      <SortCtrl bind:rootElement={sortRootElement}>
        {@render sortContent({
          isSortOpen,
          handleSortOpenChange,
        })}
      </SortCtrl>
    {/if}
    <ResultCount {count} />
    <FilterReset disabled={resetDisabled} onClick={onReset} />
  </div>
</div>
