<script lang="ts">
// Animation
import { fade, fly } from 'svelte/transition';
// I18N
import { getI18nValue } from '$lib/i18n';
// Svelte
import { getContext, onMount } from 'svelte';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
// Types
import type { Feature } from '$lib/types';

// STATE : PROPS
let { feature }: { feature: Feature } = $props();

// STATE : CONTEXT
const mapContext = getMapContext();

let innerWidth = $state();

let leftOpen = $derived(
  mapContext.state.panels.filters || mapContext.state.panels.settings
);
let rightOpen = $derived(mapContext.state.panels.maps || mapContext.state.panels.stars);

function getOffset() {
  const boundsMap = document.getElementById('map')?.getBoundingClientRect();
  const boundsLeftPanel = document
    .getElementById('leftPanel')
    ?.getBoundingClientRect() || { width: 0 };
  const boundsRightPanel = document
    .getElementById('rightPanel')
    ?.getBoundingClientRect() || { width: 0 };
  const boundsPortal = document
    .getElementById('feature-card-portal')
    ?.getBoundingClientRect();
  if (!boundsMap || !boundsPortal) return { xOffset: 0, yOffset: 0 };
  return {
    xOffset:
      boundsPortal.left -
      boundsMap.width / 2 +
      boundsPortal.width / 2 +
      (leftOpen ? boundsLeftPanel?.width : 0) -
      (rightOpen ? boundsRightPanel?.width : 0),
    yOffset: boundsPortal.top - boundsMap.height / 2 + boundsPortal.height / 2
  };
}

function flyToFeature() {
  setTimeout(() => {
    let { xOffset, yOffset } = getOffset();
    if (feature && mapContext.map) {
      mapContext.map.flyTo({
        center: [
          feature.geometry.coordinates[0],
          feature.geometry.coordinates[1]
        ],
        offset: [xOffset, yOffset],
        zoom: 16,
        duration: 2000
      });
    }
  }, 300);
}

$effect(() => {
  innerWidth;
  feature && flyToFeature();
});

$effect(() => {
  innerWidth && flyToFeature();
});

$effect(() => {
  leftOpen;
  rightOpen;
  flyToFeature();
});

function wrapText(text: string, maxWidth: number = 170): string[] {
  const address = text.replace(', Hong Kong', '').replace('Hong Kong, ', '');
  // Try last comma
  const lastCommaIndex = address.lastIndexOf(',');
  if (lastCommaIndex > -1) {
    const parts = [
      address.slice(0, lastCommaIndex),
      address.slice(lastCommaIndex + 1).trim()
    ];
    if (parts.every((part, index) => measureTextWidth(part) <= maxWidth - index * 40)) {
      return parts;
    }
  }

  // Try first comma
  const firstCommaIndex = address.indexOf(',');
  if (firstCommaIndex > -1 && firstCommaIndex !== lastCommaIndex) {
    const parts = [
      address.slice(0, firstCommaIndex),
      address.slice(firstCommaIndex + 1).trim()
    ];
    if (parts.every((part) => measureTextWidth(part) <= maxWidth)) {
      return parts;
    }
  }

  // Try both commas
  if (
    firstCommaIndex > -1 &&
    lastCommaIndex > -1 &&
    firstCommaIndex !== lastCommaIndex
  ) {
    const parts = [
      address.slice(0, firstCommaIndex),
      address.slice(firstCommaIndex + 1, lastCommaIndex).trim(),
      address.slice(lastCommaIndex + 1).trim()
    ];
    if (parts.every((part) => measureTextWidth(part) <= maxWidth)) {
      return parts;
    }
  }

  // Fall back to word wrapping
  return wordWrap(address, maxWidth);
}

function wordWrap(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const withWord = `${currentLine} ${word}`;

    if (measureTextWidth(withWord) <= maxWidth) {
      currentLine = withWord;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  lines.push(currentLine);
  return lines;
}

function measureTextWidth(text: string): number {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return 0;

  context.font = '0.875rem/1.25rem sans-serif'; // text-sm/8
  return context.measureText(text).width;
}

let addressLines = $state(wrapText(getI18nValue(feature, 'displayAddress')));

$effect(() => {
  addressLines = wrapText(getI18nValue(feature, 'displayAddress'));
});
</script>

<svelte:window bind:innerWidth />

<div
  id="feature-card-portal"
  class="pointer-events-none relative mr-6 h-[200px] w-[200px] pr-3 w-96:pr-12">
  <svg
    class="absolute inset-0 h-full w-full"
    viewBox="0 0 100 100"
    preserveAspectRatio="xMidYMid meet">
    <defs>
      <mask id="portal-mask">
        <rect width="100" height="100" fill="white"></rect>
        <circle cx="50" cy="50" r="48" fill="black"></circle>
      </mask>
    </defs>

    <rect width="100" height="100" fill="black" mask="url(#portal-mask)"></rect>

    <circle cx="50" cy="50" r="48" fill="none" stroke="#4379CF" stroke-width="2"
    ></circle>
  </svg>

  <div
    class="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white">
  </div>
  <div
    class="absolute right-0 top-1/2 flex -translate-y-20 rotate-[-15deg] flex-col items-end gap-1 w-92:translate-x-6"
    style="width: max-content;">
    {#each addressLines as line, index}
      <span
        class="inline-block whitespace-nowrap rounded-full bg-[#1D232A] px-2 py-0.5 text-sm/6"
        style="transform: translateX(-{index * 10}px)"
        in:fly={{ duration: 300, x: -100, delay: index * 100 }}
        out:fly={{ duration: 300, x: 100, delay: index * 100 }}>
        {line}
      </span>
    {/each}
  </div>
</div>
