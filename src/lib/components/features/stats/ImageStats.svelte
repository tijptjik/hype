<script lang="ts">
// COMPONENTS
import ProgressPips from '$lib/components/common/ProgressPips.svelte';
// SERVICES
import { calculateImageCompletion } from '$lib/client/services/stats';
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

const imageCompletion = $derived(calculateImageCompletion(appCtx, feature));
const statuses = $derived([
  imageCompletion.hasImage,
  imageCompletion.isOneImagePublished,
  imageCompletion.isAllImagePublished
]);
</script>

<ProgressPips title="IMAGE" icon={Photo} {statuses} {showTitle} /> 