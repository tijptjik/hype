<script lang="ts">
// TYPES
import type { Snippet } from 'svelte'

// PROPS
let { children }: { children: Snippet } = $props()
</script>

<div class="min-h-0 flex-shrink-0">{@render children()}</div>
