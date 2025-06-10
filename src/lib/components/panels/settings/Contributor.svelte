<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Trophy, CheckCircle } from '@steeze-ui/heroicons';
import Section from '$lib/components/panels/common/Section.svelte';

// CONTEXT
const appCtx = getAppCtx();

// STATE
let showSuccessIndicator = $state(false);
let successTimer: ReturnType<typeof setTimeout>;

// HANDLERS
const handleAttributionChange = (target: HTMLInputElement) => {
  const value = target.value;

  appCtx.setUserAttribution(
    value,
    // onSuccess
    () => {
      showSuccessIndicator = true;
      clearTimeout(successTimer);
      successTimer = setTimeout(() => {
        showSuccessIndicator = false;
      }, 2500);
    },
    // onError
    (error) => {
      console.error('Failed to save attribution:', error);
      showSuccessIndicator = false;
    }
  );
};

const handleKeydown = () => {
  // Immediately hide success indicator when user starts typing
  showSuccessIndicator = false;
  clearTimeout(successTimer);
};
</script>

<Section
  title={m.settings_contributor_title()}
  icon="/contributor.svg"
  position="right">
  <div
    class="my-2 ml-5 flex flex-row items-center gap-2 rounded-l-md rounded-r-none bg-base-200">
    <input
      name="attribution"
      type="text"
      class="input m-0 h-12 w-full rounded-l-md rounded-r-none border-0 bg-base-200 pl-[26px] pr-10 text-sm placeholder:text-base-content/40 focus:border-none focus:outline-none"
      placeholder={m.settings_contributor_placeholder()}
      value={appCtx.getUser()?.attribution}
      oninput={({ target }) => handleAttributionChange(target as HTMLInputElement)}
      onkeydown={handleKeydown} />
    <div class="relative mr-8">
      <!-- Success indicator -->
      <label
        class="swap swap-rotate absolute right-0 h-6 w-6 -translate-y-1/2 stroke-1 text-base-content/60 {showSuccessIndicator
          ? 'swap-active'
          : ''}">
        <div transition:fade={{ duration: 800 }} class="swap-off">
          <Icon src={Trophy} class="h-6 w-6" />
        </div>
        <div transition:fade={{ duration: 300 }} class="swap-on">
          <Icon src={CheckCircle} class="h-6 w-6" />
        </div>
      </label>
    </div>
  </div>
</Section>
