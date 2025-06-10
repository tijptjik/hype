<script lang="ts">
import { m } from '$lib/i18n';
import { slide } from 'svelte/transition';
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronDown, ChevronRight } from '@steeze-ui/heroicons';

let { isOpen = false } = $props<{
  isOpen?: boolean;
}>();

let topicalAliveDolphinPinchOpen = $state(false);
let sunnyKeyMammothBlendOpen = $state(false);
let jumpyBroadWolfStartleOpen = $state(false);
let fairSoundGoatEnchantOpen = $state(false);
let jumpyDarkDogNudgeOpen = $state(false);
</script>

{#if isOpen}
  <div
    class="flex flex-col gap-4 border-b-4 border-primary px-6 py-3 pb-8"
    transition:slide>
    <h2 class="text-xl font-bold text-base-content">{m.these_helpful_moose_bend()}</h2>

    <div
      class="flex cursor-pointer items-center gap-2"
      onclick={() => (topicalAliveDolphinPinchOpen = !topicalAliveDolphinPinchOpen)}>
      <Icon
        src={topicalAliveDolphinPinchOpen ? ChevronDown : ChevronRight}
        class="h-5 w-5 flex-shrink-0 text-base-content" />
      <h3 class="text-lg text-base-content">{m.topical_alive_dolphin_pinch()}</h3>
    </div>
    {#if topicalAliveDolphinPinchOpen}
      <p class="pl-7 text-neutral-content" transition:slide>
        {@html m.extra_yummy_midge_wish()}
      </p>
    {/if}

    <div
      class="flex cursor-pointer items-center gap-2"
      onclick={() => (sunnyKeyMammothBlendOpen = !sunnyKeyMammothBlendOpen)}>
      <Icon
        src={sunnyKeyMammothBlendOpen ? ChevronDown : ChevronRight}
        class="h-5 w-5 flex-shrink-0 text-base-content" />
      <h3 class="text-lg text-base-content">{m.sunny_key_mammoth_blend()}</h3>
    </div>
    {#if sunnyKeyMammothBlendOpen}
      <div class="flex flex-col gap-2 pl-7" transition:slide>
        <p class="text-neutral-content">
          {@html m.petty_steep_dove_clasp()}
        </p>
        <h4 class="text-base-content">{m.settings_language_preferred()}</h4>
        <p class="text-neutral-content">{m.awful_loved_shrimp_cuddle()}</p>
        <h4 class="text-base-content">{m.same_late_parrot_accept()}</h4>
        <p class="text-neutral-content">{m.chunky_giant_worm_feast()}</p>
        <h4 class="text-base-content">{m.sleek_wise_husky_hack()}</h4>
        <ul class="list-inside list-disc space-y-1 text-neutral-content">
          {m.drab_lost_dove_grow()}
          <li class="pl-4 text-neutral-content">
            <b>{m.heroic_wise_ant_grip()}</b>{m.crazy_just_octopus_stop()}
          </li>
          <li class="pl-4 text-neutral-content">
            <b>{m.cute_salty_puma_sew()}</b>
            {m.long_least_baboon_blend()}
          </li>
          <li class="pl-4 text-neutral-content">
            <b>{m.zippy_game_grizzly_nourish()}</b>
            {m.bland_honest_crossbill_amuse()}
          </li>
        </ul>
      </div>
    {/if}

    <div
      class="flex cursor-pointer items-center gap-2"
      onclick={() => (jumpyBroadWolfStartleOpen = !jumpyBroadWolfStartleOpen)}>
      <Icon
        src={jumpyBroadWolfStartleOpen ? ChevronDown : ChevronRight}
        class="h-5 w-5 flex-shrink-0 text-base-content" />
      <h3 class="text-lg text-base-content">{m.jumpy_broad_wolf_startle()}</h3>
    </div>
    {#if jumpyBroadWolfStartleOpen}
      <p class="pl-7 text-neutral-content" transition:slide>
        {@html m.sleek_main_shell_taste()}
      </p>
    {/if}

    <div
      class="flex cursor-pointer items-center gap-2"
      onclick={() => (fairSoundGoatEnchantOpen = !fairSoundGoatEnchantOpen)}>
      <Icon
        src={fairSoundGoatEnchantOpen ? ChevronDown : ChevronRight}
        class="h-5 w-5 flex-shrink-0 text-base-content" />
      <h3 class="text-lg text-base-content">{m.fair_sound_goat_enchant()}</h3>
    </div>
    {#if fairSoundGoatEnchantOpen}
      <p class="pl-7 text-neutral-content" transition:slide>
        {@html m.trite_key_insect_tickle()}
      </p>
    {/if}

    <div
      class="flex cursor-pointer items-center gap-2"
      onclick={() => (jumpyDarkDogNudgeOpen = !jumpyDarkDogNudgeOpen)}>
      <Icon
        src={jumpyDarkDogNudgeOpen ? ChevronDown : ChevronRight}
        class="h-5 w-5 flex-shrink-0 text-base-content" />
      <h3 class="text-lg text-base-content">{m.jumpy_dark_dog_nudge()}</h3>
    </div>
    {#if jumpyDarkDogNudgeOpen}
      <p class="pl-7 text-neutral-content" transition:slide>
        {@html m.big_awake_grebe_seek()}
      </p>
    {/if}
  </div>
{/if}
