<script lang="ts">
import { SvelteSet } from 'svelte/reactivity';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import Actions from '$lib/components/forms/actions/Gallery.svelte';
import Stats from '$lib/components/forms/stats/Gallery.svelte';
import Gallery from '$lib/components/images/gallery/Gallery.svelte';
// LIB
import { imageSets } from '$lib/images/index.svelte';
// TYPES
import type { SectionProps, EntityRouter, ResourceType } from '$lib/types';

// TYPES
type Props = SectionProps;

// STATE : PROPS
let { ...sectionProps }: Props = $props();
let inputElement = $state<HTMLInputElement>();

// CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;

// ACTIONS
let actionProps = $state({
  searchMode: false,
  removeMode: false
});

const actions = {
  add: () => {
    actionProps.removeMode = false;
    openFileDialog();
  },
  remove: (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    if (imageSets.images.length > 0) {
      actionProps.removeMode = !actionProps.removeMode;
      imageSets.imagesPendingConfirmation = new SvelteSet();
    }
  }
};

// Fn for opening the file dialog programmatically
const openFileDialog = () => {
  if (inputElement) {
    inputElement.value = '';
    inputElement.click();
  }
};
</script>

<div
  class="z-10 rounded-2xl bg-gradient-to-r from-rose-500/70 to-fuchsia-800/70 p-0 @container">
  <Header {...sectionProps} bind:actionProps {Actions} {actions} {Stats} />
  <main class="relative m-4 min-w-0 overflow-hidden">
    <Gallery
      editContext={{
        refType: routerState.resource as ResourceType,
        refId: routerState.entity
      }}
      {actionProps}
      bind:inputElement />
  </main>
</div>
