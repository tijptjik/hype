<script lang="ts">
import { UserPlus, XMark } from '@steeze-ui/heroicons';
import { Icon } from '@steeze-ui/svelte-icon';

// STATE : PROPS
let {
  searchMode = $bindable(false),
  removeMode = $bindable(false)
} = $props();

const toggleSearch = (e: Event) => {
  e.preventDefault();
  searchMode = !searchMode;
};

const toggleRemoveMode = (e: Event) => {
  e.preventDefault();
  removeMode = !removeMode;
};
</script>

<div>
  {#if !searchMode}
    <button class="btn-rounded btn btn-ghost ml-auto bg-base-100" onclick={toggleRemoveMode}>
      {#if !removeMode}
        <Icon src={UserPlus} class="mr-2 h-4 w-4" />
        Remove User
      {:else}
        <Icon src={XMark} class="h-4 w-4" />
        Stop Removing
      {/if}
    </button>
  {/if}
  {#if !removeMode}
    <button class="btn-rounded btn btn-ghost ml-auto bg-base-100" onclick={toggleSearch}>
      {#if !searchMode}
        <Icon src={UserPlus} class="mr-2 h-4 w-4" />
        Add User
      {:else}
        <Icon src={XMark} class="h-4 w-4" />
        Stop Adding
      {/if}
    </button>
  {/if}
</div>
