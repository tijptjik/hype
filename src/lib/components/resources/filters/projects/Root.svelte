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
// ICONS
import {
  CircleStack,
  Photo,
  Language,
  Funnel,
  XMark,
  BookOpen
} from '@steeze-ui/heroicons';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// TYPES
import type {
  ProjectViewFilters,
  ProjectTranslationFilterKey,
  ProjectStatusFilterKey,
  ProjectAuthorshipFilterKey,
  ProjectImageFilterKey
} from '$lib/types';

let { count } = $props();

const adminCtx = getAdminCtx();

// STATE
let activeSection: string | null = $state(null);
let showSectionMenu = $state(true);

// FILTER SECTIONS CONFIG
const filterSections = {
  status: { icon: CircleStack, title: m.filters__status() },
  authorship: { icon: BookOpen, title: m.filters__content() },
  translation: { icon: Language, title: m.filters__translation() },
  images: { icon: Photo, title: m.filters__image() }
};

const filterKeys: Record<string, (keyof ProjectViewFilters)[]> = {
  status: ['isPublished', 'isArchived'] as ProjectStatusFilterKey[],
  images: ['hasImage'] as ProjectImageFilterKey[],
  authorship: [
    'hasName',
    'hasContextualName',
    'hasDescription',
    'hasAttribution',
    'hasLicense'
  ] as ProjectAuthorshipFilterKey[],
  translation: [
    'isNameTranslated',
    'isContextualNameTranslated',
    'isDescriptionTranslated',
    'isAttributionTranslated',
    'isLicenseTranslated'
  ]
};

const getFilterCount = (section: string) => {
  const projectFilters = adminCtx.appCtx.state.viewFilters.project;
  let count = 0;

  if (section === 'status') {
    count = filterKeys[section].filter((filterKey) => {
      // isArchived is for SuperAdmin only so we ignore
      return (
        projectFilters[filterKey as ProjectStatusFilterKey] !== null &&
        filterKey !== 'isArchived'
      );
    }).length;
    return count;
  }

  if (section === 'translation') {
    filterKeys[section].forEach((projectKey) => {
      const filterValue = projectFilters[projectKey as ProjectTranslationFilterKey];
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
      if (projectFilters[key as keyof ProjectViewFilters] !== null) {
        count++;
      }
    });
  }
  return count;
};

const totalFilterCount = $derived(() => {
  let total = 0;
  for (const section of Object.keys(filterSections)) {
    total += getFilterCount(section);
  }
  return total;
});

// HANDLERS
function selectSection(sectionKey: string) {
  if (activeSection == sectionKey) {
    activeSection = null;
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
      class="group/anchor mr-4 flex items-center justify-center opacity-70 transition-opacity duration-300 hover:opacity-100"
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
      <div class="absolute z-30 flex h-16 items-center gap-2 bg-base-200">
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
                <div class="badge badge-secondary badge-xs absolute -right-1 -top-1">
                </div>
              {/if}
            </button>
          {/if}
        {/each}
      </div>
      <div
        class="absolute z-20 flex w-auto flex-row justify-center gap-2 transition-opacity duration-300 {showSectionMenu
          ? 'opacity-0'
          : 'opacity-100'}">
        <!-- Active Section Filters -->
        {#if activeSection === 'status'}
          <StatusSection />
        {:else if activeSection === 'images'}
          <ImageSection />
        {:else if activeSection === 'authorship'}
          <AuthorshipSection />
        {:else if activeSection === 'translation'}
          <TranslationSection />
        {/if}
      </div>
    </div>
  </div>
  <div class="flex items-center gap-4 pr-8 text-base-content/60">
    <div class="text-sm">
      <span>{count}</span>
      <span>{m.busy_flaky_mayfly_chop()}</span>
    </div>
    <button
      class="btn btn-circle btn-ghost btn-sm"
      onclick={resetFilters}
      disabled={totalFilterCount() === 0}>
      <Icon src={XMark} class="h-4 w-4" />
    </button>
  </div>
</div>
