<script lang="ts">
// I18N
import { getLocale } from '$lib/i18n';
import { slide } from 'svelte/transition';
import { MagnifyingGlass, XMark, ChevronRight } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// SERVICES
import { getURLfromImage } from '$lib/client/services/image';

// TYPES
import type { Field, Project, Layer, Form, User, Organisation } from '$lib/types';

type ResultType = User | Project | Layer | Organisation;

type Props = {
  searchMode: boolean;
  apiPath: string;
  fieldRoot: Field;
  isExistingCheck?: (item: ResultType) => boolean;
  toItem?: (item: ResultType) => object;
  itemRef?: 'id' | 'code';
  form: Form;
};

// STATE : CONTEXT :: RESOURCE
const adminCtx = getAdminCtx();

// PROPS
let {
  searchMode = $bindable<boolean>(false),
  apiPath = 'users',
  fieldRoot: rootField = 'userRoles',
  isExistingCheck,
  toItem = (item: ResultType) => {
    const formId =
      adminCtx.activeResourceType === 'project' ? 'projectId' : 'organisationId';
    const disco =
      adminCtx.activeResourceType === 'project' ? 'project' : 'organisation';
    return {
      type: disco as 'project' | 'organisation',
      userId: item.id,
      role: 'member',
      user: item,
      [formId]: $formInstance.id
    };
  },
  itemRef = 'id',
  ...barProps
}: Props = $props();

// STATE : CONTEXT :: FORM
let formInstance: Form['form'] = $derived(barProps.form.form);

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
    // Focus the first search result
    const firstResult = document.querySelector('#search-results button');
    if (firstResult) {
      (firstResult as HTMLElement).focus();
    }
  }
};

const handleInputKeyup = (event: KeyboardEvent) => {
  if (searchQuery) {
    search();
  } else {
    resetResults();
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

  const response = await fetch(`/api/${apiPath}?q=${encodeURIComponent(searchQuery)}`);
  const allResults: ResultType[] = await response.json();

  searchResults = allResults.filter((item) => {
    const shouldInclude = isExistingCheck ? isExistingCheck(item) : true;

    return shouldInclude;
  });

  return searchResults;
}

const addItem = (e: Event, item: ResultType) => {
  e.preventDefault();
  e.stopPropagation();

  // Check if item already exists to prevent duplicates
  if (isExistingCheck && !isExistingCheck(item)) {
    resetInput(e);
    return;
  }

  formInstance.update(($form: any) => {
    const newItem = $state.snapshot(toItem(item));
    $form[rootField] = [...($form[rootField] || []), newItem];
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
          class="input m-0 h-12 w-full rounded-none bg-neutral px-6 pr-10 text-sm caret-white focus:border-none focus:outline-none"
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
      <div
        class="absolute z-50 w-full caret-transparent"
        transition:slide={{ duration: 200 }}>
        <ul
          id="search-results"
          class="max-h-64 w-full overflow-y-auto rounded-b-lg bg-base-100 shadow-lg"
          role="listbox">
          {#each searchResults as result, index ((result as any).id)}
            {@const item = result as any}
            {@const isUser = 'email' in item}
            {@const isOrganisation = 'code' in item && !('email' in item)}
            <li class="search-result-item">
              <button
                class="flex w-full items-center justify-between px-4 py-3 text-left first:rounded-t-lg last:rounded-b-lg hover:bg-base-200 focus:bg-base-200 focus:outline-none"
                data-testid={`searchResultItem_${index}`}
                data-item-id={(item as any).id}
                onclick={(e) => addItem(e, item)}
                role="option"
                tabindex="0"
                onkeydown={(e) => handleResultKeydown(e)}>
                <!-- Left: Avatar/Image and content -->
                <div class="flex min-w-0 flex-1 items-center gap-3">
                  <div class="flex-shrink-0">
                    {#if isUser}
                      <!-- User avatar -->
                      {#if item.image && typeof item.image === 'string'}
                        <div class="relative h-10 w-10">
                          <div
                            class="absolute inset-0 animate-pulse rounded-full bg-base-300">
                          </div>
                          <img
                            src={item.image}
                            class="relative h-10 w-10 rounded-full object-cover opacity-0 transition-opacity duration-200"
                            onload={(e) => {
                              (e.currentTarget as HTMLImageElement).style.opacity = '1';
                              e.currentTarget.previousElementSibling?.remove();
                            }}
                            onerror={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display =
                                'none';
                              e.currentTarget.previousElementSibling?.remove();
                            }} />
                        </div>
                      {:else}
                        <div
                          class="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-content">
                          {item.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                      {/if}
                    {:else if isOrganisation}
                      <!-- Organisation image -->
                      {#if item.image}
                        <div class="relative h-10 w-10">
                          <div
                            class="absolute inset-0 animate-pulse rounded bg-base-300">
                          </div>
                          <img
                            src={getURLfromImage({
                              image: item.image,
                              transformation: 'c_fill,w_100,h_100,q_auto'
                            })}
                            class="relative h-10 w-10 rounded object-cover opacity-0 transition-opacity duration-200"
                            onload={(e) => {
                              (e.currentTarget as HTMLImageElement).style.opacity = '1';
                              e.currentTarget.previousElementSibling?.remove();
                            }}
                            onerror={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display =
                                'none';
                              e.currentTarget.previousElementSibling?.remove();
                            }} />
                        </div>
                      {:else}
                        <div
                          class="flex h-10 w-10 items-center justify-center rounded bg-accent text-sm font-medium text-accent-content">
                          {item.i18n?.en?.name?.charAt(0)?.toUpperCase() ||
                            item.code?.charAt(0)?.toUpperCase() ||
                            '?'}
                        </div>
                      {/if}
                    {:else}
                      <!-- Fallback for other types -->
                      <div
                        class="flex h-10 w-10 items-center justify-center rounded bg-neutral text-sm font-medium text-neutral-content">
                        {item.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                    {/if}
                  </div>

                  <!-- Content -->
                  <div class="min-w-0 flex-1">
                    <div class="truncate font-medium text-base-content">
                      {#if isOrganisation}
                        {item.i18n?.[getLocale()]?.name || item.code || '-'}
                      {:else}
                        {item.i18n?.[getLocale()]?.name || item.name || '-'}
                      {/if}
                    </div>
                    {#if isUser && item.attribution}
                      <div class="truncate text-sm text-base-content/70">
                        {item.attribution}
                      </div>
                    {/if}
                  </div>
                </div>

                <!-- Right: Code/Email and chevron -->
                <div class="flex flex-shrink-0 items-center gap-2">
                  {#if isOrganisation && item.code}
                    <div class="font-mono text-sm text-base-content/60">
                      {item.code}
                    </div>
                  {:else if isUser && item.email}
                    <div class="text-sm text-base-content/60">
                      {item.email}
                    </div>
                  {/if}
                  <Icon src={ChevronRight} class="h-4 w-4 text-base-content/40" />
                </div>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}
