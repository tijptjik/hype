<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// ICONS
import InfoIcon from 'virtual:icons/lucide/info'
import BoxIcon from 'virtual:icons/lucide/box'
import StoreIcon from 'virtual:icons/lucide/store'
import MapIcon from 'virtual:icons/lucide/map'
import RouteIcon from 'virtual:icons/lucide/route'
import PinIcon from 'virtual:icons/lucide/map-pin'
import LinkIcon from 'virtual:icons/lucide/link'
import SearchIcon from 'virtual:icons/lucide/search'
import PlusIcon from 'virtual:icons/lucide/plus'
import ArrowIcon from 'virtual:icons/lucide/arrow-right'
import TypeIcon from 'virtual:icons/lucide/type'
import LanguagesIcon from 'virtual:icons/lucide/languages'
import ToggleIcon from 'virtual:icons/lucide/toggle-left'
import ListIcon from 'virtual:icons/lucide/list-ordered'

let {
  topic,
  label,
  scopeType = 'project',
}: {
  topic: 'kind' | 'relation' | 'start' | 'missing' | 'naming' | 'fields'
  label: string
  scopeType?: 'hub' | 'organisation' | 'project' | 'layer'
} = $props()
const sections = $derived(
  {
    kind: [
      {
        icon: BoxIcon,
        title: m.feature_model_object(),
        body: m.feature_model_help_object(),
      },
      {
        icon: StoreIcon,
        title: m.feature_model_place(),
        body: m.feature_model_help_place(),
      },
      {
        icon: MapIcon,
        title: m.feature_model_area_soon(),
        body: 'A wider space. This kind is not available yet.',
      },
      {
        icon: RouteIcon,
        title: m.feature_model_route_soon(),
        body: 'A path to follow. This kind is not available yet.',
      },
    ],
    relation: [
      {
        icon: PinIcon,
        title: m.feature_model_located_at(),
        body: m.feature_model_help_located(),
      },
      {
        icon: LinkIcon,
        title: m.feature_model_represents(),
        body: m.feature_model_help_represents(),
      },
    ],
    start: [
      {
        icon: SearchIcon,
        title: m.feature_model_find_location(),
        body: m.feature_model_help_search(),
      },
      {
        icon: PinIcon,
        title: m.feature_model_place_on_map(),
        body: m.feature_model_help_pin(),
      },
    ],
    missing: [
      {
        icon: PlusIcon,
        title: m.feature_model_offer_creation(),
        body: m.feature_model_help_create(),
      },
      {
        icon: ArrowIcon,
        title: m.feature_model_continue_silently(),
        body: m.feature_model_help_silent(),
      },
    ],
    naming: [
      {
        icon: TypeIcon,
        title: m.feature_model_help_inputs_title(),
        body: m.feature_model_help_inputs(),
      },
      {
        icon: ListIcon,
        title: m.feature_model_help_templates_title(),
        body: m.feature_model_help_templates(),
      },
      {
        icon: ToggleIcon,
        title: m.feature_model_help_values_title(),
        body: m.feature_model_help_values(),
      },
      {
        icon: LanguagesIcon,
        title: m.feature_model_help_localized_title(),
        body: m.feature_model_help_localized(),
      },
    ],
    fields: [
      {
        icon: ToggleIcon,
        title: m.feature_model_help_fields_title(),
        body: m.feature_model_help_fields(),
      },
      {
        icon: PlusIcon,
        title: m.feature_model_help_project_fields_title(),
        body:
          scopeType === 'hub'
            ? m.feature_model_help_hub_fields()
            : m.feature_model_help_project_fields(),
      },
      {
        icon: TypeIcon,
        title: m.feature_model_help_scope_title(),
        body: m.feature_model_help_scope(),
      },
    ],
  }[topic],
)
</script>

<SimpleTooltip
  showArrow
  triggerClass="inline-flex"
  triggerProps={{ 'aria-label': label, role: 'button' }}
  contentClass="w-[24rem] max-w-[calc(100vw-2rem)] p-4 text-left"
>
  {#snippet trigger()}
    <span
      class="text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded"
    >
      <InfoIcon class="size-3.5" aria-hidden="true" />
    </span>
  {/snippet}
  <div
    class="max-h-[min(calc(100dvh-5rem),calc(var(--bits-popover-content-available-height,100dvh)-2.5rem))] overflow-y-auto"
    data-feature-intent-help={topic}
  >
    <div class="border-border/50 flex items-center gap-2.5 border-b pb-3">
      <InfoIcon class="text-primary size-5 shrink-0" aria-hidden="true" />
      <h3 class="text-[15px] leading-snug font-semibold">{label}</h3>
    </div>
    <ul class="mt-4 space-y-4">
      {#each sections as item}
        <li class="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2.5">
          <item.icon class="text-muted-foreground mt-0.5 size-5" aria-hidden="true" />
          <div class="space-y-1">
            <p class="text-sm leading-snug font-semibold">{item.title}</p>
            <p class="text-muted-foreground text-sm leading-relaxed">{item.body}</p>
          </div>
        </li>
      {/each}
    </ul>
  </div>
</SimpleTooltip>
