<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { MapPin } from '@steeze-ui/heroicons';
// TRANSITIONS
import { fade } from 'svelte/transition';
// TYPES
import type { FeatureForm } from '$lib/types';
import type { Point } from 'geojson';

// CONFIG
const coordinateLabels = [m.admin__geo_latitude(), m.admin__geo_longitude()];

// STATE : PROPS
let extraProps: { form: FeatureForm } = $props();

// STATE : CONTEXT
let { form } = extraProps.form;

// HANDLERS
function copyCoordinates() {
  const coords = ($form.geometry as Point).coordinates.join(',');
  navigator.clipboard.writeText(coords);
}
</script>

<div class="flex select-none flex-row items-center gap-6">
  <Icon
    src={MapPin}
    class="hover:text-content/70 h-6 w-6 cursor-pointer select-none active:text-neutral-content"
    onclick={copyCoordinates} />
  {#each coordinateLabels as label, index}
    <div class="flex select-none flex-row items-center gap-3">
      <p class="font-spaced hidden text-sm xl:block">{label}</p>
      {#key ($form.geometry as Point).coordinates}
        <pre
          in:fade={{ duration: 300 }}
          class="font-mono text-lg font-light text-base-content/50">{(
            $form.geometry as Point
          ).coordinates[index].toFixed(5)}</pre>
      {/key}
    </div>
  {/each}
</div>
