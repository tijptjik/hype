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
  description={m.settings_experimental_description()}
  icon="/experiment.svg"
  defaultOpen={false}>
  <div class="flex flex-col gap-2 bg-base-200">
    {#each experimentalFeatures as feature}
      <div class="flex min-h-11 flex-row items-center justify-between gap-4 px-4">
        <div class="flex flex-row items-center gap-4">
          <Icon src={Beaker} class="my-6 h-5 w-5" />
          <div class="flex flex-col">
            <p class="font-normal text-base-content">{feature.name}</p>
            {#if feature.description}
              <p class="text-sm text-neutral-content">{feature.description}</p>
            {/if}
          </div>
        </div>
        <input
          name={feature.code}
          type="checkbox"
          class="toggle"
          checked={activeFeatures[feature.code] || false}
          onchange={(e) =>
            handleFeatureToggle(feature.code, e.currentTarget.checked)} />
      </div>
    {/each}
  </div>
</Section>
