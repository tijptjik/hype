<script lang="ts">
import { m } from '$lib/i18n'
import { slide } from 'svelte/transition'
let { isOpen = false } = $props<{
  isOpen?: boolean
}>()
</script>

{#if isOpen}
  <div class="flex flex-col gap-4 px-6 py-3" transition:slide>
    <h2 class="text-xl font-bold text-base-content">{m.these_helpful_moose_bend()}</h2>
    <p class="text-neutral-content">{@html m.bad_honest_pigeon_borrow()}</p>
    <h3 class="text-lg text-base-content">{m.still_raw_tadpole_arise()}</h3>
    <p class="text-neutral-content">{m.watery_cuddly_niklas_harbor()}</p>
    <h3 class="text-lg text-base-content">{m.busy_agent_poodle_bloom()}</h3>
    <p class="text-neutral-content">{@html m.arable_mild_snake_pick()}</p>
    <h3 class="text-lg text-base-content">{m.dizzy_ornate_ocelot_peel()}</h3>
    <p class="text-neutral-content">{@html m.drab_many_gibbon_fulfill()}</p>
  </div>
{/if}
