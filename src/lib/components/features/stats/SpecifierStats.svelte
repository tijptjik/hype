<script lang="ts">
// COMPONENTS
import ProgressPips from '$lib/components/common/ProgressPips.svelte';
// SERVICES
import { calculateSpecifierCompletion } from '$lib/client/services/stats';
// ICONS
import { Pencil } from '@steeze-ui/heroicons';
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

const specifierCompletion = $derived(calculateSpecifierCompletion(appCtx, feature));
const statuses = $derived(specifierCompletion.map(spec => spec.present));
</script>

<ProgressPips title="FREEFORM" icon={Pencil} {statuses} {showTitle} /> 