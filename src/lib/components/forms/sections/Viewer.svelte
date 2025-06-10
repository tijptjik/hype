<script lang="ts">
import { beforeNavigate } from '$app/navigation';
import UserAttributionCard from '$lib/components/user/UserAttributionCard.svelte';
// SERVICES
import { getImageContext } from '$lib/context/image.svelte';
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
const imageCtx = getImageContext();

// Props
let { ...sectionProps }: SectionProps = $props();

let image = $derived(imageCtx.activeImage);
</script>

<div
  class="relative z-10 flex w-full flex-grow flex-col rounded-2xl bg-gradient-to-r from-rose-500/70 to-fuchsia-800/70 p-0">
  <Header {...sectionProps}>
    {#snippet actionContent()}
      <ViewerActions />
    {/snippet}
  </Header>
  <main class="relative flex h-full w-full flex-col rounded-b-2xl bg-base-300">
    <Viewer isCrossfade={false} isDropzone={true}>
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
      <ScrollArrow
        direction="left"
        onClick={(e: MouseEvent) => imageCtx.switchToImage(e, 'prev')} />
      <ScrollArrow
        direction="right"
        onClick={(e: MouseEvent) => imageCtx.switchToImage(e, 'next')} />
    {/if}
  </main>
</div>
