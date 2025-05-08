<script lang="ts">
// SERVICES
import { getImageContext } from '$lib/context/images.svelte';
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import Actions from '$lib/components/forms/actions/Gallery.svelte';
import Stats from '$lib/components/forms/stats/Gallery.svelte';
import Gallery from '$lib/components/images/gallery/Gallery.svelte';
// TYPES
import type { SectionProps } from '$lib/types';

// TYPES
type Props = SectionProps;

// SERVICES
const imageCtx = getImageContext();

// STATE : PROPS
let { ...sectionProps }: Props = $props();
let inputElement = $state<HTMLInputElement>();

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
    if (imageCtx.getImages().length > 0) {
      actionProps.removeMode = !actionProps.removeMode;
      imageCtx.resetPendingConfirmation();
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
    <Gallery {actionProps} bind:inputElement />
  </main>
</div>
