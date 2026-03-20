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
  showSort = true,
  count,
  resetDisabled = false,
  onReset,
  filterMenuContent,
  filterActiveContent,
  sortContent,
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
let isFilterSuppressedByCollision = $state(false)
let shouldRestoreFilterAfterCollision = $state(false)
let collisionCheckTimeout: ReturnType<typeof setTimeout> | null = $state(null)
let widthChangeDebounceTimeout: ReturnType<typeof setTimeout> | null = $state(null)
let lastResolvedRootWidth = $state<number | null>(null)

const COLLISION_SETTLE_DURATION_MS = 340
const WIDTH_CHANGE_DEBOUNCE_MS = 40

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

function hasFilterSortCollision(): boolean {
  const collisionTarget = getVisibleFilterCollisionElement()
  if (!collisionTarget || !sortRootElement) return false

  return areRectsOverlapping(
    collisionTarget.getBoundingClientRect(),
    sortRootElement.getBoundingClientRect(),
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
  if (!isSortOpen || !hasFilterSortCollision()) return false
  isSortOpen = false
  return true
}

async function resolveFilterCollisionAgainstSort(): Promise<void> {
  if (!isSortOpen || isFilterSuppressedByCollision) return

  clearCollisionCheckTimeout()
  collisionCheckTimeout = setTimeout(() => {
    collisionCheckTimeout = null
    void tick().then(() => {
      closeSortMenuIfNeeded()
    })
  }, COLLISION_SETTLE_DURATION_MS)
}

async function handleFilterAnchorHover(): Promise<void> {
  if (isFilterSuppressedByCollision) {
    isFilterSuppressedByCollision = false
    void resolveFilterCollisionAgainstSort()
    return
  }

  if (!hasActiveSection) {
    if (showMenu) return
    showMenu = true
    void resolveFilterCollisionAgainstSort()
    return
  }

  showMenu = !showMenu
  void resolveFilterCollisionAgainstSort()
}

async function handleFilterAnchorClick(_event: MouseEvent): Promise<void> {
  if (isFilterSuppressedByCollision) {
    isFilterSuppressedByCollision = false
    void resolveFilterCollisionAgainstSort()
    return
  }

  showMenu = !showMenu
  void resolveFilterCollisionAgainstSort()
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
  void resolveFilterCollisionAgainstSort()
}

function closeMenu(): void {
  showMenu = false
  void resolveFilterCollisionAgainstSort()
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
    void resolveFilterCollisionAgainstSort()
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
