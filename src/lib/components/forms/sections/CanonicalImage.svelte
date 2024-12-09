<script lang="ts">
import { getURLfromImage }  from '$lib/images/index.svelte';
// STORES
import { page } from '$app/stores';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// COMPONENTS
import Image from '$lib/components/common/Image.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { Photo } from '@steeze-ui/heroicons';
let SectionProps = $props();

let { form } = SectionProps.form;

// CONTEXT

// FETCH IMAGE
let getImages = async () => {
  const response = await fetch(`/api/images?featureId=${$form.id}`);
  return response.json();
};

let canonicalImage = async () => {
  const images = await getImages();
  const canonical = images.find((image: any) => image.intent === 'canonical');
  return canonical || images[0] || null;
};

// HANDLERS
const routerState = getRouterState();

// UTILS
const getUrl = (facet: string) => {
  const url = new URL($page.url.href);
  url.hash = `#${facet}`;
  return url.toString();
};

// STATE : CONTEXT
const navigateToGallery = (e: Event) => {
  e.preventDefault();
  routerState.updateWith({ facet: 'images' });
};
</script>

<!-- TODO The info panel is clipping the image, fix the stacking context -->
<div class="h-full basis-1/3 min-h-[300px]">
  {#await canonicalImage()}
    <div class="flex h-full w-full items-center justify-center rounded-lg bg-base-300">
      <span class="text-base-content/50">Loading...</span>
    </div>
  {:then image}
    <a href={getUrl('images')} onclick={navigateToGallery}>
      {#if image}
        <div class="relative h-full w-full overflow-hidden rounded-lg">
          <!-- Background Image -->
          <div class="absolute inset-0 z-10 h-full w-full bg-neutral opacity-50">
            <Image
              src={getURLfromImage({ image, transformation: 'c_fill,h_320,w_320,' })}
              alt="Background Image"
              class="h-full w-full text-base-100 blur-sm"
              layout="cover"
              showLoading={false}
              showError={false} />
          </div>

          <!-- Main Image -->
          <div class="absolute z-20 h-full w-full overflow-hidden p-2">
            <Image
              src={getURLfromImage({ image, transformation: 'c_fit,h_320,w_320' })}
              alt="Canonical image of feature"
              class="mx-auto h-full overflow-hidden rounded-lg text-base-100"
              layout="contain"
              showLoading={false}
              showError={false} />
          </div>
        </div>
      {:else}
        <div
          class="flex flex-col h-full w-full items-center justify-center gap-4 rounded-lg bg-base-300">
          <Icon src={Photo} class="h-8 w-8 text-base-content/50" />
          <span class="text-base-content/50">upload in gallery</span>
        </div>
      {/if}
    </a>
  {/await}
</div>
