<script lang="ts">
    import Icon from '$lib/components/common/Icon.svelte';
    import { Photo, XMark, Trash } from '@steeze-ui/heroicons';
    
    // TYPES
    import type { FieldProps, ModalProps } from '$lib/types';
    
    // STATE : PROPS
    let {
      searchMode = $bindable(false),
      removeMode = $bindable(false),
      actions
    }: FieldProps & ModalProps = $props();
    
    </script>
    
    <div>
      {#if !removeMode}
        <button 
          class="btn-rounded btn btn-ghost ml-auto bg-base-100" 
          onclick={(e) => actions?.add(e)} 
          data-testid="addImageButton"
        >
          <Icon src={Photo} class="mr-2 h-4 w-4" />
          <span class="hidden md:block">Add Image</span>
        </button>
      {/if}
      <button 
        class="btn-rounded btn btn-ghost ml-auto bg-base-100" 
        onclick={(e) => actions?.remove(e)}
      >
        {#if !removeMode}
          <Icon src={Trash} class="mr-2 h-4 w-4" />
          <span class="hidden md:block">Remove Images</span>
        {:else}
          <Icon src={XMark} class="h-4 w-4" />
          <span class="hidden md:block">Stop Removing</span>
        {/if}
      </button>
    </div>