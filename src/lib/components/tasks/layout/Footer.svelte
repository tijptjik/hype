<script lang="ts">
let { children }: { children: any } = $props();
</script>

<footer class="h-[320px] w-full">
  {@render children()}
</footer>
