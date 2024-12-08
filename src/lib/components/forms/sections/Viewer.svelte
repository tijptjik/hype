<script lang="ts">
import { fade, crossfade } from 'svelte/transition';
import { beforeNavigate } from '$app/navigation';
import UserAttributionCard from '$lib/components/user/UserAttributionCard.svelte';
import { imageSets, navigateImage } from '$lib/images/index.svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// COMPONENTS
import { InformationCircle } from '@steeze-ui/heroicons';
import Header from '$lib/components/forms/extra/Header.svelte';
import Actions from '$lib/components/forms/actions/Viewer.svelte';
import Viewer from '$lib/components/common/Viewer.svelte';
import ScrollArrow from '$lib/components/images/gallery/ScrollArrow.svelte';
import IconAnchor from '$lib/components/common/IconAnchor.svelte';
// TYPES
import type { SectionProps, GetImageAPI, ImageEditRefs } from '$lib/types';

// Props
let { ...sectionProps }: SectionProps & { refs: ImageEditRefs } = $props();

let showNav: boolean = $derived(imageSets.images.length > 1);

let routerState = getRouterState();

// Setup crossfade
const [send, receive] = crossfade({
  duration: 300,
  fallback: fade
});

beforeNavigate(() => {
  imageSets.activeImage = null;
});
</script>

<div
  class="relative z-10 flex w-full flex-grow flex-col rounded-2xl bg-gradient-to-r from-rose-500/70 to-fuchsia-800/70 p-0">
  <Header {...sectionProps} {Actions} />
  <main class="relative flex h-full w-full flex-col rounded-b-2xl bg-base-300">
    {#if imageSets.activeImage}
      <Viewer
        image={imageSets.activeImage as GetImageAPI}
        isCrossfade={false}
        enableDropzone={true}
        resource={routerState.resource as ResourceType}
        entityId={routerState.entity as string}
        >
        {#snippet RightActions()}
          {#if imageSets.activeImage}
            <IconAnchor position="right" icon={InformationCircle}>
              <UserAttributionCard
                userId={imageSets.activeImage!.contributorId}
                date={imageSets.activeImage!.createdAt}
                type="imageContributor"
                class="mr-4" />
            </IconAnchor>
          {/if}
        {/snippet}
      </Viewer>

      <!-- Navigation Arrows -->
      {#if showNav}
        <ScrollArrow
          direction="left"
          onClick={(e: MouseEvent) => navigateImage(e, 'prev')} />
        <ScrollArrow
          direction="right"
          onClick={(e: MouseEvent) => navigateImage(e, 'next')} />
      {/if}
    {/if}
  </main>
</div>
