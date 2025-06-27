<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition';
import { quadInOut } from 'svelte/easing';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// SERVICES
import { calculateOverallStats } from '$lib/client/services/stats';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Photo, Language, Tag, Pencil, BookOpen } from '@steeze-ui/heroicons';

// CONTEXT
const adminCtx = getAdminCtx();

let { entities } = $props();

// FILTER SECTIONS CONFIG
const filterSections = {
  content: { icon: BookOpen, title: m.filters__content() },
  translation: { icon: Language, title: m.filters__translation() },
  image: { icon: Photo, title: m.filters__image() },
  category: { icon: Tag, title: m.sunny_day_lemur_conquer_short() },
  freeform: { icon: Pencil, title: m.admin__forms_common_specifiers_short() }
};

const overallStats = $derived(
  calculateOverallStats(adminCtx.appCtx, entities, adminCtx)
);
</script>

{#snippet statSection(key: string, percentage: number, tooltip: string)}
  <div class="max-w-50 tooltip flex items-center gap-3" data-tip={tooltip}>
    <Icon
      src={filterSections[key as keyof typeof filterSections].icon}
      class="h-4 w-4" />
    <span class="hidden text-xs font-medium w-512:block"
      >{filterSections[key as keyof typeof filterSections].title}</span>
    <progress
      class="progress progress-primary min-w-32 flex-1"
      value={percentage}
      max="100"></progress>
    <span class="text-xs font-medium">{Math.round(percentage)}%</span>
  </div>
{/snippet}

<footer
  class="flex h-[37px] items-center justify-around gap-6 border-t-1 border-base-100 bg-base-400 px-6 uppercase text-base-content shadow-[0_-5px_15px_rgba(0,0,0,0.1)]"
  in:slide={{ duration: 300, axis: 'y', easing: quadInOut, delay: 100 }}>
  {@render statSection('content', overallStats.content, m.green_born_skate_jolt())}
  {@render statSection(
    'translation',
    overallStats.translation,
    m.nice_zippy_millipede_bend()
  )}
  {@render statSection('image', overallStats.image, m.fancy_mealy_flea_dream())}
  {@render statSection('category', overallStats.category, m.sunny_day_lemur_conquer())}
  {@render statSection('freeform', overallStats.freeform, m.alert_blue_raven_grasp())}
</footer>
