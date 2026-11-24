<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
// I18N
import * as m from '#lib/paraglide/messages.js'
// COMPONENTS
import FeatureIntentChoice from '../featureIntent/FeatureIntentChoice.svelte'
import TargetContextChoice from '../featureIntent/TargetContextChoice.svelte'
// ICONS
import LayerIcon from 'virtual:icons/lucide/layers'
import ProjectIcon from 'virtual:icons/lucide/layout-grid'
import OrganisationIcon from 'virtual:icons/lucide/users'
import CheckIcon from 'virtual:icons/lucide/check'
import ArrowRightIcon from 'virtual:icons/lucide/arrow-right'
// API
import { getFeatureIntentOptions } from '#lib/api/featureIntents.remote.js'
// SERVICES
import { getURLfromImage } from '#lib/client/services/image.js'
// DOMAIN
import { featureCreationSourceLayerId } from '../formFeatureParentSection/formFeatureParentSection.controller'
import { TARGET_CONTEXTS } from '#lib/features/locationPolicy.js'
import { targetContextChoices } from '../featureIntent/targetContextChoices'
import { setupResourceLabel, setupResourceMatches } from './featureSetup.types'
import { featureTypeLabel } from '#lib/features/intents.js'
import { getProjectDisplayName } from '#lib/projectNames.js'
import { getLocaleKey } from '#lib/i18n.js'
import { targetContextLabel } from '#lib/features/locationPolicy.i18n.js'
// TYPES
import type { FeatureSetupResults, FeatureSetupScope } from './featureSetup.types'
import type { ParentSectionLayerItem } from '../formParentSection/formParentSection.types'
import type { FeatureType } from '#lib/features/intents.js'
import type { TargetContext } from '#lib/features/locationPolicy.js'

let {
  step = $bindable(0),
  layer,
  sourceLayerId,
  initialScope = {},
  initialLayerId,
  type,
  context,
  contexts,
  load,
  onLayer,
  onType,
  onContext,
  onSearch,
  onHeightChange,
  visible = true,
}: {
  step?: number
  visible?: boolean
  layer: ParentSectionLayerItem | null
  sourceLayerId?: string
  initialScope?: FeatureSetupScope
  initialLayerId?: string
  type: FeatureType | null
  context: TargetContext | null
  contexts: readonly TargetContext[]
  load: (query: string, scope: FeatureSetupScope) => Promise<FeatureSetupResults>
  onLayer: (layer: ParentSectionLayerItem) => void
  onType: (type: FeatureType | null) => void
  onContext: (context: TargetContext) => void
  onHeightChange?: (height: number) => void
  onSearch: () => void
} = $props()
let measuredHeight = $state(0)
$effect(() => {
  onHeightChange?.(step >= 3 ? measuredHeight : 0)
})
let confirmedLayerId = $state<string | null>(
  untrack(() => layer?.id ?? initialLayerId ?? null),
)
let initialLayerApplied = $state(false)
let confirmedTypeId = $state<string | null>(untrack(() => type?.id ?? null))
let resolvedTypes = $state<FeatureType[] | undefined>(undefined)
let pendingLayer = $state<ParentSectionLayerItem | null>(null)
let failedLayer = $state<ParentSectionLayerItem | null>(null)
let selectionVersion = 0
let automaticLayerAttempted = false
let failedImages = $state<string[]>([])
onDestroy(() => {
  selectionVersion++
})
let confirmedContext = $state<TargetContext | null>(untrack(() => context ?? null))
const layerAnswered = $derived(Boolean(layer && layer.id === confirmedLayerId))
const typeAnswered = $derived(
  Boolean(layerAnswered && type && type.id === confirmedTypeId),
)
const contextAnswered = $derived(
  typeAnswered && context !== null && context === confirmedContext,
)
const contextOptions = $derived(targetContextChoices(contexts))
let query = $state('')
let scope = $state<FeatureSetupScope>(untrack(() => ({ ...initialScope })))
let catalogue = $state<FeatureSetupResults>({
  organisations: [],
  projects: [],
  layers: [],
})
const searchSubtitle = $derived.by((): string => {
  if (scope.projectId) {
    const project = catalogue.projects.find(item => item.id === scope.projectId)
    const name = project?.i18n?.en?.name
    return name ? m.setup_search_named_project({ name }) : m.setup_search_project()
  }
  if (scope.organisationId) {
    const organisation = catalogue.organisations.find(
      item => item.id === scope.organisationId,
    )
    const name = organisation?.i18n?.en?.name
    return name ? m.setup_search_named_org({ name }) : m.setup_search_org()
  }
  return m.setup_search_all()
})
const recent = $derived(catalogue.layers)
// Search the complete authorized catalogue without discarding or re-fetching results.
const results = $derived({
  organisations: catalogue.organisations,
  projects: catalogue.projects.filter(
    item =>
      (!scope.organisationId || item.organisationId === scope.organisationId) &&
      (!scope.projectId || item.id === scope.projectId),
  ),
  layers: catalogue.layers.filter(
    item =>
      (!scope.organisationId || item.organisationId === scope.organisationId) &&
      (!scope.projectId || item.projectId === scope.projectId) &&
      (!query.trim() ||
        setupResourceMatches(item, query) ||
        catalogue.projects.some(
          parent => parent.id === item.projectId && setupResourceMatches(parent, query),
        ) ||
        catalogue.organisations.some(
          parent =>
            parent.id === item.organisationId && setupResourceMatches(parent, query),
        )),
  ),
})
let loading = $state(false)
let failed = $state(false)
let retry = $state(0)
const labels = $derived([
  layerAnswered && layer ? setupResourceLabel(layer) : m.setup_map_question(),
  typeAnswered && type
    ? featureTypeLabel(type, getLocaleKey())
    : m.setup_type_question(),
  contextAnswered && context
    ? targetContextLabel(context)
    : m.setup_location_question(),
  m.setup_find_location(),
])
$effect(() => {
  retry
  let cancelled = false
  loading = true
  failed = false
  untrack(() => load('', {}))
    .then(value => {
      if (!cancelled) catalogue = value
    })
    .catch(() => {
      if (!cancelled) failed = true
    })
    .finally(() => {
      if (!cancelled) loading = false
    })
  return () => {
    cancelled = true
  }
})
// Resolve linked and sole destinations without mounting their determined stages.
$effect(() => {
  if (step !== 0 || loading || failed || pendingLayer || automaticLayerAttempted) return
  const initialLayer = initialLayerId
    ? catalogue.layers.find(item => item.id === initialLayerId)
    : catalogue.layers.length === 1
      ? catalogue.layers[0]
      : null
  if (initialLayer && !initialLayerApplied) {
    automaticLayerAttempted = true
    initialLayerApplied = true
    untrack(() => {
      void selectLayer(initialLayer)
    })
  }
})
/** Resolve a layer's organization image using the shared image pipeline.
 * @param item Layer whose owning organization supplies its visual identity.
 * @returns A thumbnail URL, or null when an image is missing or invalid.
 */
function organisationImage(item: ParentSectionLayerItem): string | null {
  const organisation = catalogue.organisations.find(
    row => row.id === item.organisationId,
  )
  if (!organisation?.image || failedImages.includes(organisation.id)) return null
  try {
    return getURLfromImage({
      image: organisation.image,
      transformation: 'c_fit,h_80,w_80',
    })
  } catch {
    return null
  }
}
/** Commit a type and navigate directly to the next stage that needs input.
 * @param next Resolved or explicitly selected feature type.
 * @returns Nothing.
 */
function selectType(next: FeatureType | null): void {
  if (next?.id !== confirmedTypeId) confirmedContext = null
  confirmedTypeId = next?.id ?? null
  onType(next)
  if (!next) {
    step = 1
    return
  }
  const options = targetContextChoices(
    next.targetContexts ??
      TARGET_CONTEXTS.filter(kind => next.locationKinds.includes(kind)),
  )
  if (options.length === 1) {
    confirmedContext = options[0]
    onContext(options[0])
    step = 3
    onSearch()
  } else {
    step = 2
  }
}
/** Animate the card's natural content height, including immediately resolved results.
 * @param node Setup card containing the measured body.
 * @param enabled Whether the centered setup card is visible.
 * @returns Action lifecycle hooks that release the observer and inline sizing.
 * @remarks CSS disables the transition when reduced motion is requested.
 */
function resizeCard(
  node: HTMLDivElement,
  enabled: boolean,
): { update: (enabled: boolean) => void; destroy: () => void } | undefined {
  const body = node.firstElementChild
  if (!(body instanceof HTMLElement)) return
  let active = enabled
  // Measure the unconstrained body so animating the card cannot retrigger itself.
  const measure = (): void => {
    node.style.height = active
      ? `${body.getBoundingClientRect().height + node.offsetHeight - node.clientHeight}px`
      : ''
  }
  const observer = new ResizeObserver(measure)
  observer.observe(body)
  measure()
  return {
    update(enabled: boolean): void {
      active = enabled
      measure()
    },
    destroy(): void {
      observer.disconnect()
      node.style.height = ''
    },
  }
}
/** Resolve determined stages before navigation so the active search stays mounted.
 * @param next Requested setup stage. @returns Nothing.
 */
function navigateToStep(next: number): void {
  if (next === 1 && resolvedTypes?.length === 1 && typeAnswered) next = 2
  if (next === 2 && contextAnswered && contextOptions.length === 1) next = 3
  if (next === step) return
  selectionVersion++
  pendingLayer = null
  failedLayer = null
  step = next
  if (next === 3) onSearch()
}
/** Resolve automatic choices before leaving the current stage.
 * @param next Accessible layer selected by the contributor.
 * @returns Completion of policy resolution and navigation.
 * @remarks Only the latest request may commit; failures retain the current page for retry.
 */
async function selectLayer(next: ParentSectionLayerItem): Promise<void> {
  const version = ++selectionVersion
  pendingLayer = next
  failedLayer = null
  try {
    const options = await getFeatureIntentOptions({
      layerId: featureCreationSourceLayerId(next.id, next),
    })
    if (version !== selectionVersion) return
    const retained =
      next.id === confirmedLayerId
        ? options.find(option => option.id === confirmedTypeId)
        : undefined
    if (next.id !== confirmedLayerId) {
      confirmedTypeId = null
      confirmedContext = null
    }
    resolvedTypes = options
    confirmedLayerId = next.id
    onLayer(next)
    // Commit the hierarchy and determined answers together, then reveal only the destination.
    selectType(retained ?? (options.length === 1 ? options[0] : null))
  } catch {
    if (version === selectionVersion) failedLayer = next
  } finally {
    if (version === selectionVersion) pendingLayer = null
  }
}
</script>
{#snippet destinationIcon(item: ParentSectionLayerItem)}
  {@const src = organisationImage(item)}
  {#if src}
    <img
      {src}
      alt=""
      width="40"
      height="40"
      class="size-10 shrink-0 rounded-lg object-contain"
      onerror={() => {
        failedImages = [...failedImages, item.organisationId]
      }}
    >
  {:else}
    <LayerIcon class="text-primary bg-primary/10 size-10 shrink-0 rounded-lg p-2" />
  {/if}
{/snippet}
{#snippet hierarchy(item: ParentSectionLayerItem)}
  {@const organisation = catalogue.organisations.find(
    row => row.id === item.organisationId,
  )}
  {@const project = catalogue.projects.find(row => row.id === item.projectId)}
  <span class="flex flex-wrap gap-x-1 text-xs">
    <span class="text-primary"
      >{organisation ? setupResourceLabel(organisation) : item.organisationId}</span
    >
    <span aria-hidden="true">›</span>
    <span class="text-muted-foreground"
      >{project
        ? getProjectDisplayName(
            project,
            {},
            { inOrganisationContext: Boolean(organisation) },
          ) || setupResourceLabel(project)
        : item.projectId}</span
    >
  </span>
{/snippet}
<section
  bind:clientHeight={measuredHeight}
  hidden={!visible}
  class="{visible
    ? 'flex'
    : 'hidden'} w-full min-w-0 flex-col motion-safe:transition-[padding] motion-safe:duration-200 {step <
  3
    ? 'min-h-0 flex-1 overflow-y-auto p-4 sm:p-8'
    : 'shrink-0'}"
  aria-label={m.setup_accessible_label()}
>
  <div
    use:resizeCard={step < 3}
    class="mx-auto flex w-full min-w-0 shrink-0 flex-col motion-safe:transition-[height] motion-safe:duration-200 motion-safe:ease-out {step <
    3
      ? 'bg-panel border-border my-auto max-w-3xl overflow-hidden rounded-2xl border shadow-sm'
      : ''}"
    data-setup-content
  >
    <div class="w-full min-w-0">
      <ol
        class="grid w-full grid-cols-4 gap-1 border-b border-border p-2 sm:p-3 {step < 3
          ? 'bg-base-200/40 text-base-content'
          : 'bg-slate-900 text-white'}"
        aria-label={m.setup_progress()}
      >
        {#each labels as label, index}
          <li class="flex min-w-0 items-stretch">
            <button
              type="button"
              disabled={(index === 1 && !layerAnswered) ||
                (index === 2 && !typeAnswered) ||
                (index === 3 && !contextAnswered)}
              aria-label={label}
              aria-current={step === index ? 'step' : undefined}
              class="focus-visible:outline-primary flex h-full w-full min-w-0 flex-col items-center gap-2 rounded-lg px-1 py-2 text-center transition-colors sm:flex-row sm:px-3 sm:text-left disabled:opacity-50 {step ===
                index && step < 3
                ? 'bg-primary/10'
                : ''}"
              onclick={() => navigateToStep(index)}
            >
              <span
                class="border-primary flex size-6 shrink-0 items-center justify-center rounded-full border text-xs"
                class:bg-primary={step === index}
                class:text-white={step === index}
              >
                {#if index < step}
                  <CheckIcon class="size-3" />
                {:else}
                  {index + 1}
                {/if}
              </span>
              <span class="grid min-w-0 gap-0.5">
                {#if step >= 3 && index < 3}
                  <span class="text-xs text-slate-300"
                    >{[
                      m.setup_layer(),
                      m.setup_feature_kind(),
                      m.setup_location_kind(),
                    ][index]}</span
                  >
                {/if}
                <span
                  class="text-xs font-medium break-words whitespace-normal sm:text-sm"
                  >{step < 3
                    ? [
                        m.setup_layer(),
                        m.setup_feature_kind(),
                        m.setup_location_kind(),
                        m.setup_find_location(),
                      ][index]
                    : label}</span
                >
              </span>
            </button>
          </li>
        {/each}
      </ol>
      <div
        hidden={step !== 0}
        class="bg-panel text-base-content mx-auto w-full p-5 sm:p-8"
      >
        <h2 class="mb-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {m.setup_map_question()}
        </h2>
        <label class="text-muted-foreground grid gap-5 text-sm"
          >{searchSubtitle}
          <input
            type="search"
            onkeydown={event => {
              if (event.key === 'Enter') event.preventDefault()
            }}
            bind:value={query}
            class="bg-panel text-base-content border-border focus-visible:outline-primary w-full min-w-0 rounded-lg border p-3"
            placeholder={m.setup_search_name()}
          >
        </label>
        {#if failedLayer}
          <div role="alert" class="mt-4 text-sm">
            <p>{m.setup_types_failed()}</p>
            <button
              type="button"
              class="mt-2 underline"
              onclick={() => {
                if (failedLayer) void selectLayer(failedLayer)
              }}
            >
              {m.setup_retry()}
            </button>
          </div>
        {/if}
        {#if !loading &&
          !query &&
          !scope.organisationId &&
          !scope.projectId &&
          recent.length}
          <p class="text-muted-foreground mt-6 text-xs font-medium tracking-wide">
            {m.setup_recent()}
          </p>
          <section
            class="my-3 flex gap-3 overflow-x-auto pb-2"
            aria-label={m.setup_recent_layers()}
          >
            {#each recent as item (item.id)}
              <button
                type="button"
                class="bg-panel border-border hover:border-primary focus-visible:ring-primary/50 hover:bg-base-200 flex min-h-40 w-56 shrink-0 flex-col items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset aria-busy:opacity-60"
                aria-pressed={item.id === confirmedLayerId}
                aria-busy={pendingLayer?.id === item.id}
                disabled={pendingLayer?.id === item.id}
                class:ring-inset={item.id === confirmedLayerId}
                class:ring-1={item.id === confirmedLayerId}
                class:ring-primary={item.id === confirmedLayerId}
                onclick={() => selectLayer(item)}
              >
                {@render destinationIcon(item)}
                <span
                  class="text-muted-foreground min-h-8 text-xs break-words whitespace-normal"
                  >{@render hierarchy(item)}</span
                >
                <span class="mt-auto font-semibold break-words whitespace-normal"
                  >{setupResourceLabel(item)}</span
                >
              </button>
            {/each}
          </section>
        {/if}
        {#if loading}
          <div role="status" aria-busy="true" aria-label={m.setup_loading_layers()}>
            <p class="text-muted-foreground mt-6 text-xs font-medium tracking-wide">
              {m.setup_recent()}
            </p>
            <div class="my-3 flex gap-3 overflow-hidden pb-2" aria-hidden="true">
              {#each [0, 1, 2, 3] as placeholder (placeholder)}
                <div
                  class="border-border flex min-h-40 w-56 shrink-0 flex-col items-start gap-3 rounded-xl border p-4"
                >
                  <div
                    class="bg-muted size-10 rounded-lg motion-safe:animate-pulse"
                  ></div>
                  <div class="min-h-8 w-full">
                    <div
                      class="bg-muted h-3 w-full rounded motion-safe:animate-pulse"
                    ></div>
                    <div
                      class="bg-muted mt-1 h-3 w-3/4 rounded motion-safe:animate-pulse"
                    ></div>
                  </div>
                  <div class="mt-auto flex h-6 w-3/4 items-center">
                    <div
                      class="bg-muted h-4 w-full rounded motion-safe:animate-pulse"
                    ></div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {:else if failed}
          <p role="alert" class="my-4">{m.setup_load_failed()}</p>
          <button type="button" class="underline" onclick={() => retry++}>
            {m.setup_retry()}
          </button>
        {:else}
          {#if query && !scope.organisationId && !scope.projectId}
            <div class="my-4 grid gap-2 sm:grid-cols-2">
              {#each results.organisations.filter(item =>
                setupResourceMatches(item, query),
              ) as item (item.id)}
                <button
                  type="button"
                  class="bg-panel border-border flex items-center gap-3 rounded-lg border p-3 text-left"
                  onclick={() => {
                    scope = { organisationId: item.id }
                    query = ''
                  }}
                >
                  <OrganisationIcon class="size-5 shrink-0" />
                  <span
                    >{setupResourceLabel(item)}
                    <small class="text-muted-foreground"
                      >{m.setup_organisation()}</small
                    ></span
                  >
                </button>
              {/each}
              {#each results.projects.filter(item =>
                setupResourceMatches(item, query),
              ) as item (item.id)}
                <button
                  type="button"
                  class="bg-panel border-border flex items-center gap-3 rounded-lg border p-3 text-left"
                  onclick={() => {
                    scope = { projectId: item.id }
                    query = ''
                  }}
                >
                  <ProjectIcon class="size-5 shrink-0" />
                  <span
                    >{setupResourceLabel(item)}
                    <small class="text-muted-foreground"
                      >{m.setup_project()}</small
                    ></span
                  >
                </button>
              {/each}
            </div>
          {/if}
          {#if query || scope.organisationId || scope.projectId}
            {#each results.projects.filter(
              item => !scope.projectId || item.id === scope.projectId,
            ) as project (project.id)}
              {@const layers = results.layers.filter(
                item => item.projectId === project.id,
              )}
              {#if layers.length}
                <h3 class="mt-5 mb-2 font-semibold">{setupResourceLabel(project)}</h3>
                <div class="grid gap-2 sm:grid-cols-2">
                  {#each layers as item (item.id)}
                    <button
                      type="button"
                      class="bg-panel border-border hover:border-primary group hover:bg-primary/5 focus-visible:ring-primary/50 grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset aria-busy:opacity-60"
                      aria-pressed={item.id === confirmedLayerId}
                      aria-busy={pendingLayer?.id === item.id}
                      disabled={pendingLayer?.id === item.id}
                      class:ring-inset={item.id === confirmedLayerId}
                      class:ring-1={item.id === confirmedLayerId}
                      class:ring-primary={item.id === confirmedLayerId}
                      onclick={() => selectLayer(item)}
                    >
                      {@render destinationIcon(item)}
                      <span class="min-w-0 break-words whitespace-normal"
                        ><span class="text-muted-foreground block text-xs"
                          >{@render hierarchy(item)}</span
                        ><span class="block font-semibold"
                          >{setupResourceLabel(item)}</span
                        ></span
                      >
                      <ArrowRightIcon
                        class="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5"
                      />
                    </button>
                  {/each}
                </div>
              {/if}
            {/each}
          {/if}
          {#if !results.layers.length}
            <p class="text-muted-foreground my-4 text-sm">
              {m.setup_empty()}
            </p>
          {/if}
        {/if}
      </div>
      {#if step === 1 && layerAnswered && layer && sourceLayerId}
        <div
          hidden={step !== 1}
          class="bg-panel text-base-content mx-auto w-full p-5 sm:p-8 [&_h3]:text-center"
        >
          <FeatureIntentChoice
            layerId={sourceLayerId}
            value={typeAnswered ? type?.id : null}
            requireSelection={true}
            options={resolvedTypes}
            onChange={selectType}
          />
        </div>
      {/if}
      {#if step === 2}
        <div
          hidden={step !== 2}
          class="bg-panel text-base-content mx-auto w-full p-5 sm:p-8 [&_legend]:w-full [&_legend]:text-center"
        >
          <TargetContextChoice
            {contexts}
            value={contextAnswered ? context : null}
            onChange={next => {
              confirmedContext = next
              onContext(next)
              step = 3
              onSearch()
            }}
          />
        </div>
      {/if}
    </div>
  </div>
</section>
