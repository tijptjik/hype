<script lang="ts">
import { slide } from 'svelte/transition';
// STORES
import { navItems, getBreadcrumbs } from '$lib/navigation';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Bars3 } from '@steeze-ui/heroicons';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// TYPES
import type { Snippet } from 'svelte';

// STATE : PROPS
let {
  title,
  icon,
  menuItems,
  actions
}: {
  title: string;
  icon?: any;
  menuItems?: Snippet;
  actions?: Snippet;
} = $props();

// STATE : CONTEXT
const adminCtx = getAdminCtx();

// Default icon from navigation if not provided
const displayIcon = $derived(
  icon || navItems[adminCtx.activeResourceType as keyof typeof navItems]?.icon
);
</script>

<header
  class="navbar sticky left-0 top-0 z-20 h-17.5 w-full flex-none bg-gradient-to-r from-rose-500 to-fuchsia-800 px-12 py-4 shadow-lg">
  <div class="flex-1 @container">
    <div class="flex items-center space-x-4">
      {#if displayIcon}
        <Icon src={displayIcon} class="h-6 w-6" />
      {/if}

      <div class="flex flex-col">
        <!-- Breadcrumbs -->
        {#if adminCtx.activeResourceType && adminCtx.activeResourceRef}
          {#await getBreadcrumbs(adminCtx.appCtx, adminCtx.activeResourceType, adminCtx.activeResourceRef)}
            <!-- Loading state - could show skeleton if needed -->
          {:then breadcrumbs}
            {#if breadcrumbs.length > 0}
              <div
                class="hidden items-center space-x-2 text-sm font-medium text-gray-300 @md:flex">
                {#each breadcrumbs as parent, i}
                  <a
                    draggable="false"
                    out:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                    in:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                    href={parent.href}
                    class="inline-block h-5 select-none overflow-hidden whitespace-nowrap hover:text-white">
                    {parent.name}
                  </a>
                  {#if i < breadcrumbs.length - 1}
                    <span
                      out:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                      in:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                      class="inline-block whitespace-nowrap text-gray-400">/</span>
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
          class="max-w-0 truncate text-2xl font-semibold transition-all @xs:max-w-[14rem] @sm:max-w-[18rem] @md:max-w-[24rem] @lg:max-w-[30rem] @xl:max-w-[34rem] @2xl:max-w-[38rem] @3xl:max-w-[42rem] @4xl:max-w-[48rem] @5xl:max-w-[56rem] @6xl:max-w-[64rem]">
          {title}
        </h2>
      </div>
    </div>
  </div>

  <div class="flex-none">
    <!-- Custom Menu Items -->
    {#if menuItems}
      <ul class="mt-1 flex flex-row space-x-2 px-2">
        {@render menuItems()}
      </ul>
    {/if}

    <Icon src={Bars3} class="mx-2 h-6 w-6 text-black" />

    <!-- Custom Actions -->
    {#if actions}
      <ul class="menu menu-horizontal space-x-2">
        {@render actions()}
      </ul>
    {/if}
  </div>
</header>
