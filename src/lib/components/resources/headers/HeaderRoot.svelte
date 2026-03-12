<script lang="ts">
import { slide } from 'svelte/transition'
// STORES
import { getBreadcrumbs } from '$lib/navigation'
// ICONS
import Icon from '$lib/components/common/Icon.svelte'
import { Bars3 } from '@steeze-ui/heroicons'
// COMPONENTS
import HeaderFacetTabs from './HeaderFacetTabs.svelte'
import HeaderFormActions from './HeaderFormActions.svelte'
import HeaderSearch from './HeaderSearch.svelte'
import HeaderAddButton from './HeaderAddButton.svelte'
import HeaderModes from './HeaderModes.svelte'
import UserMenu from '$lib/components/menu/UserMenu.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getAdminCtx } from '$lib/context/admin.svelte'

// STATE : CONTEXT
const appCtx = getAppCtx()
const adminCtx = getAdminCtx()

// STATE : DERIVED
let headerState = $derived(appCtx.state.header)
let isIndex = $derived(appCtx.isIndex)
let resourceType = $derived(appCtx.headerResourceType)
let title = $derived(headerState.title)
let icon = $derived(headerState.icon)
let showFacetTabs = $derived(!isIndex && headerState.facetTabs.size > 0)
let showFormActions = $derived(!isIndex && headerState.actions.showFormActions)
let showAddButton = $derived(isIndex && headerState.actions.showAddButton)
let showSearch = $derived(isIndex && headerState.actions.showSearch)
let showModes = $derived(
  isIndex &&
    (headerState.actions.showLayoutModes || headerState.actions.showControlModes),
)
</script>

<!-- class:bg-gradient-to-r={!isIndex} -->
<!-- class:from-rose-500={!isIndex}
class:to-fuchsia-800={!isIndex} -->

{#if resourceType}
  <header
    class="navbar sticky left-0 top-0 z-20 flex h-18 w-full shrink-0 justify-between bg-black px-6 py-4 caret-transparent shadow-lg transition-all duration-300"
  >
    <div class="flex-1" class:@container={!isIndex}>
      <div class="flex items-center space-x-4">
        {#if icon}
          <Icon src={icon} class="h-6 w-6" />
        {/if}
        <div class="flex min-w-4 flex-col">
          <!-- Breadcrumbs -->
          {#if adminCtx.activeResourceType && adminCtx.activeResourceRef}
            {#await getBreadcrumbs(adminCtx.appCtx, adminCtx.activeResourceType, adminCtx.activeResourceRef)}
            <!-- Loading state - could show skeleton if needed -->
            {:then breadcrumbs}
              {#if breadcrumbs.length > 0}
                <div
                  class="hidden items-center space-x-2 text-sm font-medium text-gray-300 @md:flex"
                >
                  {#each breadcrumbs as parent, i (parent.href ?? `current:${parent.name}`)}
                    {#if parent.href}
                      <a
                        draggable="false"
                        out:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                        in:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                        href={parent.href}
                        class="inline-block h-5 select-none overflow-hidden whitespace-nowrap hover:text-white"
                      >
                        {parent.name}
                      </a>
                    {:else}
                      <span
                        out:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                        in:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                        class="inline-block h-5 select-none overflow-hidden whitespace-nowrap"
                        aria-current="page"
                      >
                        {parent.name}
                      </span>
                    {/if}
                    {#if i < breadcrumbs.length - 1}
                      <span
                        out:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                        in:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                        class="inline-block whitespace-nowrap text-gray-400"
                        >/</span
                      >
                    {/if}
                  {/each}
                </div>
              {/if}
            {:catch error}
            <!-- Error state - fail silently for breadcrumbs -->
            <!-- console.error should handle logging in getBreadcrumbs -->
            {/await}
          {/if}

          <!-- Title -->
          <h2
            class="truncate text-2xl font-semibold transition-all @xs:max-w-[14rem] @sm:max-w-[18rem] @md:max-w-[24rem] @lg:max-w-[30rem] @xl:max-w-[34rem] @2xl:max-w-[38rem] @3xl:max-w-[42rem] @4xl:max-w-[48rem] @5xl:max-w-[56rem] @6xl:max-w-[64rem]"
          >
            {title}
          </h2>
        </div>
        {#if isIndex}
          {#if showAddButton}
            <HeaderAddButton />
          {/if}
        {/if}
      </div>
    </div>

    <div class="flex space-x-5">
      {#if isIndex}
        <!-- Index Header Actions -->
        {#if showSearch}
          <HeaderSearch />
        {/if}
        {#if showModes}
          <div class="divider divider-horizontal"></div>
          <HeaderModes />
        {/if}
      {:else}
        <!-- Entity Header Actions -->
        {#if showFacetTabs}
          <HeaderFacetTabs />
        {/if}

        <Icon src={Bars3} class="mx-2 h-6 w-6 text-white" />

        {#if showFormActions}
          <HeaderFormActions />
        {/if}
      {/if}
      <UserMenu />
    </div>
  </header>
{/if}
