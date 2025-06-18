<script lang="ts">
// COMPONENTS
import ProgressPips from '$lib/components/common/ProgressPips.svelte';
// SERVICES
import { calculateTranslationCompletion } from '$lib/client/services/stats';
// ICONS
import { Language } from '@steeze-ui/heroicons';
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
  getCachedFeatureBoolean(appCtx, feature, 'translation_title', () => calculateTranslationCompletion(appCtx, feature).title),
  getCachedFeatureBoolean(appCtx, feature, 'translation_description', () => calculateTranslationCompletion(appCtx, feature).description),
  getCachedFeatureBoolean(appCtx, feature, 'translation_displayAddress', () => calculateTranslationCompletion(appCtx, feature).displayAddress)
]);
</script>

<ProgressPips title="TRANSLATION" icon={Language} {statuses} {showTitle} /> 