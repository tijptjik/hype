<script lang="ts">
import { slide } from 'svelte/transition';
import { MagnifyingGlass, XMark, ChevronRight } from '@steeze-ui/heroicons';
import { Icon } from '@steeze-ui/svelte-icon';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';

// TYPES
import type { User, Project, Layer, ResourceType, FalsableRef } from '$lib/types';

type ResultType = User | Project | Layer;

type Props = {
  searchMode: boolean;
  apiPath: string;
  destination: string;
  toItem: (item: ResultType) => object;
  itemRef: 'id' | 'code';
  entity: FalsableRef;
  resourceType: ResourceType;
};

// PROPS
let {
  searchMode = $bindable<boolean>(false),
  apiPath = 'users',
  destination = 'userRoles',
  toItem = (item: ResultType) => ({
    organisationId: $form.id,
    role: 'member',
    user: item
  }),
  itemRef = 'id',
  entity,
  resourceType
}: Props = $props();

// STATE : CONTEXT
const { form } = getForm(resourceType, entity);

// STATE
let searchQuery = $state('');
let searchResults = $state<ResultType[]>([]);

// EVENTS

const handleInputKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    if (searchQuery === "") {
      searchMode = !searchMode;
    } 
    resetInput(event);
  } else if ((event.key === 'Tab' || event.key === 'ArrowDown') && searchResults.length > 0) {
    event.preventDefault();
    // TODO Understand why this doesn't work - input is not focusable
    document.getElementById('search-results')?.querySelector('button')?.focus();
  } 
}

const handleInputKeyup = () => {
  if (searchQuery) {
    search()
  }
}

const handleResultKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    resetInput(event);
  } else if (event.key === 'Enter' || event.key === ' ') {
    (event.currentTarget as HTMLElement).click();
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    const nextItem = (event.currentTarget as HTMLElement).closest('li')?.nextElementSibling?.querySelector('button');
    nextItem?.focus();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    const prevItem = (event.currentTarget as HTMLElement).closest('li')?.previousElementSibling?.querySelector('button');
    prevItem?.focus();
  }
}

// UTILS

const focusOnMount = (node: HTMLElement) => {
  setTimeout(() => node.focus(), 0);
};

async function search(minChars = 2) {
  // Minimum 2 characters
  if (searchQuery.length < minChars) return;

  const response = await fetch(`/api/${apiPath}?q=${encodeURIComponent(searchQuery)}`);
  const allResults: ResultType[] = await response.json();
  searchResults = allResults.filter((item) => !$form[destination][item[itemRef]]);
}

const addItem = (e: Event, item: ResultType) => {
  e.preventDefault();
  $form[destination] = {
    ...$form[destination],
    [item[itemRef]]: toItem(item)
  };
  // searchMode = false;
  resetInput(e);
  document.getElementById('search')?.focus();
};

const resetInput = (e: Event) => {
  e.preventDefault();
  searchQuery = '';
  resetResults();
  document.getElementById('search')?.focus();
};

const resetResults = () => (searchResults = []);


</script>

<div transition:slide={{ duration: 2000 }} class="bg-base-200 relative" class:hidden={!searchMode}>
  <div class="form-control">
    <div class="input-group relative">
      <input
        id="search"
        type="text"
        placeholder={`Search ${apiPath}...`}
        class="input m-0 w-full h-12 rounded-none bg-neutral px-6 pr-10 text-sm focus:border-none focus:outline-none"
        bind:value={searchQuery}
        onkeydown={(e) => handleInputKeydown(e)}
        onkeyup={(e) => handleInputKeyup(e)}
        autocomplete="off"
        use:focusOnMount
      />
      <div class="absolute inset-y-0 right-2 flex items-center pr-3">
        {#if !searchQuery}
          <Icon src={MagnifyingGlass} class="h-6 w-6" />
        {:else}
          <button onclick={(e) => resetInput(e)} class="focus:outline-none">
            <Icon src={XMark} class="h-6 w-6" />
          </button>
        {/if}
      </div>
    </div>
  </div>
  {#if searchResults.length > 0}
    <div 
      class="absolute w-full z-10"
      transition:slide={{ duration: 200 }}
    >
      <ul id="search-results" class="menu w-full bg-base-100 shadow-lg overflow-y-auto max-h-64 rounded-b-lg" role="listbox">
        {#each searchResults as item, index}
          <li>
            <button
              class="search-result-item"
              onclick={(e) => addItem(e, item)}
              role="option"
              tabindex="0"
              onkeydown={(e) => handleResultKeydown(e)}
            >
              <Icon src={ChevronRight} class="h-4 w-4" />
              {item.name}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
