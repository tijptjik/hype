<script lang="ts">
// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { m } from '$lib/i18n'
// API
import { getUser, updateUserProfile } from '$lib/api/server/user.remote'
// SERVICES
import { refreshUserSession } from '$lib/client/services/user'
// BITS
import { Switch } from '$lib/bits'
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// TYPES
import type { PanelProps } from '$lib/types'
import type {
  ExperimentalFeatureConfig,
  UserExperimental,
} from '$lib/db/zod/schema/user.types'

// CONTEXT
const appCtx = getAppCtx()

// PROPS
let { ...panelProps }: PanelProps = $props()

// Get experimental features from appCtx
const experimentalFeatures = $derived.by(() => {
  const user = appCtx.getUser()
  return user && 'experimental' in user ? user.experimental : {}
})
let isSavingExperimental = $state(false)

// Helper function to safely get feature state
const getFeatureState = (code: keyof UserExperimental): boolean => {
  return (experimentalFeatures as UserExperimental)[code] || false
}

/**
 * Optimistically saves one experimental setting through a remote command.
 *
 * @param featureCode - Experimental setting to update.
 * @param checked - The requested enabled state.
 * @returns Nothing after the local state settles to the server result.
 */
const toggleExperimental = async (
  featureCode: keyof UserExperimental,
  checked: boolean,
): Promise<void> => {
  if (isSavingExperimental) return

  const user = appCtx.getUser()
  if (!user || !('experimental' in user)) return

  const previousExperimental: UserExperimental = {
    contributorMode: user.experimental?.contributorMode ?? false,
    noLabelsMode: user.experimental?.noLabelsMode ?? false,
  }
  const nextExperimental: UserExperimental = {
    ...previousExperimental,
    [featureCode]: checked,
  }

  isSavingExperimental = true
  appCtx.applyUserProfile({ experimental: nextExperimental })

  try {
    const response = await updateUserProfile({
      id: user.id,
      data: { experimental: JSON.stringify(nextExperimental) },
    }).updates(
      getUser({
        ref: user.id,
        refKey: 'id',
        meta: { profile: 'self' },
      }),
    )

    appCtx.applyUserProfile(response?.data ?? { experimental: nextExperimental })
    await refreshUserSession()
  } catch (error) {
    console.error('Error updating experimental setting:', error)
    appCtx.applyUserProfile({ experimental: previousExperimental as UserExperimental })
    toast.error('Failed to update experimental setting')
  } finally {
    isSavingExperimental = false
  }
}

// Experimental features configuration
const featuresConfig: ExperimentalFeatureConfig[] = [
  {
    name: m.settings_experimental_contributor_mode(),
    description: m.settings_experimental_contributor_description(),
    code: 'contributorMode',
  },
  {
    name: m.settings_experimental_no_labels_mode(),
    description: m.settings_experimental_no_labels_description(),
    code: 'noLabelsMode',
  },
]
</script>

<Section
  {...panelProps}
  title={m.settings_experimental_title()}
  iconGraphicClass="scale-125 origin-bottom-left -mr-1"
  icon="/experiment.svg"
  defaultOpen={false}
  iconVerticalPaddingClass="py-3 pr-5"
  position="right"
>
  <div class="flex min-h-0 w-full flex-col gap-2 overflow-y-auto pb-16 pl-4">
    {#each featuresConfig as feature}
      <div
        class="flex w-full flex-row items-start justify-between gap-3 px-4 py-2 pr-6.75"
      >
        <div class="min-w-0 grow flex flex-col gap-0.5">
          <p class="font-normal text-base-content">{feature.name}</p>
          {#if feature.description}
            <p class="text-sm text-neutral-content">{feature.description}</p>
          {/if}
        </div>
        <Switch
          name={feature.code}
          class="mt-0.5 shrink-0"
          size="sm"
          color="primary"
          checked={getFeatureState(feature.code)}
          disabled={isSavingExperimental}
          onCheckedChange={(checked) =>
            void toggleExperimental(feature.code, checked === true)}
        />
      </div>
    {/each}
  </div>
</Section>
