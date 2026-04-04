<script lang="ts">
// SVELTE
import { fly } from 'svelte/transition'
// TYPES
let {
  lines,
  featureKey,
}: {
  lines: string[]
  featureKey: string
} = $props()

const addressLineRightPadding = [24, 12, 0, 12, 24] as const
</script>

<div
  class="pointer-events-none absolute right-2 top-1/2 flex -translate-y-25.5 translate-x-3 flex-col items-end gap-1 overflow-visible transition-all duration-300 w-100:translate-x-5"
  style="width: max-content;"
>
  {#each lines as line, index}
    {#key `${featureKey}-${index}`}
      <span
        class={`pointer-events-none absolute inline-block origin-bottom-right whitespace-nowrap rounded-full bg-[#1D232A] ${
          line !== '' ? 'px-2 py-0.5 text-sm/6' : ''
        }`}
        style={`transform: translateX(-${addressLineRightPadding[index] ?? 0}px); rotate: -17deg; top: ${index * 34}px;`}
        in:fly={{ duration: 300, x: -100, delay: index * 200 }}
        out:fly={{ duration: 200, x: 100, delay: index * 200 }}
      >
        {line}
      </span>
    {/key}
  {/each}
</div>
