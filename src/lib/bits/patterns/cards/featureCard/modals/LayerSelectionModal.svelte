<script lang="ts">
// THIRD PARTY
import { toast } from 'svelte-sonner'
// BITS UI
import { Dialog } from 'bits-ui'
// I18N
import { getI18n, m } from '#lib/i18n.js'
// AUTH
import { hasDurableAccount, requestAccountUpgrade } from '#lib/auth/upgrade.js'
// SERVICES
import { upsertNewFeatureDraft } from '#lib/client/services/task.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { getOmniCtx } from '#lib/context/omni.svelte.js'
import {
  getSurfaceLayoutCtx,
  SurfaceLayout,
} from '#lib/context/surfaceLayout.svelte.js'
import { getResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import { Icon } from '#lib/bits/index.js'
// ENUMS
import { NewFeatureMode } from '#lib/enums.js'
// ICONS
import Check from 'virtual:icons/proicons/checkmark'
import ChevronRight from 'virtual:icons/proicons/chevron-right'
import Layers3 from 'virtual:icons/proicons/layers'
import LayoutGrid from 'virtual:icons/proicons/grid'
import MapPin from 'virtual:icons/proicons/location'
import Search from 'virtual:icons/proicons/search'
import Users from 'virtual:icons/proicons/person-multiple'
import X from 'virtual:icons/proicons/cancel'
// TYPES
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import type { Organisation } from '#lib/db/zod/schema/organisation.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'
import type { Point } from 'geojson'

const appCtx = getSurfaceCtx()
const omniCtx = getOmniCtx()
const responsiveCtx = getResponsiveCtx()
const surfaceLayout = getSurfaceLayoutCtx() ?? new SurfaceLayout(responsiveCtx)

let searchQuery = $state('')
let isSaving = $state(false)
let isFindOtherOpen = $state(false)

const newFeature = $derived(appCtx.draft.current)
const appMainOffsetX = $derived(surfaceLayout.getAppMainOffsetX())
const activeLayers = $derived.by(() =>
  // Prefer the reactive list data: caches can hold narrower payloads from prior lookups.
  appCtx.scope.prisms.layer
    .map(
      layerId =>
        appCtx.queries.rows.layer.find(layer => layer.id === layerId) ??
        appCtx.cache.layer.get(layerId),
    )
    .filter((layer): layer is Layer => Boolean(layer)),
)
type SearchResource =
  | {
      kind: 'organisation'
      resource: Organisation
      label: string
      breadcrumb: string
    }
  | {
      kind: 'project'
      resource: Project
      label: string
      breadcrumb: string
    }
  | {
      kind: 'layer'
      resource: Layer
      label: string
      breadcrumb: string
    }

/**
 * Resolves a durable organisation label for the map-target chooser.
 *
 * @param organisation - Organisation whose label should be resolved.
 * @returns The best available translated label or a safe identifying fallback.
 */
function getOrganisationLabel(organisation: Organisation | null | undefined): string {
  if (!organisation) return m.any_small_midge_aim()

  // Use an empty fallback so a translation miss does not stop the label chain.
  return (
    getI18n(organisation, 'nameShort', appCtx.getUserPreferences(), '') ||
    getI18n(organisation, 'name', appCtx.getUserPreferences(), '') ||
    organisation.code ||
    m.any_small_midge_aim()
  )
}

/**
 * Resolves a project label for the map-target chooser.
 *
 * @param project - Project whose label should be resolved.
 * @returns The compact translated project name or a safe identifying fallback.
 */
function getProjectLabel(project: Project | null | undefined): string {
  if (!project) return m.deft_mealy_ant_vent()

  // Search results include the organisation breadcrumb, so the compact project name is clear.
  return (
    appCtx.getContextualProjectName(project, false, true, true) ||
    project.code ||
    m.deft_mealy_ant_vent()
  )
}

/**
 * Resolves the compact project label used beside an organisation in the active
 * layer hierarchy. This uses the project policy for the localised "All" replacement.
 *
 * @param project - Project whose contextual label should be resolved.
 * @returns The short project label or a safe identifying fallback.
 */
function getActiveLayerProjectLabel(project: Project | null | undefined): string {
  if (!project) return m.deft_mealy_ant_vent()

  // The organisation is displayed alongside this label, so a compact project name is clear.
  return (
    appCtx.getContextualProjectName(project, false, true, true) ||
    project.code ||
    m.deft_mealy_ant_vent()
  )
}

/**
 * Resolves a layer label for the map-target chooser.
 *
 * @param layer - Layer whose label should be resolved.
 * @returns The best available translated label or a safe identifying fallback.
 */
function getLayerLabel(layer: Layer | null | undefined): string {
  if (!layer) return m.active_bold_cobra_grin()

  // Use an empty fallback so a translation miss does not stop the label chain.
  return (
    getI18n(layer, 'nameShort', appCtx.getUserPreferences(), '') ||
    getI18n(layer, 'name', appCtx.getUserPreferences(), '') ||
    m.active_bold_cobra_grin()
  )
}

const activeLayerItems = $derived.by(() =>
  activeLayers
    .map(layer => {
      // Resolve the hierarchy from reactive list data before falling back to potentially partial caches.
      const project =
        appCtx.queries.rows.project.find(project => project.id === layer.projectId) ??
        appCtx.cache.project.get(layer.projectId)
      const organisation =
        appCtx.queries.rows.organisation.find(
          organisation => organisation.id === layer.organisationId,
        ) ?? appCtx.cache.organisation.get(layer.organisationId)

      if (!project || !organisation) return null

      return {
        layer,
        project,
        organisation,
        organisationName: getOrganisationLabel(organisation),
        projectName: getActiveLayerProjectLabel(project),
        layerName: getLayerLabel(layer),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item)),
)
const searchableResources = $derived.by(() => {
  const query = searchQuery.trim().toLowerCase()
  const matchesQuery = (value: string): boolean =>
    !query || value.toLowerCase().includes(query)

  const organisations = appCtx.queries.rows.organisation
    .filter(organisation =>
      selectedOrganisation ? organisation.id === selectedOrganisation.id : true,
    )
    .filter(organisation => organisation.id !== selectedOrganisation?.id)
    .map<SearchResource>(organisation => ({
      kind: 'organisation',
      resource: organisation,
      label: getOrganisationLabel(organisation),
      breadcrumb: '',
    }))

  const projects = appCtx.queries.rows.project
    .filter(project =>
      selectedOrganisation ? project.organisationId === selectedOrganisation.id : true,
    )
    .filter(project => (selectedProject ? project.id === selectedProject.id : true))
    .filter(project => project.id !== selectedProject?.id)
    .map<SearchResource>(project => {
      const organisation = appCtx.cache.organisation.get(project.organisationId)

      return {
        kind: 'project',
        resource: project,
        label: getProjectLabel(project),
        breadcrumb: getOrganisationLabel(organisation),
      }
    })

  const layers = appCtx.queries.rows.layer
    .filter(layer =>
      selectedOrganisation ? layer.organisationId === selectedOrganisation.id : true,
    )
    .filter(layer => (selectedProject ? layer.projectId === selectedProject.id : true))
    .filter(layer => (selectedLayer ? layer.id === selectedLayer.id : true))
    .filter(layer => layer.id !== selectedLayer?.id)
    .map<SearchResource>(layer => {
      const organisation = appCtx.cache.organisation.get(layer.organisationId)
      const project = appCtx.cache.project.get(layer.projectId)
      const organisationName = getOrganisationLabel(organisation)
      const projectName = getProjectLabel(project)

      return {
        kind: 'layer',
        resource: layer,
        label: getLayerLabel(layer),
        breadcrumb: `${organisationName} › ${projectName}`,
      }
    })

  return [...organisations, ...projects, ...layers].filter(item =>
    matchesQuery(`${item.label} ${item.breadcrumb}`),
  )
})

const selectedOrganisation = $derived(
  newFeature?.organisationId
    ? appCtx.cache.organisation.get(newFeature.organisationId)
    : null,
)
const selectedProject = $derived(
  newFeature?.projectId ? appCtx.cache.project.get(newFeature.projectId) : null,
)
const selectedLayer = $derived(
  newFeature?.layerId ? appCtx.cache.layer.get(newFeature.layerId) : null,
)
const isValid = $derived(
  Boolean(selectedOrganisation && selectedProject && selectedLayer),
)

$effect(() => {
  if (appCtx.draft.mode !== NewFeatureMode.parents) {
    isFindOtherOpen = false
    searchQuery = ''
  }
})

$effect(() => {
  if (appCtx.draft.mode !== NewFeatureMode.parents) return
  if (isFindOtherOpen) return
  if (activeLayers.length !== 1) return
  if (selectedOrganisation || selectedProject || selectedLayer) return

  const [layer] = activeLayers
  const project = appCtx.cache.project.get(layer.projectId)
  const organisation = appCtx.cache.organisation.get(layer.organisationId)

  appCtx.draft.update({
    organisationId: organisation?.id,
    projectId: project?.id,
    layerId: layer.id,
    feature: {
      organisationId: organisation?.id,
      projectId: project?.id,
      layerId: layer.id,
    },
  })
})

function handleCloseModal(): void {
  searchQuery = ''
  isFindOtherOpen = false

  if (newFeature?.taskId) {
    appCtx.draft.setMode(NewFeatureMode.card)
    return
  }

  appCtx.draft.setMode(null)
  omniCtx.cancelNewFeature()
}

function handleResourceSelect(resource: Organisation | Project | Layer): void {
  if ('projectId' in resource && 'organisationId' in resource) {
    appCtx.draft.update({
      organisationId: resource.organisationId,
      projectId: resource.projectId,
      layerId: resource.id,
      feature: {
        organisationId: resource.organisationId,
        projectId: resource.projectId,
        layerId: resource.id,
      },
    })
    return
  }

  if ('organisationId' in resource) {
    appCtx.draft.update({
      organisationId: resource.organisationId,
      projectId: resource.id,
      layerId: undefined,
      feature: {
        organisationId: resource.organisationId,
        projectId: resource.id,
        layerId: undefined,
      },
    })
    return
  }

  appCtx.draft.update({
    organisationId: resource.id,
    projectId: undefined,
    layerId: undefined,
    feature: {
      organisationId: resource.id,
      projectId: undefined,
      layerId: undefined,
    },
  })
}

function clearSelection(level: 'organisation' | 'project' | 'layer'): void {
  const updates = { feature: {} as Record<string, string | undefined> }

  if (level === 'organisation') {
    Object.assign(updates, {
      organisationId: undefined,
      projectId: undefined,
      layerId: undefined,
      feature: {
        organisationId: undefined,
        projectId: undefined,
        layerId: undefined,
      },
    })
  } else if (level === 'project') {
    Object.assign(updates, {
      projectId: undefined,
      layerId: undefined,
      feature: {
        projectId: undefined,
        layerId: undefined,
      },
    })
  } else {
    Object.assign(updates, {
      layerId: undefined,
      feature: {
        layerId: undefined,
      },
    })
  }

  appCtx.draft.update(updates)
  searchQuery = ''
}

function handleOpenFindOther(): void {
  const nextValue = !isFindOtherOpen
  isFindOtherOpen = nextValue
  if (nextValue) {
    appCtx.draft.update({
      organisationId: undefined,
      projectId: undefined,
      layerId: undefined,
      feature: {
        organisationId: undefined,
        projectId: undefined,
        layerId: undefined,
      },
    })
  }
  searchQuery = ''
}

/**
 * Persists the selected hierarchy as a new-feature draft and advances the flow.
 *
 * @returns Nothing.
 * @remarks The account guard covers stale client state after a guest session
 * changes while this modal is already open.
 */
async function handleAccept(): Promise<void> {
  if (!isValid || isSaving) return

  if (!hasDurableAccount(appCtx.account.user)) {
    requestAccountUpgrade('contribution', window.location.href)
    return
  }

  isSaving = true

  try {
    const shouldGoToLocation = !(
      appCtx.draft.current?.feature?.geometry as Point | undefined
    )?.coordinates
    const draft = await upsertNewFeatureDraft(appCtx.draft.current ?? {})
    appCtx.draft.update({
      taskId: draft.task.id,
      featureId: draft.featureId ?? undefined,
      organisationId: draft.organisationId,
      projectId: draft.projectId,
      layerId: draft.layerId,
      feature: {
        organisationId: draft.organisationId,
        projectId: draft.projectId,
        layerId: draft.layerId,
      },
    })

    searchQuery = ''

    if (shouldGoToLocation) {
      appCtx.draft.setMode(NewFeatureMode.location)
      return
    }

    appCtx.draft.setMode(NewFeatureMode.card)
  } catch (error) {
    console.error('Error saving new-feature draft:', error)
    toast.error(m.long_crazy_peacock_care())
  } finally {
    isSaving = false
  }
}
</script>

{#if appCtx.draft.mode === NewFeatureMode.parents}
  <Dialog.Root open={true}>
    <Dialog.Portal>
      <Dialog.Content
        class="bits-theme border-border bg-panel text-base-content fixed top-1/2 left-1/2 z-[951] flex max-h-[min(44rem,calc(100vh-2rem))] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[2rem] border shadow-2xl focus:outline-none"
        style={`margin-left: ${appMainOffsetX}px;`}
        onInteractOutside={event => {
          event.preventDefault()
        }}
        onEscapeKeydown={event => {
          event.preventDefault()
        }}
      >
        <div
          class="border-border flex items-start justify-between gap-4 border-b px-6 pt-6 pb-5"
        >
          <div class="min-w-0">
            <Dialog.Title
              class="text-base-content flex items-center gap-3 text-lg font-semibold tracking-[0.18em] uppercase"
            >
              <Icon src={MapPin} class="text-primary h-5 w-5" />
              {m.each_gray_felix_catch()}
            </Dialog.Title>
            <Dialog.Description class="text-muted-foreground mt-3 text-sm leading-6">
              {m.new_feature__select_map_desc()}
            </Dialog.Description>
          </div>
          <button
            type="button"
            class="border-border bg-surface text-muted-foreground hover:bg-raised hover:text-base-content flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition"
            onclick={handleCloseModal}
          >
            <Icon src={X} class="h-5 w-5" />
          </button>
        </div>

        <div
          class={`min-h-0 flex-1 overflow-y-auto px-4 ${isFindOtherOpen ? 'pt-0 pb-4' : 'py-4'}`}
        >
          {#if isFindOtherOpen}
            <div>
              <div
                class="border-border bg-panel sticky top-0 z-10 -mx-4 space-y-4 border-b px-4 py-4"
              >
                {#if selectedOrganisation || selectedProject || selectedLayer}
                  <div
                    class="flex flex-wrap justify-center gap-2 px-2 max-[420px]:flex-col max-[420px]:items-start"
                  >
                    {#if selectedOrganisation}
                      <button
                        type="button"
                        class="border-primary bg-primary text-primary-content inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition hover:opacity-90 max-[420px]:w-full max-[420px]:justify-start max-[420px]:py-[6px]"
                        onclick={() => clearSelection('organisation')}
                      >
                        <Icon src={Users} class="text-primary-content h-4 w-4" />
                        <span
                          class="!block overflow-hidden text-ellipsis whitespace-nowrap"
                          >{getOrganisationLabel(selectedOrganisation)}</span
                        >
                      </button>
                    {/if}
                    {#if selectedProject}
                      <button
                        type="button"
                        class="border-accent bg-accent text-accent-content inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition hover:opacity-90 max-[420px]:w-full max-[420px]:justify-start max-[420px]:py-[6px]"
                        onclick={() => clearSelection('project')}
                      >
                        <Icon src={LayoutGrid} class="text-accent-content h-4 w-4" />
                        <span
                          class="!block overflow-hidden text-ellipsis whitespace-nowrap"
                          >{getProjectLabel(selectedProject)}</span
                        >
                      </button>
                    {/if}
                    {#if selectedLayer}
                      <button
                        type="button"
                        class="border-secondary bg-secondary text-secondary-content inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition hover:opacity-90 max-[420px]:w-full max-[420px]:justify-start max-[420px]:py-[6px]"
                        onclick={() => clearSelection('layer')}
                      >
                        <Icon src={Layers3} class="text-secondary-content h-4 w-4" />
                        <span
                          class="!block overflow-hidden text-ellipsis whitespace-nowrap"
                          >{getLayerLabel(selectedLayer)}</span
                        >
                      </button>
                    {/if}
                  </div>
                {/if}
                <div class="px-2">
                  <div class="relative">
                    <Icon
                      src={Search}
                      class="text-muted-foreground pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2"
                    />
                    <input
                      bind:value={searchQuery}
                      type="text"
                      class="border-border bg-surface text-base-content caret-primary placeholder:text-muted-foreground focus:border-primary h-11 w-full rounded-full border pr-4 pl-11 text-sm focus:outline-none"
                      placeholder={m.new_feature__search_resources_placeholder()}
                    >
                  </div>
                </div>
              </div>

              <div class="space-y-2 pt-1">
                {#each searchableResources as item (`${item.kind}:${item.resource.id}`)}
                  <button
                    type="button"
                    class="border-border bg-surface hover:border-primary/40 hover:bg-raised flex w-full items-center justify-between border px-4 py-3 text-left transition"
                    onclick={() => handleResourceSelect(item.resource)}
                  >
                    <span class="flex min-w-0 items-center gap-3">
                      <Icon
                        src={item.kind === 'organisation'
                          ? Users
                          : item.kind === 'project'
                            ? LayoutGrid
                            : Layers3}
                        class={`h-4 w-4 shrink-0 ${item.kind === 'organisation' ? 'text-primary' : item.kind === 'project' ? 'text-accent' : 'text-secondary'}`}
                      />
                      <span class="min-w-0">
                        {#if item.breadcrumb}
                          <span
                            class="text-muted-foreground !block overflow-hidden text-[11px] tracking-[0.18em] text-ellipsis whitespace-nowrap uppercase"
                          >
                            {item.breadcrumb}
                          </span>
                        {/if}
                        <span
                          class="!block overflow-hidden text-sm font-medium text-ellipsis whitespace-nowrap"
                          >{item.label}</span
                        >
                      </span>
                    </span>
                    <Icon
                      src={ChevronRight}
                      class="text-muted-foreground h-4 w-4 shrink-0"
                    />
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <div class="space-y-2">
              <h3
                class="text-muted-foreground px-2 pb-1 text-center font-mono text-[11px] tracking-[0.28em] uppercase"
              >
                {m.new_feature__active_layers()}
              </h3>
              {#each activeLayerItems as item (item.layer.id)}
                <button
                  type="button"
                  class={`flex w-full items-center justify-between border px-4 py-3 text-left transition ${selectedLayer?.id === item.layer.id ? 'border-secondary bg-secondary/20 text-base-content' : 'border-border bg-surface hover:border-primary/40 hover:bg-raised'}`}
                  onclick={() => handleResourceSelect(item.layer)}
                >
                  <span class="min-w-0 flex-1">
                    <span
                      class="text-muted-foreground grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-x-3 gap-y-1 text-xs tracking-[0.18em] uppercase"
                    >
                      <span class="flex min-w-0 items-center gap-2">
                        <Icon src={Users} class="text-primary h-4 w-4 shrink-0" />
                        <span
                          class="!block overflow-hidden text-ellipsis whitespace-nowrap"
                          >{item.organisationName}</span
                        >
                      </span>
                      <span class="flex min-w-0 items-center gap-2">
                        <Icon src={LayoutGrid} class="text-accent h-4 w-4 shrink-0" />
                        <span
                          class="!block overflow-hidden text-ellipsis whitespace-nowrap"
                          >{item.projectName}</span
                        >
                      </span>
                      <span class="flex min-w-0 items-center gap-2">
                        <Icon src={Layers3} class="text-secondary h-4 w-4 shrink-0" />
                        <span
                          class="!block overflow-hidden text-ellipsis whitespace-nowrap"
                          >{item.layerName}</span
                        >
                      </span>
                    </span>
                  </span>
                  {#if selectedLayer?.id === item.layer.id}
                    <Icon src={Check} class="text-secondary h-4 w-4 shrink-0" />
                  {:else}
                    <Icon
                      src={ChevronRight}
                      class="text-muted-foreground h-4 w-4 shrink-0"
                    />
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <div
          class="border-border flex items-center justify-between gap-3 border-t px-6 py-5"
        >
          <button
            type="button"
            class="border-border text-muted-foreground hover:bg-raised hover:text-base-content rounded-full border px-4 py-2 text-sm transition"
            onclick={handleOpenFindOther}
          >
            {isFindOtherOpen
              ? m.new_feature__select_active()
              : m.new_feature__find_other()}
          </button>
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="border-border text-muted-foreground hover:bg-raised hover:text-base-content rounded-full border px-4 py-2 text-sm transition"
              onclick={handleCloseModal}
            >
              {m.cancel()}
            </button>
            <button
              type="button"
              class="bg-primary text-primary-content rounded-full px-5 py-2 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              onclick={handleAccept}
              disabled={!isValid || isSaving}
            >
              {isSaving ? m.new_feature__saving() : m.continue()}
            </button>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
{/if}
