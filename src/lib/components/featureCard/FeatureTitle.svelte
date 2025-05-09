<script lang="ts">
// Icons
import Icon from '$lib/components/common/Icon.svelte';
import { Star, ChevronDown, XMark } from '@steeze-ui/heroicons';
// I18N
import { getI18nValue } from '$lib/i18n';
// Types
import type { Feature } from '$lib/types';

// STATE : PROPS
let { feature }: { feature: Feature; hideDescription?: boolean } = $props();

// STATE : LOCAL
let grade = $derived(
  feature.properties.find((p) => p.property.key === 'grade')?.value || ''
);
</script>

<div
  class="flex-basis-auto flex min-h-8 flex-shrink-0 flex-grow-0 items-start justify-between space-x-2 overflow-visible bg-black px-3 pb-2 w-100:px-6">
  <h2 class="h-full w-full overflow-visible text-lg text-white">
    {getI18nValue(feature, 'title')}
  </h2>
  <div class="flex items-center gap-1">
    <Icon src={Star} class="h-6 w-6" theme="solid" />
    <span>{grade}/5</span>
  </div>
</div>
