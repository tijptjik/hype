<script lang="ts">
import { fade, crossfade } from 'svelte/transition';
import { getURLfromImage } from '$lib/db/services/image';

// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { InformationCircle, ChevronLeft, ChevronRight } from '@steeze-ui/heroicons';
import Header from '$lib/components/forms/extra/Header.svelte';
import Actions from '$lib/components/forms/actions/Viewer.svelte';
import UserAttributionCard from '$lib/components/user/UserAttributionCard.svelte';
import Image from '$lib/components/common/Image.svelte';
// TYPES
import type { SectionProps, GetImageAPI } from '$lib/types';

// Props
let {
  activeImage = $bindable(null),
  actions,
  showNav,
  ...sectionProps
}: SectionProps & {
  activeImage: GetImageAPI | null;
  actions: Record<string, (...args: any[]) => void>;
  showNav: boolean;
} = $props();

// Setup crossfade
const [send, receive] = crossfade({
  duration: 300,
  fallback: fade
});

let imageSrc = $derived(activeImage ? getURLfromImage(activeImage) : null);
</script>

<div
  class="relative z-10 flex w-full flex-grow flex-col rounded-2xl bg-gradient-to-r from-rose-500/70 to-fuchsia-800/70 p-0">
  <Header {...sectionProps} {Actions} {activeImage} />
  <main class="relative flex h-full w-full flex-col rounded-b-2xl bg-base-300">
    {#if activeImage}
      <!-- Navigation Arrows -->
      {#if showNav}
        <!-- Left Arrow -->
        <button
          class="absolute left-6 top-1/2 z-30 -translate-y-1/2 transform rounded-full bg-base-100/80 p-2 shadow-lg backdrop-blur-sm transition-all hover:bg-base-100 hover:shadow-xl"
          onclick={(e) => actions.navigateImage(e, 'prev')}
          transition:fade={{ duration: 200 }}>
          <Icon src={ChevronLeft} class="h-5 w-5" />
        </button>

        <!-- Right Arrow -->
        <button
          class="absolute right-6 top-1/2 z-30 -translate-y-1/2 transform rounded-full bg-base-100/80 p-2 shadow-lg backdrop-blur-sm transition-all hover:bg-base-100 hover:shadow-xl"
          onclick={(e) => actions.navigateImage(e, 'next')}
          transition:fade={{ duration: 200 }}>
          <Icon src={ChevronRight} class="h-5 w-5" />
        </button>
      {/if}

      {#key activeImage.id}
        <!-- Background Image -->
        <div
          class="absolute inset-0 z-10 h-full w-full rounded-b-2xl bg-neutral opacity-30"
          in:receive={{ key: `${activeImage.id}` }}
          out:send={{ key: `${activeImage.id}` }}>
          <Image
            src={imageSrc}
            alt="Background Image"
            class="h-full w-full rounded-b-2xl blur-sm text-base-100"
            layout="cover"
            showLoading={false}
            showError={false} />
        </div>

        <!-- Main Image -->
        <div
          class="absolute z-20 h-full w-full overflow-hidden rounded-2xl p-4"
          in:receive={{ key: `${activeImage.id}` }}
          out:send={{ key: `${activeImage.id}` }}>
          <Image
            class="mx-auto h-full overflow-hidden rounded-xl text-base-100"
            src={imageSrc}
            alt="Feature Image"
            layout="contain"
            showLoading={false}
            showError={false} />
        </div>

        <!-- Attribution Card -->
        <div class="group absolute bottom-4 right-4 z-30">
          <!-- Credits Label -->
          <div
            class="absolute bottom-0 right-0 flex items-center justify-center opacity-70 transition-opacity duration-200 group-hover:opacity-0">
            <span
              class="rounded-lg bg-base-300 p-2 px-3 font-mono text-sm font-medium text-white">
              <Icon src={InformationCircle} class="h-4 w-4" />
            </span>
          </div>

          <!-- Attribution Card -->
          <div
            class="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <UserAttributionCard
              {...sectionProps}
              type="imageContributor"
              userId={activeImage.contributorId}
              date={activeImage.createdAt} />
          </div>
        </div>
      {/key}
    {/if}
  </main>
</div>

<style>
/* Optional: Add hover effect for arrows */
button:hover {
  transform: translateY(-50%) scale(1.1);
}
</style>
