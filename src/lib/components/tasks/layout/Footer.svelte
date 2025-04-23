<script lang="ts">
let { children }: { children: any } = $props();
</script>

<footer class="m-0 w-full flex-shrink-0 flex-grow-0 rounded-bl-xl bg-base-100 p-0">
  {@render children()}
</footer>
