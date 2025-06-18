<script lang="ts">
// COMPONENTS
import ProgressPips from '$lib/components/common/ProgressPips.svelte';
// SERVICES
import { getCachedFeatureBoolean } from '$lib/client/services/stats';
// ICONS
import { CircleStack } from '@steeze-ui/heroicons';
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

const isPendingReview = $derived(
  getCachedFeatureBoolean(appCtx, feature, 'isPendingReview', (f: Feature) => f.isPendingReview)
);
const isPublished = $derived(
  getCachedFeatureBoolean(appCtx, feature, 'isPublished', (f: Feature) => f.isPublished)
);
const isVisitable = $derived(
  getCachedFeatureBoolean(appCtx, feature, 'isVisitable', (f: Feature) => f.isVisitable)
);
const isIntangible = $derived(
  getCachedFeatureBoolean(appCtx, feature, 'isIntangible', (f: Feature) => f.isIntangible)
);

const statuses = $derived([!isPendingReview, isPublished, isVisitable, !isIntangible]);
</script>

<ProgressPips title="STATUS" icon={CircleStack} {statuses} {showTitle} /> 