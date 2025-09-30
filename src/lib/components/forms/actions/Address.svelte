<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { MagnifyingGlass, GlobeAsiaAustralia } from '@steeze-ui/heroicons';
// TYPES
import type { FeatureForm } from '$lib/types';
import type { Point } from 'geojson';

type AddressActionsProps = {
  form: FeatureForm;
  actions: Record<string, (...args: any[]) => Promise<void>>;
};
// STATE : PROPS
let { actions, form }: AddressActionsProps = $props();

// STATE : CONTEXT :: FORM
let featureForm: FeatureForm['form'] = $derived(form.form);

// STATE : UI
let isGeocoding = $state(false);

/**
 * Handle reverse geocoding - lookup address from current coordinates
 *
 * This action calls the reverse geocoding service to get address information
 * for the feature's current coordinates and updates the form with the result.
 *
 * @param e - The event that triggered the reverse geocoding
 */
async function handleGeocode(e: Event) {
  console.log('🗺️ Address: Starting reverse geocoding process');
  isGeocoding = true;
  try {
    await actions.geocode(e);
    console.log('🗺️ Address: Reverse geocoding completed');
  } catch (error) {
    console.error('🗺️ Address: Reverse geocoding failed:', error);
  } finally {
    isGeocoding = false;
  }
}
</script>

<div class="flex flex-row items-center gap-4">
  <button
    class="btn-rounded btn btn-ghost font-bold text-base-content transition-colors duration-300"
    class:px-6={isGeocoding}
    onclick={handleGeocode}
    disabled={isGeocoding}>
    {#if isGeocoding}
      <span class="loading loading-ring loading-sm"></span>
      <span class="hidden md:block"
        >{m.admin__geo_lookup_address_at_location_loading()}</span>
    {:else}
      <Icon src={MagnifyingGlass} class="h-4 w-4" />
      <span class="hidden md:block">
        {m.admin__geo_lookup_address_at_location()}
      </span>
    {/if}
  </button>
</div>
