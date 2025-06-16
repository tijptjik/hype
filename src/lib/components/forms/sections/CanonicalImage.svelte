<script lang="ts">
// I18n
import { m } from '$lib/i18n';
// SVELTE
import { onMount } from 'svelte';
// STORES
import { page } from '$app/state';
// SERVICES
import { getURLfromImage } from '$lib/client/services/image';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import Image from '$lib/components/common/Image.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { Photo } from '@steeze-ui/heroicons';
// TYPES
import type { ImageDB } from '$lib/types';

let SectionProps = $props();

let { form } = SectionProps.form;

let imageSrc = $derived(
  $form.image
    ? getURLfromImage({
        image: $form.image as ImageDB,
        transformation: 'c_fill,h_320,w_320,q_auto'
      })
    : ''
);

// HANDLERS
const adminCtx = getAdminCtx();

// UTILS
const getUrl = (facet: string) => {
  const url = new URL(page.url.href);
  url.hash = `#${facet}`;
  return url.toString();
};

// STATE : CONTEXT
const navigateToGallery = (e: Event) => {
  e.preventDefault();
  adminCtx.setFacet('images');
};
</script>

<div class="h-full min-h-[300px] w-full basis-1/1 2xl:basis-1/3-gap-6">
  {#if $form.image}
    <a href={getUrl('images')} onclick={navigateToGallery}>
      <div class="relative h-full w-full overflow-hidden rounded-lg">
        <!-- Background Image -->
        <div class="z-1 absolute inset-0 h-full w-full bg-neutral opacity-50">
          <Image
            src={imageSrc}
            alt="Background Image"
            class="h-full w-full text-base-100 blur-sm"
            layout="cover"
            showLoading={false}
            showError={false} />
        </div>
        <!-- Main Image -->
        <div class="z-2 absolute h-full w-full overflow-hidden p-2">
          <Image
            src={imageSrc}
            alt="Canonical image of feature"
            class="mx-auto h-full overflow-hidden rounded-lg text-base-100"
            layout="contain"
            showLoading={false}
            showError={false} />
        </div>
      </div>
    </a>
  {:else}
    <a href={getUrl('images')} onclick={navigateToGallery}>
      <div
        class="flex h-full w-full flex-col items-center justify-center gap-4 rounded-lg bg-base-300">
        <Icon src={Photo} class="h-8 w-8 text-base-content/50" />
        <span class="text-base-content/50">{m.left_dizzy_trout_peel()}</span>
      </div>
    </a>
  {/if}
</div>
