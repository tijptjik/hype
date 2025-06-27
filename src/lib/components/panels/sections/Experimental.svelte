<script lang="ts">
import { m } from '$lib/i18n';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type {
  ExperimentalFeatureConfig,
  UserExperimental,
  PanelProps
} from '$lib/types';

// CONTEXT
const appCtx = getAppCtx();

// PROPS
let { ...panelProps }: PanelProps = $props();

// Get experimental features from appCtx
const experimentalFeatures = $derived(appCtx.getUser()?.experimental || {});

// Helper function to safely get feature state
const getFeatureState = (code: keyof UserExperimental): boolean => {
  return (experimentalFeatures as UserExperimental)[code] || false;
};

// Experimental features configuration
const featuresConfig: ExperimentalFeatureConfig[] = [
  {
    name: m.settings_experimental_contributor_mode(),
    description: m.settings_experimental_contributor_description(),
    code: 'contributorMode'
  },
  {
    name: m.settings_experimental_no_labels_mode(),
    description: m.settings_experimental_no_labels_description(),
    code: 'noLabelsMode'
  }
];
</script>

<Section
  title={m.settings_experimental_title()}
  icon="/experiment.svg"
  defaultOpen={false}
  iconVerticalPaddingClass="py-3 pr-5"
  position="right">
  <div class="flex min-h-0 w-full flex-col gap-2 overflow-y-auto pb-16 pl-4">
    {#each featuresConfig as feature}
      <div
        class="min-h-18 flex w-full flex-row items-center justify-between gap-4 px-4 py-2 pr-[27px]">
        <div class="flex flex-col">
          <p class="font-normal text-base-content">
            {feature.name}
            {#if feature.description}
              <span class="pl-1.5 text-sm text-neutral-content"
                >{feature.description}</span>
            {/if}
          </p>
        </div>
        <input
          name={feature.code}
          type="checkbox"
          class="flex-grow-1 toggle toggle-primary toggle-sm flex-shrink-0"
          checked={getFeatureState(feature.code)}
          onchange={(e) =>
            appCtx.setExperimental(feature.code, e.currentTarget.checked)} />
      </div>
    {/each}
  </div>
</Section>
