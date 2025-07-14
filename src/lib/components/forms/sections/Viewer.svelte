<script lang="ts">
import UserAttributionCard from '$lib/components/user/UserAttributionCard.svelte';
// SERVICES
import { getImageCtx } from '$lib/context/image.svelte';
// COMPONENTS
import { InformationCircle } from '@steeze-ui/heroicons';
import Header from '$lib/components/forms/extra/Header.svelte';
import ViewerActions from '$lib/components/forms/actions/Viewer.svelte';
import Viewer from '$lib/components/common/Viewer.svelte';
import ScrollArrow from '$lib/components/images/gallery/ScrollArrow.svelte';
import IconAnchor from '$lib/components/common/IconAnchor.svelte';
// TYPES
import type { SectionProps } from '$lib/types';

// SERVICES
const imageCtx = getImageCtx();

// Props
let { ...sectionProps }: SectionProps = $props();

let image = $derived(imageCtx.activeImage);
</script>

<div class="relative z-10 flex flex-1 flex-col gap-2 rounded-2xl">
  <Header {...sectionProps}>
    {#snippet actionContent()}
      <ViewerActions />
    {/snippet}
  </Header>
  <main
    class="relative flex h-full w-full flex-col overflow-hidden rounded-xl rounded-b-2xl bg-glass-result">
    <Viewer isCrossfade={true} isDropzone={true}>
      {#snippet RightActions()}
        <IconAnchor position="right" icon={InformationCircle}>
          {#if image}
            <UserAttributionCard
              userId={image.contributorId}
              date={image.createdAt}
              type="imageContributor"
              class="mr-4" />
          {/if}
        </IconAnchor>
      {/snippet}
    </Viewer>

    <!-- Navigation Arrows -->
    {#if imageCtx.getImages().length > 1}
      <!-- Left Navigation -->
      <div
        class="absolute left-0 top-[25%] z-20 flex h-[50%] w-[20%] cursor-pointer items-center justify-start pl-2 caret-transparent opacity-0 transition-opacity duration-200 hover:opacity-100"
        onclick={(e: MouseEvent) => imageCtx.switchToImage(e, 'prev')}
        role="button"
        tabindex="0">
        <ScrollArrow
          direction="left"
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            imageCtx.switchToImage(e, 'prev');
          }} />
      </div>

      <!-- Right Navigation -->
      <div
        class="absolute right-0 top-[25%] z-20 flex h-[50%] w-[20%] cursor-pointer items-center justify-end pr-2 caret-transparent opacity-0 transition-opacity duration-200 hover:opacity-100"
        onclick={(e: MouseEvent) => imageCtx.switchToImage(e, 'next')}
        role="button"
        tabindex="0">
        <ScrollArrow
          direction="right"
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            imageCtx.switchToImage(e, 'next');
          }} />
      </div>
    {/if}
  </main>
</div>
