<script lang="ts">
// BITS UI
import { Dialog } from 'bits-ui'
// I18N
import { getI18n, m } from '$lib/i18n'
// SERVICES
import { upsertNewFeatureDraft } from '$lib/client/services/task'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// COMPONENTS
import { Icon } from '$lib/bits'
// ENUMS
import { NewFeatureMode } from '$lib/enums'
// ICONS
import Check from 'virtual:icons/lucide/check'
import ChevronRight from 'virtual:icons/lucide/chevron-right'
import Layers3 from 'virtual:icons/lucide/layers-3'
import LayoutGrid from 'virtual:icons/lucide/layout-grid'
import MapPin from 'virtual:icons/lucide/map-pin'
import Search from 'virtual:icons/lucide/search'
import Users from 'virtual:icons/lucide/users'
import X from 'virtual:icons/lucide/x'
// TYPES
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { Organisation } from '$lib/db/zod/schema/organisation.types'
import type { Project } from '$lib/db/zod/schema/project.types'
import type { Point } from 'geojson'

const appCtx = getAppCtx()
const omniCtx = getOmniCtx()
const responsiveCtx = getResponsiveCtx()

let searchQuery = $state('')
let isSaving = $state(false)
let isFindOtherOpen = $state(false)

const newFeature = $derived(appCtx.getNewFeature())
const appMainOffsetX = $derived(responsiveCtx.getAppMainOffsetX())
const activeLayers = $derived.by(() =>
  appCtx.state.prisms.layer
    .map(layerId => appCtx.cache.layer.get(layerId))
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

function getOrganisationLabel(organisation: Organisation | null | undefined): string {
  if (!organisation) return m.any_small_midge_aim()

  return (
    getI18n(organisation, 'nameShort', appCtx.getUserPreferences()) ||
    getI18n(organisation, 'name', appCtx.getUserPreferences()) ||
    m.any_small_midge_aim()
  )
}

function getProjectLabel(project: Project | null | undefined): string {
  if (!project) return m.deft_mealy_ant_vent()

  return (
    getI18n(project, 'nameShort', appCtx.getUserPreferences()) ||
    getI18n(project, 'name', appCtx.getUserPreferences()) ||
    m.deft_mealy_ant_vent()
  )
}

function getLayerLabel(layer: Layer | null | undefined): string {
  if (!layer) return m.active_bold_cobra_grin()

  return (
    getI18n(layer, 'nameShort', appCtx.getUserPreferences()) ||
    getI18n(layer, 'name', appCtx.getUserPreferences()) ||
    m.active_bold_cobra_grin()
  )
}

const activeLayerItems = $derived.by(() =>
  activeLayers
    .map(layer => {
      const project = appCtx.cache.project.get(layer.projectId)
      const organisation = appCtx.cache.organisation.get(layer.organisationId)

      if (!project || !organisation) return null

      return {
        layer,
        project,
        organisation,
        organisationName: getOrganisationLabel(organisation),
        projectName: getProjectLabel(project),
        layerName: getLayerLabel(layer),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item)),
)
const searchableResources = $derived.by(() => {
  const query = searchQuery.trim().toLowerCase()
  const matchesQuery = (value: string): boolean =>
    !query || value.toLowerCase().includes(query)

  const organisations = appCtx.state.resources.organisation
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

  const projects = appCtx.state.resources.project
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

  const layers = appCtx.state.resources.layer
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
  if (appCtx.newFeatureMode !== NewFeatureMode.parents) {
    isFindOtherOpen = false
    searchQuery = ''
  }
})

$effect(() => {
  if (appCtx.newFeatureMode !== NewFeatureMode.parents) return
  if (isFindOtherOpen) return
  if (activeLayers.length !== 1) return
  if (selectedOrganisation || selectedProject || selectedLayer) return

  const [layer] = activeLayers
  const project = appCtx.cache.project.get(layer.projectId)
  const organisation = appCtx.cache.organisation.get(layer.organisationId)

  appCtx.updateNewFeature({
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
    appCtx.setNewFeatureMode(NewFeatureMode.card)
    return
  }

  appCtx.setNewFeatureMode(null)
  omniCtx.cancelNewFeature()
}

function handleResourceSelect(resource: Organisation | Project | Layer): void {
  if ('projectId' in resource && 'organisationId' in resource) {
    appCtx.updateNewFeature({
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
    appCtx.updateNewFeature({
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

  appCtx.updateNewFeature({
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

  appCtx.updateNewFeature(updates)
  searchQuery = ''
}

function handleOpenFindOther(): void {
  const nextValue = !isFindOtherOpen
  isFindOtherOpen = nextValue
  if (nextValue) {
    appCtx.updateNewFeature({
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

async function handleAccept(): Promise<void> {
  if (!isValid || isSaving) return

  isSaving = true

  try {
    const shouldGoToLocation = !(
      appCtx.getNewFeature()?.feature?.geometry as Point | undefined
    )?.coordinates
    const draft = await upsertNewFeatureDraft(appCtx.getNewFeature() ?? {})
    appCtx.updateNewFeature({
      taskId: draft.task.id,
      featureId: draft.featureId,
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
      appCtx.setNewFeatureMode(NewFeatureMode.location)
      return
    }

    appCtx.setNewFeatureMode(NewFeatureMode.card)
  } finally {
    isSaving = false
  }
}
</script>

{#if appCtx.newFeatureMode === NewFeatureMode.parents}
  <Dialog.Root open={true}>
    <Dialog.Portal>
      <Dialog.Content
        class="bits-theme fixed left-1/2 top-1/2 z-[951] flex max-h-[min(44rem,calc(100vh-2rem))] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-black text-white shadow-2xl focus:outline-none"
        style={`margin-left: ${appMainOffsetX}px;`}
        onInteractOutside={event => {
          event.preventDefault()
        }}
        onEscapeKeydown={event => {
          event.preventDefault()
        }}
      >
        <div
          class="flex items-start justify-between gap-4 border-b border-white/10 px-6 pb-5 pt-6"
        >
          <div class="min-w-0">
            <Dialog.Title
              class="flex items-center gap-3 text-lg font-semibold uppercase tracking-[0.18em] text-white"
            >
              <Icon src={MapPin} class="h-5 w-5 text-primary" />
              {m.each_gray_felix_catch()}
            </Dialog.Title>
            <Dialog.Description class="mt-3 text-sm leading-6 text-white/68">
              {m.new_feature__select_map_desc()}
            </Dialog.Description>
          </div>
          <button
            type="button"
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/72 transition hover:bg-white/12 hover:text-white"
            onclick={handleCloseModal}
          >
            <Icon src={X} class="h-5 w-5" />
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {#if isFindOtherOpen}
            <div class="space-y-4">
              <div
                class="sticky top-0 z-10 -mx-4 space-y-4 border-b border-white/10 bg-black px-4 pb-4"
              >
                <div
                  class="flex flex-wrap justify-center gap-2 px-2 max-[420px]:flex-col max-[420px]:items-start"
                >
                  {#if selectedOrganisation}
                    <button
                      type="button"
                      class="inline-flex items-center gap-2 rounded-full border border-primary bg-primary px-3 py-2 text-sm text-white transition hover:opacity-90 max-[420px]:w-full max-[420px]:justify-start max-[420px]:py-[6px]"
                      onclick={() => clearSelection('organisation')}
                    >
                      <Icon src={Users} class="h-4 w-4 text-white" />
                      <span class="truncate">
                        {getI18n(selectedOrganisation, 'nameShort', appCtx.getUserPreferences())}
                      </span>
                    </button>
                  {/if}
                  {#if selectedProject}
                    <button
                      type="button"
                      class="inline-flex items-center gap-2 rounded-full border border-accent bg-accent px-3 py-2 text-sm text-white transition hover:opacity-90 max-[420px]:w-full max-[420px]:justify-start max-[420px]:py-[6px]"
                      onclick={() => clearSelection('project')}
                    >
                      <Icon src={LayoutGrid} class="h-4 w-4 text-white" />
                      <span class="truncate">
                        {getI18n(selectedProject, 'nameShort', appCtx.getUserPreferences())}
                      </span>
                    </button>
                  {/if}
                  {#if selectedLayer}
                    <button
                      type="button"
                      class="inline-flex items-center gap-2 rounded-full border border-secondary bg-secondary px-3 py-2 text-sm text-white transition hover:opacity-90 max-[420px]:w-full max-[420px]:justify-start max-[420px]:py-[6px]"
                      onclick={() => clearSelection('layer')}
                    >
                      <Icon src={Layers3} class="h-4 w-4 text-white" />
                      <span class="truncate">
                        {getI18n(selectedLayer, 'nameShort', appCtx.getUserPreferences())}
                      </span>
                    </button>
                  {/if}
                </div>
                <div class="px-2 pt-4">
                  <div class="relative">
                    <Icon
                      src={Search}
                      class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/34"
                    />
                    <input
                      bind:value={searchQuery}
                      type="text"
                      class="h-11 w-full rounded-full border border-white/10 bg-white/6 pl-11 pr-4 text-sm text-white caret-white placeholder:text-white/34 focus:border-white/24 focus:outline-none"
                      placeholder={m.new_feature__search_resources_placeholder()}
                    >
                  </div>
                </div>
              </div>

              <div class="space-y-2 pt-1">
                {#each searchableResources as item (`${item.kind}:${item.resource.id}`)}
                  <button
                    type="button"
                    class="flex w-full items-center justify-between border border-white/10 bg-white/4 px-4 py-3 text-left transition hover:border-white/18 hover:bg-white/8"
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
                            class="block truncate text-[11px] uppercase tracking-[0.18em] text-white/42"
                          >
                            {item.breadcrumb}
                          </span>
                        {/if}
                        <span class="block truncate text-sm font-medium"
                          >{item.label}</span
                        >
                      </span>
                    </span>
                    <Icon src={ChevronRight} class="h-4 w-4 shrink-0 text-white/38" />
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <div class="space-y-2">
              <h3
                class="px-2 pb-1 text-center font-mono text-[11px] uppercase tracking-[0.28em] text-white/48"
              >
                {m.new_feature__active_layers()}
              </h3>
              {#each activeLayerItems as item (item.layer.id)}
                <button
                  type="button"
                  class={`flex w-full items-center justify-between border px-4 py-3 text-left transition ${selectedLayer?.id === item.layer.id ? 'border-secondary bg-secondary/20 text-white' : 'border-white/10 bg-white/4 hover:border-white/18 hover:bg-white/8'}`}
                  onclick={() => handleResourceSelect(item.layer)}
                >
                  <span class="min-w-0 flex-1">
                    <span
                      class="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-x-3 gap-y-1 text-xs uppercase tracking-[0.18em] text-white/58"
                    >
                      <span class="flex min-w-0 items-center gap-2">
                        <Icon src={Users} class="h-4 w-4 shrink-0 text-primary" />
                        <span class="truncate">{item.organisationName}</span>
                      </span>
                      <span class="flex min-w-0 items-center gap-2">
                        <Icon src={LayoutGrid} class="h-4 w-4 shrink-0 text-accent" />
                        <span class="truncate">{item.projectName}</span>
                      </span>
                      <span class="flex min-w-0 items-center gap-2">
                        <Icon src={Layers3} class="h-4 w-4 shrink-0 text-secondary" />
                        <span class="truncate">{item.layerName}</span>
                      </span>
                    </span>
                  </span>
                  {#if selectedLayer?.id === item.layer.id}
                    <Icon src={Check} class="h-4 w-4 shrink-0 text-secondary" />
                  {:else}
                    <Icon src={ChevronRight} class="h-4 w-4 shrink-0 text-white/38" />
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <div
          class="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-5"
        >
          <button
            type="button"
            class="rounded-full border border-white/10 px-4 py-2 text-sm text-white/72 transition hover:bg-white/8 hover:text-white"
            onclick={handleOpenFindOther}
          >
            {isFindOtherOpen
              ? m.new_feature__select_active()
              : m.new_feature__find_other()}
          </button>
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="rounded-full border border-white/10 px-4 py-2 text-sm text-white/72 transition hover:bg-white/8 hover:text-white"
              onclick={handleCloseModal}
            >
              {m.cancel()}
            </button>
            <button
              type="button"
              class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
