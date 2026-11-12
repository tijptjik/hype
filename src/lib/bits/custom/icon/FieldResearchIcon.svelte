<script lang="ts">
// TYPES
import type { SVGAttributes } from 'svelte/elements'

let props: SVGAttributes<SVGSVGElement> = $props()
</script>

<!-- Buildings frame a foreground camera, using the navigation's Proicons stroke. -->
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="1em"
  height="1em"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  {...props}
>
  <path d="M2 18V5l6-3v8M16 10V4h6v14M5 7v1m0 3v1M19 7v1m0 3v1" />
  <path d="M7 13h2l1-2h4l1 2h2a2 2 0 0 1 2 2v5H5v-5a2 2 0 0 1 2-2Z" />
  <circle cx="12" cy="16" r="2" />
</svg>
