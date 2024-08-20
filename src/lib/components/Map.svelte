<script lang="ts">
	// noinspection TypeScriptCheckImport
	import { PUBLIC_MAPTILER_KEY } from '$env/static/public';
	import { type MapStore, MAPSTORE_CONTEXT_KEY } from '$lib/stores';
	// import { AttributionControl, GeolocateControl, Map, NavigationControl, ScaleControl } from 'maplibre-gl';
	import { getContext, onMount } from 'svelte';

	let mapStore: MapStore = getContext(MAPSTORE_CONTEXT_KEY);
	let mapContainer: HTMLDivElement;

	function loadScript(src) {
		return new Promise((resolve, reject) => {
			const script = document.createElement('script');
			script.src = src;

			document.body.appendChild(script);

			script.addEventListener('load', () => resolve(script));
			script.addEventListener('error', () => reject(script));
		});
	}


	onMount(async () => {
		// eslint-disable-next-line no-undef
		await loadScript('https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.js')
		const maplibre = maplibregl;
		console.log('🗺️ Sideloaded MapLibre v'+maplibre?.getVersion());
		// const map = new Map({
		const map = new maplibre.Map({
			container: mapContainer,
			style: `https://api.maptiler.com/maps/streets/style.json?key=${PUBLIC_MAPTILER_KEY}`,
			center: [114.15166, 22.28781],
			pitch: 60,
			bearing: 68,
			zoom: 14.32,
			hash: true,
			attributionControl: false
		});
		// map.addControl(new NavigationControl({}), 'top-right');
		// map.addControl(
		// 	new GeolocateControl({
		// 		positionOptions: { enableHighAccuracy: true },
		// 		trackUserLocation: true
		// 	}),
		// 	'top-right'
		// );
		// map.addControl(new ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-left');
		// map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

		mapStore?.set(map);
	});
</script>

<div class="map flex-grow full-w relative" data-testid="map" bind:this={mapContainer}></div>

<style>
    @import 'https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.css';
</style>
