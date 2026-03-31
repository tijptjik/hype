<script lang="ts">
let { children } = $props()
</script>

<span data-testid="mock-svelte-component"> {@render children?.()} </span>
