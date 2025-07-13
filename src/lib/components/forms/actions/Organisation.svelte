<script lang="ts">
// ICONS
import { UserGroup, Plus, XMark } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// I18N
import { m } from '$lib/i18n';

// PROPS
let {
  searchMode = $bindable(false),
  removeMode = $bindable(false)
}: {
  searchMode?: boolean;
  removeMode?: boolean;
} = $props();

// ACTIONS
const toggleSearchMode = () => {
  searchMode = !searchMode;
  if (searchMode) removeMode = false;
};

const toggleRemoveMode = () => {
  removeMode = !removeMode;
  if (removeMode) searchMode = false;
};
</script>

<div>
  {#if !searchMode}
    <button
      type="button"
      class="btn-rounded btn btn-ghost ml-auto"
      onclick={toggleRemoveMode}
      data-testid="removeOrganisationsButton">
      {#if !removeMode}
        <Icon src={XMark} class="mr-2 h-6 w-6 stroke-[2px]" />
        <span class="hidden md:block">{m.watery_trite_shrimp_clip()}</span>
      {:else}
        <Icon src={XMark} class="h-6 w-6 stroke-[2px]" />
        <span class="hidden md:block">{m.moving_each_orangutan_care()}</span>
      {/if}
    </button>
  {/if}
  {#if !removeMode}
    <button
      type="button"
      class="btn-rounded btn btn-ghost ml-auto"
      onclick={toggleSearchMode}
      data-testid="addOrganisationsButton">
      {#if !searchMode}
        <Icon src={Plus} class="mr-2 h-6 w-6 stroke-[2px]" />
        <span class="hidden md:block">{m.wacky_home_sawfish_accept()}</span>
      {:else}
        <Icon src={XMark} class="h-6 w-6 stroke-[2px]" />
        <span class="hidden md:block">{m.keen_antsy_bulldog_zoom()}</span>
      {/if}
    </button>
  {/if}
</div>
