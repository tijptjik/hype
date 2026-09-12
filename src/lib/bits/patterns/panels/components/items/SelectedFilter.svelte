<script lang="ts">
let { text }: { text: string } = $props()
</script>

<div class="bits-theme bits-panel-selected-filter">
  <p class="bits-panel-selected-filter__text">{@html text}</p>
</div>
