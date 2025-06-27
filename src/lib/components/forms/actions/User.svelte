<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// ICONS
import { UserPlus, XMark } from '@steeze-ui/heroicons';
// TYPES

// STATE : CONTEXT :: RESOURCE
const adminCtx = getAdminCtx();

// STATE : PROPS
let { searchMode = $bindable(false), removeMode = $bindable(false) } = $props();

const toggleSearch = (e: Event) => {
  e.preventDefault();
  searchMode = !searchMode;
};

const toggleRemoveMode = (e: Event) => {
  e.preventDefault();
  removeMode = !removeMode;
};

// Add and remove event listener
$effect(() => {
  const handler = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && removeMode) {
      removeMode = false;
    } else if (event.key === 'Escape' && searchMode) {
      searchMode = false;
    }
  };

  window.addEventListener('keydown', handler);
  return () => {
    window.removeEventListener('keydown', handler);
  };
});
</script>

<div class="flex w-full flex-row">
  {#if !searchMode && adminCtx.activeResourceType !== 'feature'}
    <button
      class="btn-rounded btn btn-ghost ml-auto focus:outline-none focus:ring-2 focus:ring-primary"
      onclick={toggleRemoveMode}>
      {#if !removeMode}
        <Icon src={UserPlus} class="mr-2 h-4 w-4" />
        <span class="hidden md:block"> {m.hour_polite_ocelot_kiss()} </span>
      {:else}
        <Icon src={XMark} class="h-4 w-4" />
        <span class="hidden md:block"> {m.moving_each_orangutan_care()} </span>
      {/if}
    </button>
  {/if}
  {#if !removeMode}
    <button
      class="btn-rounded btn btn-ghost ml-auto focus:outline-none focus:ring-2 focus:ring-primary"
      onclick={toggleSearch}
      data-testid="addUserButton">
      {#if !searchMode}
        <Icon src={UserPlus} class="mr-2 h-4 w-4" />
        <span class="hidden md:block"> {m.kind_active_haddock_ascend()} </span>
      {:else}
        <Icon src={XMark} class="h-4 w-4" /><span class="hidden md:block">
          {m.keen_antsy_bulldog_zoom()}
        </span>
      {/if}
    </button>
  {/if}
</div>
