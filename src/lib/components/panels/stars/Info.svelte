<script lang="ts">
import * as m from '$lib/paraglide/messages';
import { slide } from 'svelte/transition';
let { isOpen = false } = $props<{
  isOpen?: boolean;
}>();
</script>

{#if isOpen}
  <div class="flex flex-col gap-4 px-6 py-3" transition:slide>
    <h2 class="text-xl font-bold text-base-content">{m.arable_pretty_dingo_amaze()}</h2>
    <p class="text-neutral-content">
      {@html m.such_tense_samuel_smile()}
    </p>
    <h3 class="text-lg text-base-content" style="will-change: height; contain: layout;">
      {m.alive_top_pelican_snap()}
    </h3>
    <p class="text-neutral-content">
      {@html m.neat_watery_wasp_buy()}
    </p>
    <h3 class="text-lg text-base-content" style="will-change: height; contain: layout;">
      {m.free_day_stork_dine()}
    </h3>
    <p class="text-neutral-content">
      {@html m.same_lower_orangutan_enchant()}
    </p>
  </div>
{/if}
