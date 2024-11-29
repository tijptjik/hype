<script lang="ts">
let { grade }: { grade?: string } = $props();

// TODO Add update functionality
</script>

{#if grade}
  <div class="rating">
    {#each Array(5) as _, i}
      <input
        type="radio"
        name="rating"
        class="mask mask-star-{grade} bg-primary"
        checked={i === 1} />
    {/each}
  </div>
{:else}
  <div class="rating">
    {#each Array(5) as _, i}
      <input type="radio" name="rating" class="mask mask-star bg-primary" />
    {/each}
  </div>
{/if}
