<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// UTILS
import { formatDate } from '$lib';
// CONTEXT
import { getImageCtx } from '$lib/context/image.svelte';
import { getAppCtx } from '$lib/context/app.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Camera, MapPin } from '@steeze-ui/heroicons';
// TYPES
import type { Image, Feature } from '$lib/types';
import type { IconSource } from '@steeze-ui/heroicons';

// CONTEXT
const imageCtx = getImageCtx();
const appCtx = getAppCtx();

let { currentImage }: { currentImage: Image } = $props();

let showContributor = $state(false);

let toggleAttribution = () => {
  showContributor = !showContributor;
};

// Get feature data with proper null checking
const contextId = $derived(imageCtx.state.context?.ctxId);
const feature = $derived(contextId ? appCtx.features.get(contextId) : undefined);
// Note: Using simple fallbacks since user cache and createdAt may not be available
const contributorName = $derived(
  (feature as Feature)?.contributor?.attribution || m.anonymous()
);
const createdAt = $derived(
  'createdAt' in (feature || {}) ? (feature as any).createdAt : undefined
);
</script>

{#snippet metadataItem(
  icon: IconSource,
  contributorName: string | null,
  contributedAt: string | null,
  row: number
)}
  <div
    class="h-6 {showContributor
      ? row == 1
        ? '-translate-y-[60px] opacity-100 delay-100'
        : '-translate-y-[60px] opacity-100 delay-0'
      : row == 1
        ? '-translate-y-6 opacity-0 delay-100'
        : '-translate-y-6 opacity-0 delay-0'} flex font-mono text-xs text-white transition-all duration-300">
    <div class="flex h-6 gap-2 rounded-l bg-base-300/80 px-2 py-1">
      <Icon src={icon} class="h-4 w-4" />
      <span>{m.clear_patchy_bobcat_wish()}</span>
      <span class="font-bold">
        {contributorName || m.jumpy_misty_panther_scold()}
      </span>
    </div>
    <div class="h-6 rounded-r bg-base-300/70 px-2 py-1 font-normal">
      <span class="font-bold">
        {formatDate(contributedAt ?? '')}
      </span>
    </div>
  </div>
{/snippet}

<div class="absolute z-30 flex w-80 flex-col items-start justify-start gap-1.5">
  {@render metadataItem(MapPin, contributorName, createdAt, 1)}
  {@render metadataItem(
    Camera,
    currentImage.attribution || currentImage.credit,
    currentImage.capturedAt || currentImage.createdAt,
    2
  )}
</div>
<div
  class="z-40 cursor-pointer rounded bg-black/50 px-1.5 py-1 text-xs text-white"
  onmouseenter={toggleAttribution}
  onmouseleave={toggleAttribution}
  ontouchstart={toggleAttribution}
  onkeydown={toggleAttribution}>
  ⓘ
</div>
