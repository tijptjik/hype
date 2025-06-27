<script lang="ts">
// I18n
import { m } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import PhotoFrame from '$lib/components/common/PhotoFrame.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { Photo } from '@steeze-ui/heroicons';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import { getUrlForResource, navigateOnAdmin } from '$lib/navigation';
import type { Feature, Image } from '$lib/types';

let SectionProps = $props();

let { form } = SectionProps.form;

// HANDLERS
const adminCtx = getAdminCtx();

// Get the feature from admin context to access the canonical image
const feature: Feature = $derived(adminCtx.appCtx.cache.feature.get($form?.id))!;
const canonicalImage = $derived(feature?.image as Image | null);
</script>

<div class="h-full w-full flex-1 basis-full 2xl:basis-1/3-gap-4">
  {#if canonicalImage}
    <a
      href={getUrlForResource(adminCtx, FirstClassResource.feature, $form.id, 'images')}
      onclick={() =>
        navigateOnAdmin(adminCtx, FirstClassResource.feature, $form.id, 'images')}>
      <div class="relative h-[512px] w-full overflow-hidden rounded-lg">
        <PhotoFrame class="h-full w-full" transformation="c_fill,h_512,w_512,q_auto" />
      </div>
    </a>
  {:else}
    <a
      class="h-full flex-1"
      href={getUrlForResource(adminCtx, FirstClassResource.feature, $form.id, 'images')}
      onclick={() =>
        navigateOnAdmin(adminCtx, FirstClassResource.feature, $form.id, 'images')}>
      <div
        class="bg-grain flex h-full min-h-[282px] w-full flex-1 flex-col items-center justify-center gap-4 rounded-lg border-3 border-primary bg-glass-300">
        <Icon src={Photo} class="h-8 w-8 text-base-content/50" />
        <span class="text-base-content/50">{m.left_dizzy_trout_peel()}</span>
      </div>
    </a>
  {/if}
</div>
