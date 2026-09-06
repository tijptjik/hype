<script lang="ts">
let { onClick }: { onClick: () => void } = $props()
</script>

<button type="button" onclick={onClick}>Save</button>
