<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { QueueList, XMark } from '@steeze-ui/heroicons';
// TYPES
import type { FieldProps, ModalProps } from '$lib/types';

// STATE : PROPS
let {
  actions,
  removeMode = $bindable(false)
}: { actions: Record<string, (...args: any[]) => void> } & ModalProps = $props();

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
      <span class="hidden md:block"> Stop Removing </span>
    {:else}
      <Icon src={XMark} class="mr-1 h-4 w-4" />
      <span class="hidden md:block"> Remove </span>
    {/if}
  </button>
  {#if !removeMode}
    <button class="btn-rounded btn btn-ghost ml-auto bg-base-100" onclick={actions.add}>
      <Icon src={QueueList} class="mr-1 h-4 w-4" />
      <span class="hidden md:block"> Add </span>
    </button>
  {/if}
</div>
