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
    class="btn-rounded btn btn-ghost ml-auto focus:outline-none focus:ring-2 focus:ring-primary"
    onclick={toggleRemoveMode}>
    {#if removeMode}
      <Icon src={XMark} class="h-4 w-4" />
      <span class="hidden md:block">{m.moving_each_orangutan_care()} </span>
    {:else}
      <Icon src={XMark} class="mr-1 h-4 w-4" />
      <span class="hidden md:block">{m.upper_caring_falcon_boost()}</span>
    {/if}
  </button>
  {#if !removeMode}
    <button
      class="btn-rounded btn btn-ghost ml-auto focus:outline-none focus:ring-2 focus:ring-primary"
      onclick={actions.add}>
      <Icon src={QueueList} class="mr-1 h-4 w-4" />
      <span class="hidden md:block">{m.fun_away_bird_peek()} </span>
    </button>
  {/if}
</div>
