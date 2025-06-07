<script lang="ts">
import { getLocale } from '$lib/i18n';
import { slide } from 'svelte/transition';
import { ADMIN_PATH } from '$lib';
// STORES
import { navItems } from '$lib/navigation';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Bars3 } from '@steeze-ui/heroicons';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// TYPES
import type { Resource, ResourceType, Organisation, Project, Layer, Feature } from '$lib/types';
import type { Snippet } from 'svelte';

// STATE : PROPS
let { 
  title,
  icon,
  breadcrumbs = $bindable([]),
  menuItems,
  actions
}: { 
  title: string;
  icon?: any;
  breadcrumbs?: { name: string; href: string }[];
  menuItems?: Snippet;
  actions?: Snippet;
} = $props();

// STATE : CONTEXT
const resourceState = getHierarchicalResourceState();

// Auto-generate breadcrumbs if not provided
const autoBreadcrumbs = $derived(() => {
  if (breadcrumbs && breadcrumbs.length > 0) {
    return breadcrumbs;
  }

  if (!resourceState.activeResource || !resourceState.activeEntity) {
    return [];
  }

  const currentEntity = resourceState.getEntity();
  if (!currentEntity) {
    return [];
  }

  const parents: { name: string; href: string }[] = [];
  buildParentChain(currentEntity, resourceState.activeResource, parents);
  return parents;
});

// Simplified parent chain builder
function buildParentChain(entity: Resource, resourceType: ResourceType, parents: { name: string; href: string }[]) {
  const parentMap = {
    feature: { getter: resourceState.getLayer, parentType: 'layer' as ResourceType },
    layer: { getter: resourceState.getProject, parentType: 'project' as ResourceType },
    project: { getter: resourceState.getOrganisation, parentType: 'organisation' as ResourceType }
  };

  const parentInfo = parentMap[resourceType as keyof typeof parentMap];
  if (!parentInfo) return;

  const parentEntity = parentInfo.getter(entity as any);
  if (parentEntity) {
    addParentToChain(parents, parentEntity, parentInfo.parentType);
    buildParentChain(parentEntity, parentInfo.parentType, parents);
  }
}

function addParentToChain(parents: { name: string; href: string }[], parentEntity: Resource, resourceType: ResourceType) {
  const parentRef = resourceState.getEntityRef(resourceType as any, parentEntity.id as string);
  if (parentRef) {
    const parentPath = `${ADMIN_PATH}/${resourceType}s/${parentRef}`;
    
    let parentName = 'Unknown';
    const typedParent = parentEntity as Organisation | Project | Layer | Feature;
    const currentLocale = getLocale();
    if (typedParent.i18n?.[currentLocale]) {
      parentName = typedParent.i18n[currentLocale].name || 
                  typedParent.i18n[currentLocale].nameShort || 
                  typedParent.i18n[currentLocale].title || 
                  parentEntity.id ||
                  'Unknown';
    } else {
      parentName = parentEntity.id || 'Unknown';
    }

    parents.unshift({
      name: parentName,
      href: getParentHref(parentPath)
    });
  }
}

function getParentHref(parentPath: string): string {
  const url = new URL(window.location.href);
  url.pathname = parentPath;
  return url.toString();
}

// Default icon from navigation if not provided
const displayIcon = $derived(
  icon || navItems[resourceState.activeResource as keyof typeof navItems]?.icon
);
</script>

<header class="navbar sticky left-0 top-0 z-20 h-17.5 w-full flex-none bg-gradient-to-r from-rose-500 to-fuchsia-800 px-12 py-4 shadow-lg">
  <div class="flex-1 @container">
    <div class="flex items-center space-x-4">
      {#if displayIcon}
        <Icon src={displayIcon} class="h-6 w-6" />
      {/if}
      
      <div class="flex flex-col">
        <!-- Breadcrumbs -->
        {#if autoBreadcrumbs().length > 0}
          <div class="hidden items-center space-x-2 text-sm font-medium text-gray-300 @md:flex">
            {#each autoBreadcrumbs() as parent, i}
              <a
                draggable="false"
                out:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                in:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                href={parent.href}
                class="inline-block h-5 select-none overflow-hidden whitespace-nowrap hover:text-white">
                {parent.name}
              </a>
              {#if i < autoBreadcrumbs().length - 1}
                <span
                  out:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                  in:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                  class="inline-block whitespace-nowrap text-gray-400">/</span>
              {/if}
            {/each}
          </div>
        {/if}
        
        <!-- Title -->
        <h2 class="max-w-0 truncate text-2xl font-semibold transition-all @xs:max-w-[14rem] @sm:max-w-[18rem] @md:max-w-[24rem] @lg:max-w-[30rem] @xl:max-w-[34rem] @2xl:max-w-[38rem] @3xl:max-w-[42rem] @4xl:max-w-[48rem] @5xl:max-w-[56rem] @6xl:max-w-[64rem]">
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
