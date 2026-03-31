<script lang="ts">
import { m } from '$lib/i18n'
// BITS
import { Switch } from '$lib/bits'
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// TYPES
import type { PanelProps } from '$lib/types'
import type {
  AdminPreferenceCode,
  AdminPreferences,
} from '$lib/db/zod/schema/user.types'

// CONTEXT
const adminCtx = getAdminCtx()

// PROPS
let { ...panelProps }: PanelProps = $props()

// Get admin preferences from appCtx
const adminPreferences: AdminPreferences = $derived(
  adminCtx.appCtx.getUserPreferences().admin || {},
)

// Helper function to safely get preference state
const getPreferenceState = (code: AdminPreferenceCode): boolean => {
  return adminPreferences[code] || false
}

// Admin preferences configuration
const preferencesConfig: {
  name: string
  description: string
  code: AdminPreferenceCode
}[] = [
  {
    name: m.settings_admin_map_collapsed(),
    description: m.settings_admin_map_collapsed_description(),
    code: 'isAdminMapCollapsed' as keyof AdminPreferences,
  },
  {
    name: m.settings_admin_panel_collapsed(),
    description: m.settings_admin_panel_collapsed_description(),
    code: 'isPrimaryPanelCollapsed' as keyof AdminPreferences,
  },
  {
    name: m.settings_admin_panel_auto_hide(),
    description: m.settings_admin_panel_auto_hide_description(),
    code: 'isPrimaryPanelAutoHide' as keyof AdminPreferences,
  },
]
</script>

{#if panelProps.isAdmin}
  <Section
    title={m.menu_admin()}
    icon="/admin.svg"
    defaultOpen={true}
    iconVerticalPaddingClass="py-2 pr-4"
    {...panelProps}
  >
    <div class="flex min-h-0 w-full flex-col gap-2 overflow-y-auto pb-4 pl-4">
      {#each preferencesConfig as preference}
        <div
          class="flex w-full flex-row items-start justify-between gap-3 px-4 py-2 pr-6.75"
        >
          <div class="min-w-0 grow flex flex-col gap-0.5">
            <p class="font-normal text-base-content">{preference.name}</p>
            {#if preference.description}
              <p class="text-sm text-neutral-content">{preference.description}</p>
            {/if}
          </div>
          <Switch
            name={preference.code}
            class="mt-0.5 shrink-0"
            size="sm"
            color="primary"
            checked={getPreferenceState(preference.code)}
            onCheckedChange={(checked) =>
              adminCtx.setAdminPreference(preference.code, checked === true)}
          />
        </div>
      {/each}
    </div>
  </Section>
{/if}
