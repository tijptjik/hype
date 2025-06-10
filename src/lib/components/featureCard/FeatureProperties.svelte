<script lang="ts">
// I18N
import { getI18n, getFPI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// SERVICES
import { sortProperties } from '$lib/client/services/property';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// Types
import type { Feature } from '$lib/types';

// STATE : PROPS
let { feature }: { feature: Feature } = $props();

// STATE : CONTEXT
const appCtx = getAppCtx();

// STATE : SESSION
const userPreferences = $derived(appCtx.getUserPreferences());

// FUNCTIONS
// Sort properties by type (classifiers first) then rank
const sortedProperties = $derived(sortProperties(feature.properties));
</script>

<div
  class="justify-flex-start pointer-events-auto flex h-48 flex-wrap items-start gap-2 overflow-y-auto overscroll-contain pl-3 pr-0 w-100:pl-6 w-120:gap-4 dir-rtl">
  {#each sortedProperties.filter((p) => p.property?.key !== 'grade' && getFPI18n(p, userPreferences) !== '-' && getFPI18n(p, userPreferences) !== m.great_crazy_squid_promise()) as property}
    <div
      class="flex max-h-48 flex-[0_0_calc(50%-4px)] flex-col justify-evenly w-120:flex-[0_0_calc(50%-16px)] dir-ltr">
      <span class="font-mono text-xs font-normal uppercase tracking-wide text-gray-400">
        {getI18n(property.property as any, 'label', userPreferences)}
      </span>
      <span class="overflow-y-auto overscroll-contain font-medium">
        {getFPI18n(property, userPreferences)}
      </span>
    </div>
  {/each}
</div>