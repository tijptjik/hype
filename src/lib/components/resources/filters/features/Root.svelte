<script lang="ts">
// ANIMATION
import { fly, slide } from 'svelte/transition';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import FeatureFilterBarStatusSection from './Status.svelte';
import FeatureFilterBarImageSection from './Images.svelte';
import FeatureFilterBarAuthorshipSection from './Authorship.svelte';
import FeatureFilterBarTranslationSection from './Translation.svelte';
import FeatureFilterBarCategoricalSection from './Classifiers.svelte';
import FeatureFilterBarSpecifierSection from './Specifiers.svelte';
// ICONS
import {
  CircleStack,
  Photo,
  PencilSquare,
  Language,
  Tag,
  Cog6Tooth,
  Funnel
} from '@steeze-ui/heroicons';

// STATE
let activeSection: string | null = $state(null);
let showSectionMenu = $state(true);

// FILTER SECTIONS CONFIG
const filterSections = {
  translation: { icon: Language, title: 'Translation' },
  authorship: { icon: PencilSquare, title: 'Content' },
  image: { icon: Photo, title: 'Images' },
  status: { icon: CircleStack, title: 'Status' },
  categorical: { icon: Tag, title: 'Categories' },
  specifier: { icon: Cog6Tooth, title: 'Specifiers' }
};

// HANDLERS
function selectSection(sectionKey: string) {
  if (activeSection == sectionKey) {
    activeSection == null;
  }
  activeSection = sectionKey;
  showSectionMenu = false;
}

function toggleSectionMenu() {
  showSectionMenu = !showSectionMenu;
}
</script>

<div
  class="items-centerw-full relative flex h-16 flex-row gap-4 bg-base-200"
  transition:slide>
  <div class="group/sections bg-200 mx-4 flex h-16 items-center gap-4 bg-base-200">
    <!-- Anchor -->
    <div
      class="group/anchor flex items-center justify-center opacity-70 transition-opacity duration-300 hover:opacity-100 mr-4"
      onmouseenter={toggleSectionMenu}>
      <button
        class="btn btn-ghost btn-sm h-10 group-hover/anchor:bg-transparent group-hover/anchor:text-white">
        <Icon
          src={activeSection
            ? filterSections[activeSection as keyof typeof filterSections].icon
            : Funnel}
          class="h-6 w-6" />
        <span class="hidden sm:inline"
          >{activeSection
            ? filterSections[activeSection as keyof typeof filterSections].title
            : 'Filter By'}</span>
      </button>
    </div>
    <div class="relative flex flex-row items-center">
      <!-- SECTION SELECTION MODE: Show all sections horizontally -->
      <div
        class="absolute z-30 flex items-center gap-2 bg-base-200 h-16"
        transition:fly={{ x: -20, duration: 300 }}>
        <!-- All Section Options -->
        {#each Object.entries(filterSections) as [key, section], idx (key)}
          {#if showSectionMenu && activeSection !== key}
            <button
              class="btn btn-ghost btn-sm h-10 gap-2 hover:bg-transparent hover:text-white"
              in:fly={{ x: 20, duration: 300, delay: 50 * idx }}
              out:fly={{ x: -20, duration: 300, delay: 50 * idx }}
              onclick={() => selectSection(key)}>
              <Icon src={section.icon} class="h-4 w-4" />
              <span class="hidden lg:inline">{section.title}</span>
            </button>
          {/if}
        {/each}
      </div>
      <div
        class="absolute z-20 w-auto flex flex-row gap-2 justify-center transition-opacity duration-300 {showSectionMenu ? 'opacity-0' : 'opacity-100'}">
        <!-- Active Section Filters -->
        {#if activeSection === 'status'}
          <FeatureFilterBarStatusSection />
        {:else if activeSection === 'image'}
          <FeatureFilterBarImageSection />
        {:else if activeSection === 'authorship'}
          <FeatureFilterBarAuthorshipSection />
        {:else if activeSection === 'translation'}
          <FeatureFilterBarTranslationSection />
        {:else if activeSection === 'categorical'}
          <FeatureFilterBarCategoricalSection />
        {:else if activeSection === 'specifier'}
          <FeatureFilterBarSpecifierSection />
        {/if}
      </div>
    </div>
  </div>
</div>
