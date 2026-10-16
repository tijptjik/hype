<script lang="ts">
// BITS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
let { label, multiline = false }: { label: string; multiline?: boolean } = $props()
</script>

<div class="bits-form__field" aria-hidden="true">
  <div class="bits-form__label"><span class="bits-form__label-text">{label}</span></div>
  <div class="bits-form__control-wrap">
    {#if multiline}
      <div class="flex h-32 flex-col gap-2 px-2 pt-3">
        <Skeleton class="h-3 w-11/12" />
        <Skeleton class="h-3 w-full" />
        <Skeleton class="h-3 w-3/4" />
      </div>
    {:else}
      <div class="flex h-10 items-center px-2"><Skeleton class="h-3 w-3/5" /></div>
    {/if}
  </div>
</div>
