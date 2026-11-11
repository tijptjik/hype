<script lang="ts">
// TYPES
import type { SVGAttributes } from 'svelte/elements'

let props: SVGAttributes<SVGSVGElement> = $props()
</script>

<!-- Match Proicons' 24px canvas, 1.5px stroke, and rounded geometry. -->
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
  <path d="M4.25 11.5v7.75a2 2 0 0 0 2 2h11.5a2 2 0 0 0 2-2V11.5" />
  <path
    d="m2.75 8.75 2.5-5h13.5l2.5 5a3.25 3.25 0 0 1-6.5 0 2.75 2.75 0 0 1-5.5 0 3.25 3.25 0 0 1-6.5 0Z"
  />
  <path d="M9 21.25v-6.5h6v6.5" />
</svg>
