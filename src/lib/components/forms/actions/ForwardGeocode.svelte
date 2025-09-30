<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// DATA
import streetsJson from '$lib/map/streets.json';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// SERVICES
import {
  getAddressFromAddress,
  getCoordinatesFromAddress
} from '$lib/api/external/geocoding';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Language, MagnifyingGlass, MapPin } from '@steeze-ui/heroicons';
// TYPES
import type { Point } from 'geojson';
import type { FeatureForm } from '$lib/context/form.svelte';
import type { IconSource } from '@steeze-ui/heroicons';
import type { Locale } from '$lib/types';

// CONTEXT
let appCtx = getAppCtx();

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

// This function is no longer needed as address cleaning is handled in the orchestration layer

/**
 * Handle geocoding for address enrichment and/or coordinate updates
 *
 * @param e - The event that triggered the geocoding
 * @param updateCoords - Whether to update coordinates based on geocoding result
 */
async function handleGeocode(e: Event, updateCoords: boolean = false) {
  e.preventDefault();
  console.log(
    `🗺️ ForwardGeocode: Starting geocoding process, updateCoords: ${updateCoords}`
  );

  appCtx.zoomToMarkerOnly = false;

  try {
    let addressToLookup = $featureForm.i18n?.[sourceLocale]?.displayAddress;
    if (!addressToLookup) {
      console.warn('🗺️ ForwardGeocode: No address to lookup');
      return;
    }

    console.log(
      `🗺️ ForwardGeocode: Looking up address "${addressToLookup}" in locale "${sourceLocale}"`
    );

    if (updateCoords) {
      // Use getCoordinatesFromAddress for simple coordinate lookup
      const coordResult = await getCoordinatesFromAddress(addressToLookup);
      if (coordResult) {
        console.log(
          `🗺️ ForwardGeocode: Coordinate lookup successful: ${coordResult.coordinates}`
        );
        featureForm.update(($form) => {
          $form.addressMeta = {
            ...$form.addressMeta,
            ...coordResult.addressMeta
          };
          ($form.geometry as Point).coordinates = coordResult.coordinates;
          return $form;
        });
      }
    } else {
      // Use getAddressFromAddress for full address enrichment
      const addressResult = await getAddressFromAddress(addressToLookup);

      console.log('🗺️ VVV ForwardGeocode: Address result:', addressResult);

      if (addressResult) {
        featureForm.update(($form) => {
          $form.addressMeta = {
            ...$form.addressMeta,
            ...addressResult.addressMeta
          };

          // Update i18n data for all locales
          Object.entries(addressResult.i18n).forEach(([locale, data]) => {
            if ($form.i18n && data) {
              $form.i18n[locale as Locale].displayAddress = data.displayAddress;
              $form.i18n[locale as Locale].displayAddressGen = data.displayAddressGen;
              $form.i18n[locale as Locale].addressProperties = data.addressProperties;
            }
          });

          return $form;
        });
      }
    }
  } catch (error) {
    console.error('🗺️ ForwardGeocode: Geocoding failed:', error);
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
    class="btn-rounded btn btn-ghost text-sm font-bold transition-colors duration-300 disabled:text-base-content/70"
    class:px-6={isGeocoding}
    {onclick}
    disabled={isLoading}>
    {#if isGeocoding}
      <span class="loading loading-ring loading-sm"></span>
      <span class="hidden md:block">{m.admin__geo_forward_geocode_loading()}</span>
    {:else}
      <Icon src={icon} class="h-6 w-6 stroke-[2px]" />
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
      class="focus:ring-none label flex flex-row items-center gap-2 text-sm font-bold focus:border-none focus:outline-none active:border-none active:outline-none">
      <Icon src={Language} class="h-6 w-6 stroke-[2px]" />
      {m.admin__geo_source_language()}
    </label>
    <select class="select select-sm bg-glass-salmon-dark" bind:value={sourceLocale}>
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
