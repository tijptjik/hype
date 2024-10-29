<script lang="ts">
import { QueueList, XMark } from '@steeze-ui/heroicons';
import { Icon } from '@steeze-ui/svelte-icon';
import { slide } from 'svelte/transition';
// TYPES
type Props = {
  searchMode: boolean;
  removeMode: boolean;
  actions: Record<string, () => void>;
};

// STATE : PROPS
let {
  searchMode = $bindable(false),
  removeMode = $bindable(false),
  actions
}: Props = $props();

let showWarning = $state(false);

const toggleRemoveMode = (e: Event) => {
  e.preventDefault();
  removeMode = !removeMode;
};
</script>

<div>
  <button class="btn-rounded btn btn-ghost ml-auto bg-base-100" onclick={toggleRemoveMode}>
    {#if removeMode}
      <Icon src={XMark} class="h-4 w-4" /> <span class="hidden md:block"> Stop Removing </span>
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