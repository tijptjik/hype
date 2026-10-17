<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS
import * as CompletionFooterPrimitive from './components'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// SERVICES
import { calculateOverallStats } from '#lib/client/services/stats.js'
// ICONS
import BookOpenIcon from 'virtual:icons/proicons/book-open'
import ImageIcon from 'virtual:icons/proicons/photo'
import LanguagesIcon from 'virtual:icons/tabler/language'
import PenIcon from 'virtual:icons/proicons/pencil'
import TagsIcon from 'virtual:icons/proicons/tag-multiple'
// TYPES
import type {
  CompletionFooterProps,
  CompletionFooterSection,
  CompletionFooterSectionKey,
} from './completionFooter.types'

const adminCtx = getAdminCtx()

let { entities }: CompletionFooterProps = $props()

const overallStats = $derived(calculateOverallStats(adminCtx.view, entities, adminCtx))

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
