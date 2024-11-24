<script lang="ts">
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { getRouterState } from '$lib/context/router.svelte';
import { fade } from 'svelte/transition';
// TYPES
import type { Resource, EntityWithData, Ref } from '$lib/types';
import Image from '$lib/components/common/Image.svelte';

// TYTPES
type KeyMap = {
  id: keyof EntityWithData<Resource>;
  title: keyof EntityWithData<Resource>;
  subtitle?: keyof EntityWithData<Resource>;
  description: keyof EntityWithData<Resource>;
  image: keyof EntityWithData<Resource>;
  tags?: keyof EntityWithData<Resource>[];
  badges?: Array<{
    label: string;
    variant?: 'primary' | 'secondary' | 'outline' | undefined;
  }>;
};

type Props = {
  entity: EntityWithData<Resource>;
  keyMap: KeyMap;
  header?: any;
  badges?: any;
  content?: any;
  actions?: any;
};

let { entity, keyMap, header, badges, content, actions }: Props = $props();

const routerState = getRouterState();
const href = $derived(`/admin/${routerState.resourcePath}/${entity[keyMap.id]}${$page.url.search}`);

const onclick = (e: MouseEvent) => {
  e.preventDefault();
  routerState.updateWith({
    entity: entity[keyMap.id as keyof typeof entity] as Ref,
    facet: 'core'
  });
  goto(href);
};
</script>

<a
  draggable="false"
  {href}
  {onclick}
  role="article"
  tabindex="2"
  class="card bg-base-100 shadow-xl transition-shadow duration-800 hover:shadow-2xl hover:shadow-primary hover:scale-[.99] active:outline-none focus-visible:outline-secondary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:shadow-primary select-none"
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onclick(e);
    }
  }}
>
  <!-- Header Section -->
  {#if header}
    {@render header(entity)}
  {:else}
    <figure>
      <Image
        src={entity[keyMap.image] as string}
        alt={entity[keyMap.title] as string}
      />
    </figure>
  {/if}

  <!-- Content Section -->
  <div class="card-body">
    {#if content}
      {@render content(entity)}
    {:else}
      <h2 class="card-title mt-0">
        {entity[keyMap.title]}
        {#if keyMap.subtitle}
          <small class="text-sm text-gray-500">{entity[keyMap.subtitle]}</small>
        {/if}
      </h2>
      <p class="mt-2">{@html entity[keyMap.description]}</p>
    {/if}

    <!-- Actions Section -->
    <div class="mt-4 flex flex-row items-center justify-between">
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
        <!-- <div class="flex flex-wrap gap-2">
          {#if keyMap.tags}
            {#each keyMap.tags as tag}
              {#each entity[tag as keyof typeof entity] as entityTag}
                <span class="badge badge-outline">{entityTag}</span>
              {/each}
            {/each}
          {/if}
        </div> -->
        <!-- <button
          {onclick}
          class="btn btn-primary">
          View Details
        </button> -->
      {/if}
    </div>
  </div>
</a>
