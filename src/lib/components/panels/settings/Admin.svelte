<script lang="ts">
import { m } from '$lib/i18n';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// TYPES
import type { AdminPreferences } from '$lib/types';

const adminCtx = getAdminCtx();

// Get admin preferences from appCtx
const adminPreferences = $derived(adminCtx.appCtx.getUserPreferences().admin || {});

// Helper function to safely get preference state
const getPreferenceState = (code: keyof AdminPreferences): boolean => {
  return adminPreferences[code] || false;
};

// Admin preferences configuration
const preferencesConfig = [
  {
    name: m.settings_admin_map_collapsed(),
    description: m.settings_admin_map_collapsed_description(),
    code: 'isAdminMapCollapsed' as keyof AdminPreferences
  },
  {
    name: m.settings_admin_panel_auto_hide(),
    description: m.settings_admin_panel_auto_hide_description(),
    code: 'isPrimaryPanelAutoHide' as keyof AdminPreferences
  }
];
</script>

<Section
  title={m.settings_admin_title()}
  icon="/admin.svg"
  defaultOpen={true}
  iconVerticalPaddingClass="py-2 pr-4"
  position="right">
  <div
    class="scrollbar-thin flex min-h-0 w-full flex-col gap-2 overflow-y-auto pb-4 pl-4">
    {#each preferencesConfig as preference}
      <div
        class="min-h-18 flex w-full flex-row items-center justify-between gap-4 px-4 py-2 pr-[27px]">
        <div class="flex flex-col">
          <p class="font-normal text-base-content">
            {preference.name}
            {#if preference.description}
              <span class="pl-1.5 text-sm text-neutral-content"
                >{preference.description}</span>
            {/if}
          </p>
        </div>
        <input
          name={preference.code}
          type="checkbox"
          class="flex-grow-1 toggle toggle-primary toggle-sm flex-shrink-0"
          checked={getPreferenceState(preference.code)}
          onchange={(e) =>
            adminCtx.setAdminPreference(preference.code, e.currentTarget.checked)} />
      </div>
    {/each}
  </div>
</Section>
