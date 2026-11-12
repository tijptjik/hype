<script lang="ts">
// TYPES
import type { SVGAttributes } from 'svelte/elements'

let props: SVGAttributes<SVGSVGElement> = $props()
</script>

<!-- Use Hype's regular square spiral so the Community mark remains legible at small sizes. -->
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="1em"
  height="1em"
  viewBox="96 96 320 320"
  fill="currentColor"
  aria-hidden="true"
  {...props}
>
  <path
    fill-rule="evenodd"
    d="M105 105H407V329H187V188H325V285H363V149H149V367H363V411H105ZM231 232V285H280V232Z"
  />
</svg>
