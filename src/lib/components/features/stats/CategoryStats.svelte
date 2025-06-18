<script lang="ts">
// COMPONENTS
import ProgressPips from '$lib/components/common/ProgressPips.svelte';
// SERVICES
import { calculateCategoryCompletion, getCachedFeatureBoolean } from '$lib/client/services/stats';
// ICONS
import { Tag } from '@steeze-ui/heroicons';
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

const categoryCompletion = $derived(calculateCategoryCompletion(appCtx, feature));
const statuses = $derived(categoryCompletion.map((cat, index) => 
  getCachedFeatureBoolean(appCtx, feature, `category_${index}_present`, () => cat.present)
));
</script>

<ProgressPips title="CATEGORIES" icon={Tag} {statuses} {showTitle} /> 