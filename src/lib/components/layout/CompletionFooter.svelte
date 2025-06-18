<script lang="ts">
import { getAdminCtx } from '$lib/context/admin.svelte';
// SERVICES
import { calculateOverallStats } from '$lib/client/services/stats';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import {
  Photo,
  Language,
  Tag,
  Pencil,
  XMark,
  BookOpen
} from '@steeze-ui/heroicons';
// TYPES
import type { Feature } from '$lib/types';

const adminCtx = getAdminCtx();

let { entities } = $props();

// FILTER SECTIONS CONFIG
const filterSections = {
  content: { icon: BookOpen, title: 'Content' },
  translation: { icon: Language, title: 'Translation' },
  image: { icon: Photo, title: 'Images' },
  category: { icon: Tag, title: 'Categories' },
  freeform: { icon: Pencil, title: 'Freeform' }
};

const overallStats = $derived(calculateOverallStats(adminCtx.appCtx, entities));
</script>

{#snippet statSection(key: string, percentage: number)}
  <div class="max-w-50 flex items-center gap-3">
    <Icon
      src={filterSections[key as keyof typeof filterSections].icon}
      class="h-4 w-4" />
    <span class="hidden text-xs font-medium w-512:block"
      >{filterSections[key as keyof typeof filterSections].title}</span>
    <progress class="progress progress-primary flex-1" value={percentage} max="100"
    ></progress>
    <span class="text-xs font-medium">{Math.round(percentage)}%</span>
  </div>
{/snippet}

{#if entities.length > 0}
  <footer
    class="flex h-[37px] items-center justify-around gap-6 border-t-1 border-base-100 bg-base-300 px-6 uppercase text-base-content shadow-[0_-5px_15px_rgba(0,0,0,0.1)]">
    {@render statSection('content', overallStats.content)}
    {@render statSection('translation', overallStats.translation)}
    {@render statSection('image', overallStats.image)}
    {@render statSection('category', overallStats.category)}
    {@render statSection('freeform', overallStats.freeform)}
  </footer>
{/if}
