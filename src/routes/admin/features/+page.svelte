<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/layout/ResourceIndex.svelte';
import EntityCard from '$lib/components/layout/EntityCard.svelte';
import Image from '$lib/components/common/Image.svelte';
import { onMount } from 'svelte';
// CONFIG :: KEY MAP
import type { KeyMap } from '$lib/components/layout/EntityCard.svelte';
// TYPES
import type { Feature } from '$lib/types';

// CONTEXT
const resourceState = getHierarchicalResourceState();

// CONFIG :: KEY MAP
const keyMap: KeyMap = {
  id: 'id',
  title: 'title',
  subtitle: 'addressProperties.neighbourhood',
  description: 'displayAddress',
  image: 'image',
  badges: [
    { label: 'isPublished', variant: 'primary' },
    { label: 'isVisitable', variant: 'outline' }
  ]
};
</script>

<!-- TODO Revamp this page to use the new context API -->

<!-- LAYOUT -->
<ResourceHeader />
<ResourceIndex entities={resourceState.filteredFeatures}>
  {#snippet children(entity, idx)}
    <EntityCard {entity} {keyMap}>
      {#snippet header(entity: Feature)}
        <Image
          src={`https://picsum.photos/384/${192 + idx}`}
          alt={entity.displayAddress || ''}
          layout="cover" />
      {/snippet}
      {#snippet badges(entity: Feature)}
        <div class="flex flex-row flex-wrap justify-center gap-2 pb-2 align-middle">
          <span class="badge badge-primary"
            >{entity.isPublished ? 'Published' : 'Draft'}</span>
          {#each entity.properties as property}
            <span class="badge badge-secondary">{property.property.label}</span>
          {/each}
          <span class="badge badge-outline">
            {entity.isVisitable ? 'Visitable' : 'Not Visitable'}
          </span>
        </div>
      {/snippet}
    </EntityCard>
  {/snippet}
</ResourceIndex>
<!-- 
<div class="p-4">
  <h1 class="mb-4 text-2xl font-bold">Features</h1>

  {#if queryPrimsParams.organisation.length > 0 || queryPrimsParams.project.length > 0 || queryPrimsParams.layer.length > 0}
    <div class="alert alert-info mb-4">
      <span>
        Filtered by
        {#if queryPrimsParams.organisation.length > 0}
          {queryPrimsParams.organisation.length} organisation(s)
        {/if}
        {#if queryPrimsParams.project.length > 0}
          {queryPrimsParams.organisation.length > 0 ? ', ' : ''}
          {queryPrimsParams.project.length} project(s)
        {/if}
        {#if queryPrimsParams.layer.length > 0}
          {queryPrimsParams.organisation.length > 0 ||
          queryPrimsParams.project.length > 0
            ? ' and '
            : ''}
          {queryPrimsParams.layer.length} layer(s)
        {/if}
      </span>
    </div>
  {/if}

  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    {#each resources.feature as feature}
      <div class="card bg-base-100 shadow-xl">
        <div class="card-body">
          <h2 class="card-title">{feature.title}</h2>
          <p>{feature.description || 'No description available'}</p>
          <div class="card-actions justify-end">
            <a href="{ADMIN_PATH}/features/{feature.ref}" class="btn btn-primary"
              >View</a>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div> -->
