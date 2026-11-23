<script lang="ts">
// COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import {
  MATCHER_CATEGORIES,
  type MatcherCategory,
  type MatcherCounts,
} from '#lib/locations/matcherCategories.js'
// TYPES
import type { HeaderButtonActionConfig } from '#lib/bits/patterns/layout/header/index.js'
let {
  counts,
  category,
  oncategory,
  actions,
  onnext,
  disabled,
}: {
  counts: MatcherCounts | null
  category: MatcherCategory
  oncategory: (value: MatcherCategory) => void
  actions: HeaderButtonActionConfig[]
  onnext: () => void
  disabled: boolean
} = $props()
</script>
<div class="flex items-center gap-3">
  <section
    aria-label="Location matching progress"
    class="flex items-center gap-3 text-xs tabular-nums"
  >
    {#if counts}
      {#each MATCHER_CATEGORIES as item}
        <button
          type="button"
          aria-pressed={category === item.id}
          {disabled}
          onclick={() => oncategory(item.id)}
          class="border-border hover:bg-muted aria-pressed:bg-muted rounded border px-2 py-1 text-left"
        >
          <span class="block text-lg font-semibold">{counts[item.id]}</span>
          <span class="block whitespace-nowrap">{item.label}</span>
        </button>
      {/each}
    {:else}
      <Skeleton class="h-9 w-48" />
    {/if}
  </section>
  <Button text="Next Location" {disabled} onClick={onnext} />
  {#each actions as action}
    <Button
      text={action.text}
      iconComponent={action.icon}
      disabled={action.disabled}
      onClick={action.onClick}
      color={action.color}
      style={action.style}
    />
  {/each}
</div>
