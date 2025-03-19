<script lang="ts">
import { slide } from 'svelte/transition';
import { MagnifyingGlass, XMark, ChevronRight } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';

// TYPES
import type { User, Project, Layer, SuperFormResult, Resource } from '$lib/types';

type ResultType = User | Project | Layer;

type Props = {
  searchMode: boolean;
  apiPath: string;
  destination: string;
  toItem?: (item: ResultType) => object;
  itemRef?: 'id' | 'code';
  form: SuperFormResult<Resource>;
};

// STATE : CONTEXT :: RESOURCE
const resourceState = getHierarchicalResourceState();

// PROPS
let {
  searchMode = $bindable<boolean>(false),
  apiPath = 'users',
  destination = 'userRoles',
  toItem = (item: ResultType) => {
    let newItem = {
      userId: item.id,
      role: 'member',
      user: item
    };
    const formId =
      resourceState.activeResource === 'project' ? 'projectId' : 'organisationId';
    newItem = {
      ...newItem,
      [formId]: $form.id
    };
    return newItem;
  },
  itemRef = 'id',
  ...barProps
}: Props = $props();

// STATE : CONTEXT
let { form } = barProps.form;

// STATE
let searchQuery = $state('');
let searchResults = $state<ResultType[]>([]);

// EVENTS
const handleInputKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    if (searchQuery === '') {
      searchMode = !searchMode;
    }
    resetInput(event);
  } else if (
    (event.key === 'Tab' || event.key === 'ArrowDown') &&
    searchResults.length > 0
  ) {
    event.preventDefault();
    // TODO Understand why this doesn't work - input is not focusable
    document.getElementById('search-results')?.querySelector('button')?.focus();
  }
};

const handleInputKeyup = () => {
  if (searchQuery) {
    search();
  }
};

const handleResultKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    resetInput(event);
  } else if (event.key === 'Enter' || event.key === ' ') {
    (event.currentTarget as HTMLElement).click();
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    const nextItem = (event.currentTarget as HTMLElement)
      .closest('li')
      ?.nextElementSibling?.querySelector('button');
    nextItem?.focus();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    const prevItem = (event.currentTarget as HTMLElement)
      .closest('li')
      ?.previousElementSibling?.querySelector('button');
    prevItem?.focus();
  }
};

// UTILS

const focusOnMount = (node: HTMLElement) => {
  setTimeout(() => node.focus(), 0);
};

async function search(minChars = 2) {
  // Minimum 2 characters
  if (searchQuery.length < minChars) return;

  // TODO Add the projectId to the query when used for projects
  const response = await fetch(`/api/${apiPath}?q=${encodeURIComponent(searchQuery)}`);
  const allResults: ResultType[] = await response.json();

  searchResults = allResults.filter((item) => {
    return !$form[destination].some(
      (existingItem) => existingItem[itemRef] === item[itemRef]
    );
  });
}

const addItem = (e: Event, item: ResultType) => {
  e.preventDefault();
  form.update(($form) => {
    const newItem = toItem(item);
    $form[destination] = [...$form[destination], newItem];
    return $form;
  });

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

{#if searchMode}
  <div transition:slide={{ duration: 200 }} class="relative bg-base-200">
    <div class="form-control">
      <div class="input-group relative">
        <input
          id="search"
          data-testid="userSearchBar"
          type="text"
          placeholder={`Search ${apiPath}...`}
          class="input m-0 h-12 w-full rounded-none bg-neutral px-6 pr-10 text-sm focus:border-none focus:outline-none"
          bind:value={searchQuery}
          onkeydown={(e) => handleInputKeydown(e)}
          onkeyup={(e) => handleInputKeyup(e)}
          autocomplete="off"
          use:focusOnMount />
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
      <div class="absolute z-10 w-full" transition:slide={{ duration: 200 }}>
        <ul
          id="search-results"
          class="menu max-h-64 w-full overflow-y-auto rounded-b-lg bg-base-100 shadow-lg"
          role="listbox">
          {#each searchResults as item, index}
            <li>
              <button
                class="search-result-item"
                data-testid={`searchResultItem_${index}`}
                onclick={(e) => addItem(e, item)}
                role="option"
                tabindex="0"
                onkeydown={(e) => handleResultKeydown(e)}>
                <Icon src={ChevronRight} class="h-4 w-4" />
                {item.name}
                {#if item.attribution}
                  <span class="text-xs text-gray-500">{item.attribution}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}
