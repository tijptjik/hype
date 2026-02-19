<script lang="ts">
let { children } = $props()
</script>

<div class="h-[232px] w-full flex-shrink-0 @container">{@render children()}</div>
