<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { QueueList, XMark } from '@steeze-ui/heroicons';

type CustomActionsProps = {
  actions: Record<string, (...args: any[]) => void>;
  removeMode: boolean;
};

// STATE : PROPS
let { actions, removeMode = $bindable(false) }: CustomActionsProps = $props();

const toggleRemoveMode = (e: Event) => {
  e.preventDefault();
  removeMode = !removeMode;
};

// Add and remove event listener
$effect(() => {
  const handler = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && removeMode) {
      removeMode = false;
    }
  };

  window.addEventListener('keydown', handler);
  return () => {
    window.removeEventListener('keydown', handler);
  };
});
</script>

<div>
  <button
    class="btn-rounded btn btn-ghost ml-auto bg-base-100"
    onclick={toggleRemoveMode}>
    {#if removeMode}
      <Icon src={XMark} class="h-4 w-4" />
      <span class="hidden md:block"> {m.long_level_kestrel_pet()} </span>
    {:else}
      <Icon src={XMark} class="mr-1 h-4 w-4" />
      <span class="hidden md:block"> {m.watery_trite_shrimp_clip()} </span>
    {/if}
  </button>
  {#if !removeMode}
    <button class="btn-rounded btn btn-ghost ml-auto bg-base-100" onclick={actions.add}>
      <Icon src={QueueList} class="mr-1 h-4 w-4" />
      <span class="hidden md:block"> {m.wacky_home_sawfish_accept()} </span>
    </button>
  {/if}
</div>
