<script lang="ts">
let { text }: { text: string } = $props()
</script>

<div class="bits-theme flex flex-wrap justify-start gap-2 px-8.5 pt-2">
  <p class="text-base-content/60 pb-2 text-sm">{@html text}</p>
</div>
