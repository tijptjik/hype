<script lang="ts">
import type { Snippet } from 'svelte'
let { children }: { children?: Snippet } = $props()
</script>

<span data-testid="mock-svelte-component"> {@render children?.()} </span>
