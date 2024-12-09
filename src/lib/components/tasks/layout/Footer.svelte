<script lang="ts">
let { children }: { children: any } = $props();
</script>

<footer class="w-full p-0 m-0 flex-shrink-0 flex-grow-0 bg-base-100 rounded-bl-xl">
  {@render children()}
</footer>
