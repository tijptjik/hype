<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// ANIMATION
import { fly, slide, fade } from 'svelte/transition';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import StatusSection from './Status.svelte';
import ImageSection from './Images.svelte';
import AuthorshipSection from './Authorship.svelte';
import TranslationSection from './Translation.svelte';
import ClassifierSection from './Classifiers.svelte';
import SpecifierSection from './Specifiers.svelte';
// ICONS
import {
  CircleStack,
  Photo,
  PencilSquare,
  Language,
  Tag,
  Cog6Tooth,
  Funnel,
  XMark
} from '@steeze-ui/heroicons';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// TYPES
import type { FeatureViewFilters, Property, FeatureTranslationFilterKey } from '$lib/types';
import type { SvelteSet } from 'svelte/reactivity';

let { count } = $props();

const adminCtx = getAdminCtx();

// STATE
let activeSection: string | null = $state(null);
let showSectionMenu = $state(true);

// FILTER SECTIONS CONFIG
const filterSections = {
  translation: { icon: Language, title: 'Translation' },
  authorship: { icon: PencilSquare, title: 'Content' },
  image: { icon: Photo, title: 'Images' },
  status: { icon: CircleStack, title: 'Status' },
  classifier: { icon: Tag, title: 'Categories' },
  specifier: { icon: Cog6Tooth, title: 'Specifiers' }
};

const filterKeys: Record<string, (keyof FeatureViewFilters)[]> = {
  status: ['isPublished', 'isPendingReview', 'isArchived', 'isIntangible', 'isVisitable'],
  image: ['hasImage', 'isOneImagePublished', 'isAllImagePublished'],
  authorship: ['hasTitle', 'hasDescription'],
  translation: [
    'isTitleTranslated',
    'isDescriptionTranslated',
    'isAddressTranslated',
    'isSpecifierTranslated'
  ]
};

const getFilterCount = (section: string) => {
  const featureFilters = adminCtx.state.viewFilters.feature;
  let count = 0;

  if (section === 'translation') {
    filterKeys[section].forEach((featureKey) => {
      const filterValue = featureFilters[featureKey as FeatureTranslationFilterKey];
      if (filterValue && typeof filterValue === 'object') {
        Object.values(filterValue).forEach((v) => {
          if (v !== null) count++;
        });
      }
    });
  } else if (filterKeys[section]) {
    filterKeys[section].forEach((key) => {
      if (key === 'isArchived') {
        if (!adminCtx.appCtx.user?.superAdmin) return;
      }
      if (featureFilters[key as keyof FeatureViewFilters] !== null) {
        count++;
      }
    });
  }
  return count;
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

function resetFilters() {
  adminCtx.resetViewFilters();
}

</script>

<div
  class="relative flex h-16 w-full flex-row items-center justify-between gap-4 bg-base-200"
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
        class="absolute z-30 flex items-center gap-2 bg-base-200 h-16">
        <!-- All Section Options -->
        {#each Object.entries(filterSections) as [key, section], idx (key)}
          {#if showSectionMenu && activeSection !== key}
            <button
              class="btn btn-ghost btn-sm relative h-10 gap-2 hover:bg-transparent hover:text-white"
              in:fly={{ x: 20, duration: 300, delay: 50 * idx }}
              out:fade={{ duration: 300 }}
              onclick={() => selectSection(key)}>
              <Icon src={section.icon} class="h-4 w-4" />
              <span class="hidden lg:inline">{section.title}</span>
              {#if getFilterCount(key) > 0}
                <div class="badge badge-secondary badge-xs absolute -right-1 -top-1"></div>
              {/if}
            </button>
          {/if}
        {/each}
      </div>
      <div
        class="absolute z-20 w-auto flex flex-row gap-2 justify-center transition-opacity duration-300 {showSectionMenu ? 'opacity-0' : 'opacity-100'}">
        <!-- Active Section Filters -->
        {#if activeSection === 'status'}
          <StatusSection />
        {:else if activeSection === 'image'}
          <ImageSection />
        {:else if activeSection === 'authorship'}
          <AuthorshipSection />
        {:else if activeSection === 'translation'}
          <TranslationSection />
        {:else if activeSection === 'classifier'}
          <ClassifierSection />
        {:else if activeSection === 'specifier'}
          <SpecifierSection />
        {/if}
      </div>
    </div>
  </div>
  <div class="flex items-center pr-8 text-base-content/60 gap-4">
    <div class="text-sm">
      <span>{count}</span>
      <span>{m.busy_flaky_mayfly_chop()}</span>
    </div>
    <button class="btn btn-ghost btn-circle btn-sm" onclick={resetFilters}>
      <Icon src={XMark} class="h-4 w-4" />
    </button>
  </div>
</div>
