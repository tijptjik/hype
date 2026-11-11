<script lang="ts">
// TYPES
import type { SVGAttributes } from 'svelte/elements'

let props: SVGAttributes<SVGSVGElement> = $props()
</script>

<!-- Match ProIcons' 24px canvas, 1.5px stroke, and softly rounded geometry. -->
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
  <path d="M12 3.25 16.25 10.5h-8.5Z" />
  <rect x="3.25" y="14" width="6.75" height="6.75" rx="1.5" />
  <circle cx="17.375" cy="17.375" r="3.375" />
</svg>
