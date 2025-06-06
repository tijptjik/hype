<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getMapCtx } from '$lib/context/map.svelte';
// SERVICES
import {
  fetchForwardGeocodeALSResult,
  processForwardGeocodeResult,
  extractNeighbourhoodFromAddress
} from '$lib/api/external/geocoding';
import { removeCountry, removeRegion, removeDistrict } from '$lib/utils/geocoding';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Language, MagnifyingGlass, MapPin } from '@steeze-ui/heroicons';
// TYPES
import type { Point } from 'geojson';
import type { FeatureForm } from '$lib/context/form.svelte';
import type { IconSource } from '@steeze-ui/heroicons';
import type { Locale } from '$lib/types';

// CONTEXT
let mapCtx = getMapCtx();

// STATE : PROPS
let { form }: { form: FeatureForm } = $props();
let featureForm = form.form;

// STATE : UI
let isGeocodingToEnrich = $state(false);
let isGeocodingToLocate = $state(false);
let isGeocoding = $derived(isGeocodingToEnrich || isGeocodingToLocate);

let sourceLocale: Locale = $state('en');

// STATE : DERIVED :: GEOMETRY
let [lng, lat] = $derived(($featureForm.geometry as Point).coordinates);

function getStreetAddressAndNeighbourhood(address: string): {
  streetAddress: string;
  neighbourhood: string | null;
} {
  // First remove Hong Kong SAR identifiers
  let cleaned = removeCountry(address);
  // Then remove any region identifiers
  cleaned = removeRegion(cleaned);
  // Then remove any district identifiers
  cleaned = removeDistrict(cleaned);

  // Extract neighbourhood from address
  const neighbourhood = extractNeighbourhoodFromAddress(cleaned);

  // Remove neighbourhood from address
  const streetAddress = neighbourhood
    ? cleaned.replace(neighbourhood, '').replace(/,(\s+)?$/, '')
    : cleaned;

  return { streetAddress, neighbourhood };
}

// Wrap the geocode action to handle loading state
async function handleGeocode(e: Event, updateCoords: boolean = false) {
  e.preventDefault();

  mapCtx.zoomToMarkerOnly = false;

  try {
    let addressToLookup = $featureForm.i18n?.[sourceLocale]?.displayAddress;
    if (!addressToLookup) return;

    // Clean the address before lookup
    let { streetAddress, neighbourhood } =
      getStreetAddressAndNeighbourhood(addressToLookup);

    const result = await fetchForwardGeocodeALSResult(streetAddress);
    if (result) {
      const processedResult = await processForwardGeocodeResult(
        result,
        neighbourhood,
        true, // generate display addresses
        lng,
        lat
      );

      if (processedResult) {
        featureForm.update(($form) => {
          $form.addressMeta = {
            ...$form.addressMeta,
            ...processedResult.addressMeta
          };
          if (updateCoords) {
            if (
              processedResult.addressMeta.longitude &&
              processedResult.addressMeta.latitude
            ) {
              ($form.geometry as Point).coordinates = [
                processedResult.addressMeta.longitude,
                processedResult.addressMeta.latitude
              ];
            }
          }
          // Update i18n
          Object.entries(processedResult.i18n).forEach(([locale, data]) => {
            if ($form.i18n) {
              $form.i18n[locale as Locale].displayAddress = data.displayAddress;
              $form.i18n[locale as Locale].displayAddressGen = data.displayAddressGen;
              $form.i18n[locale as Locale].addressProperties = data.addressProperties;
            }
          });

          return $form;
        });
      }
    }
  } finally {
    isGeocodingToEnrich = false;
    isGeocodingToLocate = false;
  }
}

let handleGeocodeToEnrich = (e: Event) => {
  isGeocodingToEnrich = true;
  handleGeocode(e);
};

let handleGeocodeToLocate = (e: Event) => {
  isGeocodingToLocate = true;
  handleGeocode(e, true);
};
</script>

{#snippet GeocodeButton(
  isGeocoding: boolean,
  onclick: (e: Event) => void,
  isLoading: boolean,
  icon: IconSource,
  label: string
)}
  <button
    class="btn-rounded btn bg-fuchsia-700 text-base-content transition-colors duration-300 hover:bg-fuchsia-800"
    class:px-6={isGeocoding}
    {onclick}
    disabled={isLoading}>
    {#if isGeocoding}
      <span class="loading loading-spinner loading-sm"></span>
      <span class="hidden md:block">{m.admin__geo_forward_geocode_loading()}</span>
    {:else}
      <Icon src={icon} class="h-4 w-4" />
      <span class="hidden md:block">
        {label}
      </span>
    {/if}
  </button>
{/snippet}

<div class="flex flex-row items-center gap-4">
  <div class="flex flex-row items-center gap-2">
    <label
      for="sourceLanguage"
      class="label flex flex-row items-center gap-2 text-neutral-500">
      <Icon src={Language} class="h-6 w-6" />
      {m.admin__geo_source_language()}
    </label>
    <select class="select select-bordered select-sm" bind:value={sourceLocale}>
      <option value="en">{m.lang__en()}</option>
      <option value="zh-hant">{m.lang__zh_hant()}</option>
      <option value="zh-hans">{m.lang__zh_hans()}</option>
    </select>
  </div>
  <div class="flex flex-row items-center gap-2">
    {@render GeocodeButton(
      isGeocodingToEnrich,
      handleGeocodeToEnrich,
      isGeocoding,
      MagnifyingGlass,
      m.admin__geo_forward_geocode_to_enrich()
    )}
    {@render GeocodeButton(
      isGeocodingToLocate,
      handleGeocodeToLocate,
      isGeocoding,
      MapPin,
      m.admin__geo_forward_geocode_to_locate()
    )}
  </div>
</div>
