<script lang="ts">
// TYPES
import type { SVGAttributes } from 'svelte/elements'

let props: SVGAttributes<SVGSVGElement> = $props()
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 46 45"
  fill="none"
  aria-hidden="true"
  {...props}
>
  <!-- Use the same 46-unit drawing scale and fine outlines as the settings artwork. -->
  <g
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <!-- Circular palette construction, with a rounded inset thumb grip. -->
    <path
      d="M36.5 20A17 17 0 1 0 19.5 37H22A4 4 0 0 0 25.2 30.6A3.5 3.5 0 0 1 28 25H31.5A5 5 0 0 0 36.5 20Z"
    />
    <circle cx="18" cy="26" r="3.25" />
    <!-- Identical circular paint wells echo the round details in the neighbouring set. -->
    <circle cx="10" cy="12" r="2.75" />
    <circle cx="20" cy="8.5" r="2.75" />
    <circle cx="29" cy="14" r="2.75" />
    <circle cx="7.5" cy="22" r="2.75" />
    <!-- A rounded brush handle, parallel ferrule edges and a curved bristle outline. -->
    <path d="M32 30L40.5 11A1.8 1.8 0 0 1 43.7 12.6L35.8 32.2Z" />
    <path d="M32 30L35.8 32.2L33.8 35.6L30 33.4Z" />
    <path d="M30 33.4C26 35 29 39 23.5 41.5C29.5 44.5 36.5 40.5 33.8 35.6" />
    <path d="M31 37C31 39 29 40 27.5 40" />
    <!-- A circular paint droplet repeats the illustration set’s small round accents. -->
    <circle cx="39" cy="3.5" r="1.5" />
  </g>
</svg>
