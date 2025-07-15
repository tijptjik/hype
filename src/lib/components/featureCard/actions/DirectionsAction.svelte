<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Map } from '@steeze-ui/heroicons';
// I18N
import { m } from '$lib/i18n';
// TYPES
import type { Feature, UserContributedFeature } from '$lib/types';
import type { Point } from 'geojson';

// PROPS
let { feature }: { feature: Feature | UserContributedFeature } = $props();

// HANDLERS
function getDirections() {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${(feature.geometry as Point).coordinates[1]},${(feature.geometry as Point).coordinates[0]}`;
  window.open(url, '_blank');
}
</script>

<button
  class="btn h-12 w-12 bg-base-400 uppercase hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300 w-64:h-auto w-64:w-auto"
  onclick={getDirections}>
  <Icon
    src={Map}
    class="h-6 w-6 stroke-2 font-bold text-primary w-64:hidden w-100:inline-block" />
  <span class="hidden w-64:inline-block">{m.alive_large_hawk_hunt()}</span>
</button>
