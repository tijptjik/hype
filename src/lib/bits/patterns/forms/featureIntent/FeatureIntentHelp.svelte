<script lang="ts">
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
        title: 'Object',
        body: 'An individual item, such as a sign or drinking fountain. It can be located at a larger place.',
      },
      {
        icon: StoreIcon,
        title: 'Place',
        body: 'A destination, such as a shop or community venue. The feature can represent that location itself.',
      },
      {
        icon: MapIcon,
        title: 'Area · Forthcoming',
        body: 'A wider space. This kind is not available yet.',
      },
      {
        icon: RouteIcon,
        title: 'Route · Forthcoming',
        body: 'A path to follow. This kind is not available yet.',
      },
    ],
    relation: [
      {
        icon: PinIcon,
        title: 'Located at',
        body: 'The feature is distinct from its host. Use this for an object, such as a sign located at a building.',
      },
      {
        icon: LinkIcon,
        title: 'Represents',
        body: 'The feature is the location itself. Use this for a place, such as a bookstore representing that establishment.',
      },
    ],
    start: [
      {
        icon: SearchIcon,
        title: 'Find a location',
        body: 'Start by searching existing places and addresses. Useful when the author knows the place or its address.',
      },
      {
        icon: PinIcon,
        title: 'Place on the map',
        body: 'Start with a precise pin and optionally link a location afterward. Useful for objects or places without an address.',
      },
    ],
    missing: [
      {
        icon: PlusIcon,
        title: 'Offer local creation',
        body: 'Ask the author whether to create a location when none is selected. Use this when missing places should be added.',
      },
      {
        icon: ArrowIcon,
        title: 'Continue silently',
        body: 'Proceed without the creation prompt. Use this when a map position is enough.',
      },
    ],
    naming: [
      {
        icon: TypeIcon,
        title: 'Start with a base name',
        body: 'Use the feature’s own base name or the linked location’s name. With no conditions, the title is just that base name.',
      },
      {
        icon: ListIcon,
        title: 'Apply rules in order',
        body: 'Each condition adds text before or after the base name. The preview combines all conditions in their configured order.',
      },
      {
        icon: ToggleIcon,
        title: 'True, false and unset',
        body: 'Choose separate text for each value. Unset means no answer was provided; it is different from false. Empty text adds nothing. Short-text conditions insert the property’s value in that language. Configure fallback text only when it has no value.',
      },
      {
        icon: LanguagesIcon,
        title: 'Localized titles',
        body: 'Configure text for each language. A feature-level title override takes precedence for that language.',
      },
    ],
    fields: [
      {
        icon: ToggleIcon,
        title: 'Boolean, toggle and short-text fields',
        body: 'Boolean fields use true, false or unset. Short-text fields insert their own value. Has no value supplies optional fallback text; blank text counts as no value.',
      },
      {
        icon: PlusIcon,
        title: 'Set up project fields',
        body:
          scopeType === 'hub'
            ? 'Conditional fields belong to projects. Define conditions on a project or layer using that project’s saved fields.'
            : 'Add and save a boolean, toggle or short-text field in the project’s Fields tab, then return here to add a condition.',
      },
      {
        icon: TypeIcon,
        title: 'Base name still available',
        body: 'You can choose the feature or linked location as the name source even when no conditional fields are available.',
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
