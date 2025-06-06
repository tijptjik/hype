<script lang="ts">
import { getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
import { slide } from 'svelte/transition';
import { NEW_REF, ADMIN_PATH } from '$lib';
// STORES
import { navItems } from '$lib/navigation';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Bars3 } from '@steeze-ui/heroicons';
import MenuItem from '$lib/components/menu/MenuItem.svelte';
import EntityActions from '$lib/components/menu/EntityActions.svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// TYPES
import type { Resource, ResourceType, FacetType, Form, Organisation, Project, Layer, Feature } from '$lib/types';

// CONFIG
const menuItems: Record<Exclude<ResourceType, 'image' | 'user' | 'task' | 'userFeature'>, { label: string; ref: FacetType }[]> = {
  organisation: [
    {
      label: m.organisation__core(),
      ref: 'core'
    },
    {
      label: m.organisation__images(),
      ref: 'images'
    }
  ],
  project: [
    {
      label: m.project__core(),
      ref: 'core'
    },
    {
      label: m.project__fields(),
      ref: 'fields'
    },
    {
      label: m.project__images(),
      ref: 'images'
    }
  ],
  layer: [
    {
      label: m.layer__core(),
      ref: 'core'
    }
  ],
  feature: [
    {
      label: m.feature__core(),
      ref: 'core'
    },
    {
      label: m.feature__address(),
      ref: 'address'
    },
    {
      label: m.feature__images(),
      ref: 'images'
    }
  ]
};

// STATE : PROPS
let { title, form }: { title: string; form: Form } = $props();

// STATE : CONTEXT
const resourceState = getHierarchicalResourceState();

// Build parent breadcrumb hierarchy
const parents = $derived(() => {
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

// Recursive function to build parent chain
function buildParentChain(entity: Resource, resourceType: ResourceType, parents: { name: string; href: string }[]) {
  // Map resource types to their parent getters and types
  const parentMap = {
    feature: { getter: resourceState.getLayer, parentType: 'layer' as ResourceType },
    layer: { getter: resourceState.getProject, parentType: 'project' as ResourceType },
    project: { getter: resourceState.getOrganisation, parentType: 'organisation' as ResourceType }
  };

  const parentInfo = parentMap[resourceType as keyof typeof parentMap];
  if (!parentInfo) return; // No parent (organisation is top-level)

  const parentEntity = parentInfo.getter(entity as any);
  if (parentEntity) {
    addParentToChain(parents, parentEntity, parentInfo.parentType);
    // Recursively build chain for the parent
    buildParentChain(parentEntity, parentInfo.parentType, parents);
  }
}

function addParentToChain(parents: { name: string; href: string }[], parentEntity: Resource, resourceType: ResourceType) {
  const parentRef = resourceState.getEntityRef(resourceType as any, parentEntity.id as string);
  if (parentRef) {
    const parentPath = `${ADMIN_PATH}/${resourceType}s/${parentRef}`;
    
    // Get display name from i18n - cast to proper type
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
      href: parentPath
    });
  }
}

// Helper function to get href while preserving query params
function getParentHref(parentPath: string): string {
  const url = new URL(window.location.href);
  url.pathname = parentPath;
  return url.toString();
}
</script>

<header
  class="from-rose-500 to-fuchsia-800 navbar sticky left-0 top-0 z-20 h-17.5 w-full flex-none bg-gradient-to-r px-12 py-4 shadow-lg">
  <div class="flex-1 @container">
    <div class="flex items-center space-x-4">
      <Icon
        src={navItems[resourceState.activeResource as keyof typeof navItems]?.icon}
        class="h-6 w-6" />
      <div class=" flex flex-col">
        <div
          class="hidden items-center space-x-2 text-sm font-medium text-gray-300 @md:flex">
          {#each parents() as parent, i}
            <a
              draggable="false"
              out:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
              in:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
              href={getParentHref(parent.href)}
              class="inline-block h-5 select-none overflow-hidden whitespace-nowrap hover:text-white">
              {parent.name}
            </a>
            {#if i < parents().length - 1}
              <span
                out:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                in:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                class="inline-block whitespace-nowrap text-gray-400">/</span>
            {/if}
          {/each}
        </div>
        <h2
          class="max-w-0 truncate text-2xl font-semibold transition-all @xs:max-w-[14rem] @sm:max-w-[18rem] @md:max-w-[24rem] @lg:max-w-[30rem] @xl:max-w-[34rem] @2xl:max-w-[38rem] @3xl:max-w-[42rem] @4xl:max-w-[48rem] @5xl:max-w-[56rem] @6xl:max-w-[64rem]">
          {title}
        </h2>
      </div>
    </div>
  </div>
  <div class="flex-none">
    <ul class="mt-1 flex flex-row space-x-2 px-2">
      {#each (resourceState.activeResource && resourceState.activeResource in menuItems) ? menuItems[resourceState.activeResource as keyof typeof menuItems] : [] as facet}
        {#if facet.ref !== 'images' || resourceState.activeEntity !== NEW_REF}
          <MenuItem {facet} />
        {/if}
      {/each}
    </ul>
    <Icon src={Bars3} class="mx-2 h-6 w-6 text-black" />
    <ul class="menu menu-horizontal space-x-2">
      <EntityActions {form} />
    </ul>
  </div>
</header>
