<script lang="ts">
// COMPONENTS
import ProgressPips from '$lib/components/common/ProgressPips.svelte';
// SERVICES
import {
  calculateImageCompletion,
  getCachedFeatureBoolean,
  getCachedFeatureTriState
} from '$lib/client/services/stats';
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

const statuses = $derived({
  'Has Image': getCachedFeatureBoolean(
    appCtx,
    feature,
    'hasImage',
    () => calculateImageCompletion(appCtx, feature).hasImage
  ),
  'One Published': getCachedFeatureTriState(
    appCtx,
    feature,
    'isOneImagePublished',
    () => calculateImageCompletion(appCtx, feature).isOneImagePublished
  ),
  'All Published': getCachedFeatureTriState(
    appCtx,
    feature,
    'isAllImagePublished',
    () => calculateImageCompletion(appCtx, feature).isAllImagePublished
  )
});
</script>

<ProgressPips title="IMAGE" icon={Photo} {statuses} {showTitle} />
