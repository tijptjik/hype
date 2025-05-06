<script lang="ts">
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Beaker } from '@steeze-ui/heroicons';
import Section from '$lib/components/panels/common/Section.svelte';
// STORES
import { page } from '$app/stores';

const { session } = $page.data;
const userId = $state(session?.user?.id);
let activeFeatures = $state(session?.user?.experimental || {});
let timer: number;

// Experimental features
const experimentalFeatures = [
  {
    name: m.settings_experimental_contributor_mode(),
    description: m.settings_experimental_contributor_description(),
    code: 'contributorMode'
  }
];

const handleFeatureToggle = (code: string, value: boolean) => {
  // Update local state
  activeFeatures = {
    ...activeFeatures,
    [code]: value
  };

  // Debounce the API call
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experimental: activeFeatures
        })
      });
      const updatedUser = await response.json();
      session.user.experimental = updatedUser.experimental;
    } catch (error) {
      console.error('Failed to update experimental features:', error);
    }
  }, 500);
};
</script>

<Section
  title={m.settings_experimental_title()}
  icon="/experiment.svg"
  defaultOpen={false}
  iconVerticalPaddingClass="py-3 pr-5"
  position="right">
  <div
    class="scrollbar-thin flex min-h-0 w-full flex-col gap-2 overflow-y-auto pb-16 pl-4">
    {#each experimentalFeatures as feature}
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
          checked={activeFeatures[feature.code] || false}
          onchange={(e) =>
            handleFeatureToggle(feature.code, e.currentTarget.checked)} />
      </div>
    {/each}
  </div>
</Section>
