<script lang="ts">
let { state }: { state?: { message?: string } } = $props()
</script>
<p>{state?.message ?? 'Loading analytics'}</p>
