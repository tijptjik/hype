<script lang="ts">
import { m } from '$lib/i18n'
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
const experimentalFeatures = $derived(appCtx.getUser()?.experimental || {})

// Helper function to safely get feature state
const getFeatureState = (code: keyof UserExperimental): boolean => {
  return (experimentalFeatures as UserExperimental)[code] || false
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
          onCheckedChange={(checked) =>
            appCtx.setExperimental(feature.code, checked === true)}
        />
      </div>
    {/each}
  </div>
</Section>
