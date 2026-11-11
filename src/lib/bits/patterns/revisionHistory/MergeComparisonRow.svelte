<script lang="ts">
// TYPES
import type { Snippet } from 'svelte'

let {
  incoming,
  existing,
  diffOnly,
  children,
}: {
  incoming: unknown
  existing: unknown
  diffOnly: boolean
  children: Snippet
} = $props()
// Compare the immutable source values so imports and edits never change row visibility.
const equal = $derived(JSON.stringify(incoming) === JSON.stringify(existing))
</script>

{#if !diffOnly || !equal}
  <div class="contents" data-merge-row>
    {@render children()}
  </div>
{/if}
