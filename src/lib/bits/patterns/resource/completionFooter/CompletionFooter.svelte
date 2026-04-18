<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// BITS
import * as CompletionFooterPrimitive from './components'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// SERVICES
import { calculateOverallStats } from '$lib/client/services/stats'
// ICONS
import BookOpenIcon from 'virtual:icons/lucide/book-open'
import ImageIcon from 'virtual:icons/lucide/image'
import LanguagesIcon from 'virtual:icons/lucide/languages'
import PenIcon from 'virtual:icons/lucide/pen'
import TagsIcon from 'virtual:icons/lucide/tags'
// TYPES
import type {
  CompletionFooterProps,
  CompletionFooterSection,
  CompletionFooterSectionKey,
} from './completionFooter.types'

const adminCtx = getAdminCtx()

let { entities }: CompletionFooterProps = $props()

const overallStats = $derived(
  calculateOverallStats(adminCtx.appCtx, entities, adminCtx),
)

const sectionMeta: Record<
  CompletionFooterSectionKey,
  Omit<CompletionFooterSection, 'percentage'>
> = {
  content: {
    icon: BookOpenIcon,
    title: m.filters__content(),
    tooltip: m.green_born_skate_jolt(),
  },
  translation: {
    icon: LanguagesIcon,
    title: m.filters__translation(),
    tooltip: m.nice_zippy_millipede_bend(),
  },
  image: {
    icon: ImageIcon,
    title: m.filters__image(),
    tooltip: m.fancy_mealy_flea_dream(),
  },
  category: {
    icon: TagsIcon,
    title: m.sunny_day_lemur_conquer_short(),
    tooltip: m.sunny_day_lemur_conquer(),
  },
  freeform: {
    icon: PenIcon,
    title: m.admin__forms_common_specifiers_short(),
    tooltip: m.alert_blue_raven_grasp(),
  },
}

const sections = $derived<CompletionFooterSection[]>([
  {
    ...sectionMeta.content,
    percentage: overallStats.content,
  },
  {
    ...sectionMeta.translation,
    percentage: overallStats.translation,
  },
  {
    ...sectionMeta.image,
    percentage: overallStats.image,
  },
  {
    ...sectionMeta.category,
    percentage: overallStats.category,
  },
  {
    ...sectionMeta.freeform,
    percentage: overallStats.freeform,
  },
])
</script>

<CompletionFooterPrimitive.Root>
  {#each sections as section (section.title)}
    <CompletionFooterPrimitive.Stat {...section} />
  {/each}
</CompletionFooterPrimitive.Root>
