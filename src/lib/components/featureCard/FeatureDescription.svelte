<script lang="ts">
// Icons
import Icon from '$lib/components/common/Icon.svelte';
import { Star } from '@steeze-ui/heroicons';
// I18N
import { getI18nValue } from '$lib/i18n';
// Types
import type { Feature } from '$lib/types';

// STATE : PROPS
let { feature }: { feature: Feature } = $props();

// STATE : LOCAL
let grade = $derived(
  feature.properties.find((p) => p.property.key === 'grade')?.value || ''
);
</script>

<div class="space-y-2 bg-black pb-2">
  <div class="flex items-center justify-between px-3 w-100:px-6">
    <h2 class="text-lg text-white">
      {getI18nValue(feature, 'title')}
    </h2>
    <div class="flex items-center gap-1">
      <Icon src={Star} class="h-6 w-6" theme="solid" />
      <span>{grade}/5</span>
    </div>
  </div>

  <p class="px-3 text-sm font-thin tracking-tight text-gray-300 w-100:px-6">
    {getI18nValue(feature, 'description')}
  </p>
</div>
