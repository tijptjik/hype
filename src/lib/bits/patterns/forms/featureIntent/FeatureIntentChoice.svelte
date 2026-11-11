<script lang="ts">
// I18N
import * as m from '#lib/paraglide/messages.js'
// SVELTE
import { untrack } from 'svelte'
// I18N
import { getLocaleKey } from '#lib/i18n.js'
import { featureTypeLabel } from '#lib/features/intents.js'
// ICONS
import ObjectIcon from 'virtual:icons/lucide/box'
import PlaceIcon from 'virtual:icons/lucide/map-pin-house'
import AreaIcon from 'virtual:icons/lucide/scan'
import RouteIcon from 'virtual:icons/lucide/route'
// COMPONENTS
import IntentChoiceCard from './IntentChoiceCard.svelte'
// API
import { getFeatureIntentOptions } from '#lib/api/featureIntents.remote.js'
// BITS COMPONENTS
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
// TYPES
import type { FeatureType } from '#lib/features/intents.js'
let {
  layerId,
  value,
  onChange,
  requireSelection = false,
  options,
}: {
  layerId: string
  /** Options resolved by setup before mounting a stage that needs user input. */
  options?: FeatureType[]
  requireSelection?: boolean
  value?: string | null
  onChange: (type: FeatureType | null) => void
} = $props()
const illustrations = $derived({
  object: {
    icon: ObjectIcon,
    description: 'An individual item, such as a sign, sculpture or drinking fountain.',
  },
  place: {
    icon: PlaceIcon,
    description: m.setup_place_example(),
  },
  area: {
    icon: AreaIcon,
    description: m.setup_area_example(),
  },
  route: {
    icon: RouteIcon,
    description: m.setup_route_example(),
  },
})
let types = $state<FeatureType[] | null>(null)
let failed = $state(false)
let retry = $state(0)
$effect(() => {
  if (options !== undefined) {
    types = options
    failed = false
    return
  }
  const id = layerId
  retry
  const previous = untrack(() => value)
  let cancelled = false
  types = null
  failed = false
  untrack(() => onChange(null))
  getFeatureIntentOptions({ layerId: id })
    .then(result => {
      if (cancelled) return
      types = result
      if (result.length === 1) onChange(result[0])
      else if (!requireSelection) {
        const retained = result.find(type => type.id === previous)
        if (retained) onChange(retained)
      }
    })
    .catch(() => {
      if (!cancelled) failed = true
    })
  return () => {
    cancelled = true
  }
})
</script>
<section class="mb-8 grid min-w-0 gap-3 rounded-lg border p-5">
  <h3 class="font-semibold">{m.setup_type_question()}</h3>
  {#if failed}
    <p role="alert">{m.setup_types_failed()}</p>
    <button
      type="button"
      class="justify-self-start rounded border px-3 py-2"
      onclick={() => (retry += 1)}
    >
      {m.setup_retry()}
    </button>
  {:else if types === null}
    <ContentSkeleton label="Loading feature types…">
      <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        {#each Object.entries(illustrations) as [kind, illustration]}
          <IntentChoiceCard
            label={kind}
            description={illustration.description}
            selected={false}
            onclick={() => {}}
          >
            {#snippet icon()}
              <illustration.icon class="size-7" />
            {/snippet}
          </IntentChoiceCard>
        {/each}
      </div>
    </ContentSkeleton>
  {:else if types.length === 0}
    <p role="alert">
      This layer has no available feature types. Update its feature type settings before
      adding a feature.
    </p>
  {:else}
    <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
      {#each types as type (type.id)}
        {@const illustration = illustrations[type.kind ?? 'object']}
        {@const Icon = illustration.icon}
        <IntentChoiceCard
          label={featureTypeLabel(type, getLocaleKey())}
          description={illustration.description}
          selected={value === type.id}
          onclick={() => onChange(type)}
        >
          {#snippet icon()}
            <Icon class="size-7" />
          {/snippet}
        </IntentChoiceCard>
      {/each}
    </div>
  {/if}
  {#if value && types?.some(type => type.id === value)}
    <p class="text-muted-foreground text-sm">
      {types.find(type => type.id === value)?.start === 'pin'
        ? m.setup_pin_help()
        : m.setup_find_help()}
    </p>
  {/if}
</section>
