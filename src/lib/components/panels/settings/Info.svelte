<script lang="ts">
import { m } from '$lib/i18n';
import { slide } from 'svelte/transition';
let { isOpen = false } = $props<{
  isOpen?: boolean;
}>();
</script>

{#if isOpen}
  <div class="flex flex-col gap-4 px-6 py-3" transition:slide>
    <h2 class="text-xl font-bold text-base-content">{m.these_helpful_moose_bend()}</h2>
    <h3 class="text-lg text-base-content">{m.topical_alive_dolphin_pinch()}</h3>
    <p class="text-neutral-content">
      {m.extra_yummy_midge_wish()}
    </p>
    <h3 class="text-lg text-base-content">{m.sunny_key_mammoth_blend()}</h3>
    <p class="text-neutral-content">
      {m.petty_steep_dove_clasp()}
    </p>
    <h3 class="text-lg text-base-content">{m.jumpy_broad_wolf_startle()}</h3>
    <p class="text-neutral-content">
      {m.sleek_main_shell_taste()}
    </p>
    <h3 class="text-lg text-base-content">{m.fair_sound_goat_enchant()}</h3>
    <p class="text-neutral-content">
      {m.trite_key_insect_tickle()}
    </p>
    <h3 class="text-lg text-base-content">{m.jumpy_dark_dog_nudge()}</h3>
    <p class="text-neutral-content">{m.big_awake_grebe_seek()}</p>
  </div>
{/if}
