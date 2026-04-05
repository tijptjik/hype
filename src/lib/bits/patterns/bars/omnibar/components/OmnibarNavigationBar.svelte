<script lang="ts">
// COMPONENTS
import OmnibarCollection from './OmnibarCollection.svelte'
import OmnibarNavigationArrow from './OmnibarNavigationArrow.svelte'
import OmnibarNavigationHeader from './OmnibarNavigationHeader.svelte'
// ENUMS
import { OmniMode } from '$lib/enums'
// STYLES
import { getOmnibarNavBarClasses, getOmnibarSurfaceClasses } from '../omnibar.styles'
// TYPES
import type { OmnibarNavigationBarProps } from './omnibarPrimitives.types'

let {
  mode,
  navigation,
  hasElevatedChrome,
  effectiveAppMainWidth,
}: OmnibarNavigationBarProps = $props()

const showCollectionTray = $derived(
  mode !== OmniMode.feature &&
    navigation.isTrayOpen &&
    navigation.showCollectionSwitcher,
)
const navBarClasses = $derived(
  getOmnibarNavBarClasses({ hasElevatedChrome, effectiveAppMainWidth }),
)
const surfaceClasses = $derived(
  getOmnibarSurfaceClasses({ hasElevatedChrome, effectiveAppMainWidth }),
)
</script>

<div class="relative flex min-h-0 flex-col">
  <div class={surfaceClasses}>
    <div id="omni-nav-bar" class={navBarClasses}>
      {#if navigation.showArrows}
        <div class="flex h-full w-full items-center">
          <div class="h-full shrink-0">
            <OmnibarNavigationArrow
              direction="left"
              disabled={navigation.leftDisabled}
              onClick={navigation.onPrevious}
            />
          </div>
          <div class="min-w-0 flex-1">
            <OmnibarNavigationHeader
              collectionMetaText={navigation.collectionMetaText}
              featureTitle={navigation.featureTitle}
              {hasElevatedChrome}
              isCardOpen={navigation.isCardOpen}
              showCollectionSwitcher={navigation.showCollectionSwitcher}
              onToggleTray={navigation.onToggleTray}
              onToggleCard={navigation.onToggleCard}
              onClose={navigation.onClose}
            />
          </div>
          <div class="h-full shrink-0">
            <OmnibarNavigationArrow
              direction="right"
              disabled={navigation.rightDisabled}
              onClick={navigation.onNext}
            />
          </div>
        </div>
      {:else}
        <div class="w-full">
          <OmnibarNavigationHeader
            collectionMetaText={navigation.collectionMetaText}
            featureTitle={navigation.featureTitle}
            {hasElevatedChrome}
            isCardOpen={navigation.isCardOpen}
            showCollectionSwitcher={navigation.showCollectionSwitcher}
            onToggleTray={navigation.onToggleTray}
            onToggleCard={navigation.onToggleCard}
            onClose={navigation.onClose}
          />
        </div>
      {/if}
    </div>
  </div>

  {#if showCollectionTray}
    <div
      class="pointer-events-none absolute inset-x-0 top-full z-40 grid grid-cols-1 grid-rows-1"
    >
      <OmnibarCollection
        mode="navigation"
        items={navigation.items}
        {hasElevatedChrome}
        {effectiveAppMainWidth}
        currentIndex={navigation.currentIndex}
        navTitle={navigation.navTitle}
        onSelectIndex={navigation.onSelectIndex}
        onCloseTray={navigation.onCloseTray}
      />
    </div>
  {/if}
</div>
