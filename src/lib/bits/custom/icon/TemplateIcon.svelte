<script lang="ts">
// TYPES
import type { SVGAttributes } from 'svelte/elements'

let props: SVGAttributes<SVGSVGElement> = $props()
</script>

<!-- Match the navigation's Proicons geometry with a template variable inside braces. -->
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
  <path
    d="M7 3H6a2 2 0 0 0-2 2v4a3 3 0 0 1-2 3 3 3 0 0 1 2 3v4a2 2 0 0 0 2 2h1M17 3h1a2 2 0 0 1 2 2v4a3 3 0 0 0 2 3 3 3 0 0 0-2 3v4a2 2 0 0 1-2 2h-1"
  />
  <path d="M15 8.5 13.5 14c-.7 2.5-5.5 2.5-5.5-1 0-4.5 5-6 6-1l1 3.5h1" />
</svg>
