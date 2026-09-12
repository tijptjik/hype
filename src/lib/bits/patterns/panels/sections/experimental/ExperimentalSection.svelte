<script lang="ts">
// THIRD PARTY
// I18N
import { m } from '$lib/i18n'
// API
// SERVICES
// BITS
import { Switch } from '$lib/bits'
// COMPONENTS
import Section from '$lib/bits/patterns/panels/components/common/Section.svelte'
// CONTEXT
import type { useExperimentalSettingsModel } from '$lib/adapters/panels/useExperimentalSettingsModel.svelte'
// TYPES
import type { PanelProps } from '$lib/types'
import type {
  ExperimentalFeatureConfig,
  UserExperimental,
} from '$lib/db/zod/schema/user.types'

// CONTEXT

// PROPS
let {
  model,
  ...panelProps
}: PanelProps & { model: ReturnType<typeof useExperimentalSettingsModel> } = $props()

const featuresConfig = $derived(model.featuresConfig)
const isSavingExperimental = $derived(model.isSavingExperimental)
const getFeatureState = (...args: Parameters<typeof model.getFeatureState>) =>
  model.getFeatureState(...args)
const toggleExperimental = (...args: Parameters<typeof model.toggleExperimental>) =>
  model.toggleExperimental(...args)
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
