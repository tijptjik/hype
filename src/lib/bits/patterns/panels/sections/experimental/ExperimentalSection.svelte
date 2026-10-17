<script lang="ts">
// THIRD PARTY
// I18N
import { m } from '#lib/i18n.js'
// API
// SERVICES
// BITS
import { Switch } from '#lib/bits/index.js'
// ICONS
import Flask from 'virtual:icons/tabler/flask'
// COMPONENTS
import Section from '#lib/bits/patterns/panels/components/common/Section.svelte'
// CONTEXT
import type { useExperimentalSettingsModel } from '#lib/adapters/panels/useExperimentalSettingsModel.svelte.js'
// TYPES
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'
import type {
  ExperimentalFeatureConfig,
  UserExperimental,
} from '#lib/db/zod/schema/user.types.js'

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
  icon={Flask}
  defaultOpen={false}
  iconVerticalPaddingClass="py-3 pr-5"
  position="right"
>
  <div class="flex min-w-0 flex-col gap-4 px-6 pt-2 pb-6">
    {#each featuresConfig as feature}
      <div class="flex w-full flex-row items-start justify-between gap-3 py-2">
        <div class="min-w-0 grow flex flex-col gap-0.5">
          <p class="font-normal text-base-content">{feature.name}</p>
          {#if feature.description}
            <p class="text-sm text-muted-foreground">{feature.description}</p>
          {/if}
        </div>
        <Switch
          name={feature.code}
          class="mt-0.5 shrink-0"
          size="sm"
          color="primary"
          checked={getFeatureState(feature.code)}
          disabled={isSavingExperimental}
          onCheckedChange={checked =>
            void toggleExperimental(feature.code, checked === true)}
        />
      </div>
    {/each}
  </div>
</Section>
