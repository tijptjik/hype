<script lang="ts">
// COMPONENTS
import ProgressPips from '$lib/components/common/ProgressPips.svelte';
// SERVICES
import { calculateContentCompletion, getCachedFeatureBoolean } from '$lib/client/services/stats';
// ICONS
import { BookOpen } from '@steeze-ui/heroicons';
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
  getCachedFeatureBoolean(appCtx, feature, 'content_title', () => calculateContentCompletion(appCtx, feature).title),
  getCachedFeatureBoolean(appCtx, feature, 'content_description', () => calculateContentCompletion(appCtx, feature).description)
]);
</script>

<ProgressPips title="CONTENT" icon={BookOpen} {statuses} {showTitle} /> 