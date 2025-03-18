<script lang="ts">
import { cubicOut } from 'svelte/easing';
import { fade } from 'svelte/transition';

let renderedNumberOfTasks = $state(0);

let { numberOfTasks, key } = $props<{
  numberOfTasks: number;
  key: string;
}>();

// Constants for line generation
const MAX_BAMBOO_POLES = 16;
const NUMBER_OF_LINES = $derived(numberOfTasks);
const MAX_DEVIATION = 20; // percentage
const LINE_HEIGHT = 84; // pixels per task
const LINE_SPACING = 16; // pixels between each task
const HEADER_HEIGHT = 100; // pixels
const CONSTRAINT_OFFSET = 24; // pixels
const NO_OVERLAP_OFFSET = 12; // pixels

// Helper function to generate non-overlapping random points
function generateNonOverlappingPoints(
  rangeStart: number,
  rangeEnd: number,
  count: number,
  offset: number
) {
  const points: number[] = [];
  let attempts = 0;
  const maxAttempts = 1000; // Prevent infinite loops

  while (points.length < count && attempts < maxAttempts) {
    attempts++;
    const point = Math.random() * (rangeEnd - rangeStart) + rangeStart;
    if (points.every((p) => Math.abs(p - point) > offset)) {
      points.push(point);
    }
  }

  // If we couldn't generate enough points, space them evenly
  if (points.length < count) {
    const spacing = (rangeEnd - rangeStart) / (count - 1);
    return Array.from({ length: count }, (_, i) => rangeStart + spacing * i);
  }

  return points;
}

// Generate points based on key
function generatePointsForKey(key: string) {
  // Use key to seed random number generation
  const hash = Array.from(key).reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);

  Math.seed = hash;

  const startPoints = generateNonOverlappingPoints(
    0,
    100,
    Math.min(NUMBER_OF_LINES, 10),
    NO_OVERLAP_OFFSET
  );
  const endPoints = startPoints.map((start) => {
    const deviation = (Math.random() * 2 - 1) * MAX_DEVIATION;
    let endX = start + deviation;

    // If we exceed bounds, reflect the excess back in the opposite direction
    if (endX < 0) {
      endX = Math.abs(endX);
    }
    if (endX > 100) {
      endX = 100 - endX;
    }

    return endX;
  });

  return { startPoints, endPoints };
}

// Generate points once and store them
const { startPoints, endPoints } = generatePointsForKey(key);

// Calculate total height
let totalHeight = $derived(
  20 + numberOfTasks * LINE_HEIGHT + (numberOfTasks - 1) * LINE_SPACING
);

// Calculate path for each line
let paths = $derived(
  startPoints.map((start, i) => {
    const endX = endPoints[i];
    return `M ${start} 0 L ${endX} 100`;
  })
);
</script>

<div
  class="background-lines pointer-events-none absolute inset-0 top-[-20px] z-0 mx-auto w-[85%] @container/lines"
  style="height: {totalHeight}px">
  <svg
    transition:fade={{ duration: 250, easing: cubicOut }}
    width="100%"
    height="100%"
    preserveAspectRatio="none"
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="hsl(var(--bg-base-100))" stop-opacity="0.7"
        ></stop>
        <stop offset="100%" stop-color="hsl(var(--bg-base-100))" stop-opacity="0.7"
        ></stop>
      </linearGradient>
    </defs>
    {#each paths as path, i}
      <path
        d={path}
        stroke="url(#fade)"
        stroke-width="15"
        vector-effect="non-scaling-stroke"
        fill="none">
      </path>
    {/each}
  </svg>
</div>

<style>
path {
  transition: d 0.3s ease-in-out;
}
</style>
