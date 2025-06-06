<script lang="ts">
// SVELTE
import { goto } from '$app/navigation';
import { page } from '$app/state';
// I18N
import { getLocale } from '$lib/i18n';
// LIB
import { ADMIN_PATH } from '$lib/index';
import { hashicon } from '@emeraldpay/hashicon';
// SERVICES
import { getURLfromImage } from '$lib/client/services/image';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// COMPONENTS
import Image from '$lib/components/common/Image.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/enums';
// TYPES
import type { Resource, ImageDB, Task } from '$lib/types';
export type KeyMap = {
  id: 'id' | 'code';
  title: 'name' | 'nameShort' | 'title';
  subtitle?: 'nameShort' | 'addressProperties.neighbourhood';
  description: 'description' | 'displayAddress';
  image: 'image';
  tags?: keyof Resource[];
  badges?: Array<{
    label: string;
    variant?: 'primary' | 'secondary' | 'outline' | undefined;
  }>;
};

type Props = {
  entity: Exclude<Resource, Task>;
  keyMap: KeyMap;
  header?: any;
  badges?: any;
  content?: any;
  actions?: any;
};

let { entity, keyMap, header, badges, content, actions }: Props = $props();
let locale = $derived(getLocale());
let textObject = $derived(entity.i18n[locale] || {});

const resourceState = getHierarchicalResourceState();
const href = $derived(
  `${ADMIN_PATH}/${resourceState.getEntityPath(
    resourceState.activeResource as HierarchicalResource,
    entity.id
  )}${page.url.search}`
);

// Generate hashicon URL for fallback
const getHashiconUrl = (id: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  hashicon(id, { size: 400, createCanvas: () => canvas });
  return canvas.toDataURL();
};

const onclick = (e: MouseEvent | KeyboardEvent) => {
  e.preventDefault();
  resourceState.setFacet('core');
  goto(href);
};
</script>

<a
  draggable="false"
  {href}
  {onclick}
  role="article"
  tabindex="2"
  class="duration-800 card select-none bg-base-100 shadow-xl transition-shadow hover:scale-[.99] hover:shadow-2xl hover:shadow-primary focus-visible:shadow-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-secondary active:outline-none"
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onclick(e);
    }
  }}>
  <!-- Header Section -->
  {#if header}
    {@render header(entity)}
  {:else}
    {@debug entity}
    <Image
      src={entity[keyMap.image as keyof typeof entity]
        ? getURLfromImage({ image: entity[keyMap.image as keyof typeof entity] as ImageDB })
        : getHashiconUrl(entity.id)}
      alt={entity[keyMap.title as keyof typeof entity] as string}
      layout="cover" />
  {/if}

  <!-- Content Section -->
  <div class="card-body w-full pb-6">
    {#if content}
      {@render content(entity)}
    {:else}
      <h2 class="card-title mt-0">
        {textObject[keyMap.title]}
        {#if keyMap.subtitle}
          <small class="text-sm text-gray-500">{textObject[keyMap.subtitle]}</small>
        {/if}
      </h2>
      <p class="mt-2">{@html textObject[keyMap.description]}</p>
    {/if}

    <!-- Actions Section -->
    <div class="mt-2 flex flex-row items-center justify-between w-full">
      {#if actions}
        {@render actions(entity)}
      {:else}
        <!-- Badges Section -->
        {#if badges}
          {@render badges(entity)}
        {:else if keyMap.badges?.length}
          <div class="flex flex-row flex-wrap justify-center gap-2 py-2 align-middle">
            {#each keyMap.badges as badge}
              <span class="badge badge-{badge.variant || 'outline'}"
                >{entity[badge.label as keyof typeof entity] as string}</span>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </div>
</a>
