<script lang="ts">
import Deferred from '#lib/bits/custom/deferred/Deferred.svelte'
let { load }: { load: () => Promise<{ label: string }> } = $props()
let open = $state(false)
</script>
<button
  type="button"
  onclick={() => {
    open = !open
  }}
>
  Toggle section
</button>
{#if open}
  <Deferred {load}>
    {#snippet pending()}
      <div
        role="status"
        aria-label="Loading"
        aria-busy="true"
        class="bg-foreground/10 h-20 w-full"
      ></div>
    {/snippet}
    {#snippet children(module)}
      <p>{module.label}</p>
    {/snippet}
  </Deferred>
{/if}
