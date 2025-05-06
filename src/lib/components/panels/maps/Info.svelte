<script lang="ts">
import { m } from '$lib/i18n';
import { slide } from 'svelte/transition';
let { isOpen = false } = $props<{
  isOpen?: boolean;
}>();
</script>

{#if isOpen}
  <div class="flex flex-col gap-4 px-6 py-3" transition:slide>
    <h2 class="text-xl font-bold text-base-content">{m.arable_pretty_dingo_amaze()}</h2>
    <h3 class="text-lg text-base-content">{m.aware_red_lobster_spark()}</h3>
    <p class="text-neutral-content">
      {@html m.slow_lower_wallaby_offer()}
    </p>
    <h3 class="text-lg text-base-content">{@html m.free_loud_meerkat_thrive()}</h3>
    <p class="text-neutral-content">{@html m.alert_suave_moth_glow()}</p>
    <p class="text-neutral-content">
      {@html m.slow_quiet_dolphin_seek()}
    </p>
  </div>
{/if}
