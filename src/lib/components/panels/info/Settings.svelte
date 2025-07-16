<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// SVELTE
import { slide } from 'svelte/transition';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
// ICONS
import { ChevronDown, ChevronRight } from '@steeze-ui/heroicons';

let { isOpen = false } = $props<{
  isOpen?: boolean;
}>();

// ═══════════════════════
// 2. SECTION CONFIGURATION
// ═══════════════════════

interface SettingsSection {
  id: string;
  titleKey: () => string;
  contentKey?: () => string;
  isOpen: boolean;
  hasComplexContent?: boolean;
}

let sections = $state<SettingsSection[]>([
  {
    id: 'account',
    titleKey: m.topical_alive_dolphin_pinch,
    contentKey: m.extra_yummy_midge_wish,
    isOpen: false
  },
  {
    id: 'language',
    titleKey: m.settings__language,
    isOpen: false,
    hasComplexContent: true
  },
  {
    id: 'contributionCredit',
    titleKey: m.settings_contributor_title,
    contentKey: m.sleek_main_shell_taste,
    isOpen: false
  },
  {
    id: 'defaultMaps',
    titleKey: m.settings_default_map_title,
    contentKey: m.trite_key_insect_tickle,
    isOpen: false
  },
  {
    id: 'experimental',
    titleKey: m.settings_experimental_title,
    contentKey: m.big_awake_grebe_seek,
    isOpen: false
  }
]);

// ═══════════════════════
// 3. SECTION HANDLERS
// ═══════════════════════

function toggleSection(sectionId: string) {
  const section = sections.find((s) => s.id === sectionId);
  if (section) {
    section.isOpen = !section.isOpen;
  }
}
</script>

{#if isOpen}
  <div
    class="flex flex-col gap-4 border-b-4 border-primary px-6 py-3 pb-8"
    transition:slide>
    <h2 class="text-xl font-bold text-base-content">{m.these_helpful_moose_bend()}</h2>

    {#each sections as section (section.id)}
      <div
        class="flex cursor-pointer items-center gap-2"
        onclick={() => toggleSection(section.id)}>
        <Icon
          src={section.isOpen ? ChevronDown : ChevronRight}
          class="h-5 w-5 flex-shrink-0 text-base-content" />
        <h3 class="text-lg text-base-content">{section.titleKey()}</h3>
      </div>

      {#if section.isOpen}
        {#if section.id === 'language'}
          <!-- Special handling for language section with complex content -->
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
                <b>{m.heroic_wise_ant_grip()}</b>
                {m.crazy_just_octopus_stop()}
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
        {:else if section.contentKey}
          <!-- Standard content for other sections -->
          <p class="pl-7 text-neutral-content" transition:slide>
            {@html section.contentKey()}
          </p>
        {/if}
      {/if}
    {/each}
  </div>
{/if}
