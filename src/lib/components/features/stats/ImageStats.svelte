<script lang="ts">
// COMPONENTS
import ProgressPips from '$lib/components/common/ProgressPips.svelte';
// SERVICES
import { calculateImageCompletion, getCachedFeatureBoolean } from '$lib/client/services/stats';
// ICONS
import { Photo } from '@steeze-ui/heroicons';
// TYPES
import type { Feature } from '$lib/types';
import type { AppCtx } from '$lib/context/app.svelte';

let {
  feature,
  appCtx,
  showTitle = true
}: {
  feature: Feature;
  appCtx: AppCtx;
  showTitle?: boolean;
} = $props();

const statuses = $derived([
  getCachedFeatureBoolean(appCtx, feature, 'image_hasImage', () => calculateImageCompletion(appCtx, feature).hasImage),
  getCachedFeatureBoolean(appCtx, feature, 'image_isOneImagePublished', () => calculateImageCompletion(appCtx, feature).isOneImagePublished),
  getCachedFeatureBoolean(appCtx, feature, 'image_isAllImagePublished', () => calculateImageCompletion(appCtx, feature).isAllImagePublished)
]);
</script>

<ProgressPips title="IMAGE" icon={Photo} {statuses} {showTitle} /> 