<script lang="ts">
import { goto } from '$app/navigation'
import { page } from '$app/state'
import { getCoordinates } from '$lib/client/services/geospatial'
import { getURLfromImage } from '$lib/client/services/image'
import { sortFeatureProperties } from '$lib/client/services/property'
import { getNameForToast } from '$lib/client/services/resource'
import {
  overrideFeatureEntityBoolean,
  overrideFeatureListItemBoolean,
  toEmptyFeatureFormInput,
  toFeatureFormInput,
} from '$lib/client/services/feature'
import {
  archiveFeature,
  featureForm,
  getFeature,
  getFeatures,
  publishFeature,
} from '$lib/api/server/feature.remote'
import { getLayer, getLayers } from '$lib/api/server/layer.remote'
import { getOrganisationsWhichHaveLayers } from '$lib/api/server/organisation.remote'
import { getProjects, getProjectsWhichHaveLayers } from '$lib/api/server/project.remote'
import {
  captureHeaderTransitionSnapshot,
  createResourceEditorPage,
  prepareSubmitPayloadMeta,
  resolveOptimisticHeaderFacets,
  resolveOptimisticHeaderStatus,
  updateFormData,
} from '$lib/client/services/form'
import { FeaturePreflightFormData } from '$lib/db/zod'
import {
  FormFacetNav,
  FormFeatureFieldsSection,
  FormFeatureParentSection,
  FormFeatureSectionHeader,
  FormSection as FormI18nSectionFormSection,
  FormI18nDescriptorFields,
  FormI18nSection,
  FormMapSection,
  InfoDialog,
  Main,
  Separator,
  SwapField,
  TextArea,
  TextInput,
  UserAttributionCard,
} from '$lib/bits'
import { configureForm } from '$lib/factories.svelte'
import { getLocaleKey, getLocaleOrder, m } from '$lib/i18n'
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
import { NEW_REF } from '$lib/constants'
import { FirstClassResource } from '$lib/enums'
import { getAdminFacetTabsForResource, getUrlForResource } from '$lib/navigation'
import { createSchemaRequiredInferer } from '$lib/utils/form-schema'
import { onMount, untrack } from 'svelte'
import { toast } from 'svelte-sonner'
import ChevronLeftIcon from 'virtual:icons/lucide/chevron-left'
import ChevronRightIcon from 'virtual:icons/lucide/chevron-right'
import CircleHelpIcon from 'virtual:icons/lucide/circle-help'
import ExpandIcon from 'virtual:icons/lucide/expand'
import FeatureIcon from 'virtual:icons/lucide/map-pin'
import ImageIcon from 'virtual:icons/lucide/image'
import ShrinkIcon from 'virtual:icons/lucide/shrink'
import type {
  FeatureFormInput,
  FeatureGetState,
  FeatureProperty,
} from '$lib/db/zod/schema/feature.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { Point } from 'geojson'
import type {
  ParentSectionLayerItem,
  ParentSectionOrganisationItem,
  ParentSectionProjectItem,
} from '$lib/bits/patterns/forms/formParentSection'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { FacetType, HeaderTransitionSnapshot } from '$lib/types'
import type { FormFacetNavAction } from '$lib/bits'

const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()
const facetTabs = getAdminFacetTabsForResource(FirstClassResource.feature)
const resourceEditorPage = createResourceEditorPage({
  headerCtrl,
  icon: FeatureIcon,
  facetTabs,
})

const featureRef = $derived(page.params.feature as string)
const localeKey = $derived(getLocaleKey())
const activeFacet = $derived(
  adminCtx.activeFacet === false ? 'core' : adminCtx.activeFacet,
)
const isCoreFacet = $derived(activeFacet === 'core')
const isFieldsFacet = $derived(activeFacet === 'fields')
const isAddressFacet = $derived(activeFacet === 'address')
const isImagesFacet = $derived(activeFacet === 'images')
const showsVisualSection = $derived(isCoreFacet || isFieldsFacet)
const isNewFeatureRef = $derived(featureRef === NEW_REF)
const locales = $derived(getLocaleOrder(localeKey))
const parentLayerId = $derived(page.url.searchParams.get('parentId') ?? '')
const visibleFacetTabs = $derived.by(() => {
  const tabs = new Map(facetTabs)
  if (isNewFeatureRef) tabs.delete('images')
  return tabs
})
const visibleFacetOrder = $derived.by((): readonly FacetType[] =>
  isNewFeatureRef
    ? ['core', 'fields', 'address']
    : ['core', 'fields', 'address', 'images'],
)

let emptyFeatureFormSeed = $state<FeatureFormInput>(
  toEmptyFeatureFormInput(parentLayerId),
)
let featureFormSource = $state<FeatureFormInput>(emptyFeatureFormSeed)
let feature = $state<FeatureGetState>(null)
let committedFeature = $state<FeatureGetState>(null)
let featureList = $state<Array<Record<string, any>>>([])
let selectedOrganisationById = $state<Record<string, ParentSectionOrganisationItem>>({})
let selectedProjectById = $state<Record<string, ParentSectionProjectItem>>({})
let selectedLayerById = $state<Record<string, ParentSectionLayerItem>>({})
let organisationReplaceOrganisationId = $state<string | null>(null)
let organisationReplaceProjectId = $state<string | null>(null)
let organisationReplaceLayerId = $state<string | null>(null)
let projectReplaceProjectId = $state<string | null>(null)
let projectReplaceLayerId = $state<string | null>(null)
let layerReplaceLayerId = $state<string | null>(null)
let isVisualSectionCollapsed = $state(false)
let isCanonicalImageLoaded = $state(false)
let isCanonicalImagePending = $state(false)
let canonicalImageMeasuredAspectRatio = $state<number | null>(null)
let presentedCanonicalImageSrc = $state<string | null>(null)
let presentedCanonicalImageHref = $state<string | undefined>(undefined)
let presentedCanonicalImageTitle = $state('')
let lastHeaderKey = ''
let lastFormActionsSignature = ''
let optimisticHeaderState = $state<HeaderTransitionSnapshot>({
  canEdit: true,
  canPublish: true,
  showDeleteAction: true,
  showPublishAction: true,
  isPublished: false,
  isDeleted: false,
  facets: [],
})

$effect(() => {
  if (!isNewFeatureRef) return
  const nextSeed = toEmptyFeatureFormInput(parentLayerId)
  emptyFeatureFormSeed = nextSeed
  featureFormSource = nextSeed
})

$effect(() => {
  canonicalImageSrc
  isCanonicalImageLoaded = false
  isCanonicalImagePending = Boolean(presentedCanonicalImageSrc)
  canonicalImageMeasuredAspectRatio = null
})

$effect(() => {
  featureRef
  if (presentedCanonicalImageSrc) {
    isCanonicalImagePending = true
  }
})

$effect(() => {
  const nextSrc = canonicalImageSrc
  const nextHref = canonicalImageHref
  const nextTitle = title

  if (!nextSrc) {
    presentedCanonicalImageSrc = null
    presentedCanonicalImageHref = nextHref
    presentedCanonicalImageTitle = nextTitle
    isCanonicalImagePending = false
    return
  }

  if (nextSrc === presentedCanonicalImageSrc) {
    presentedCanonicalImageHref = nextHref
    presentedCanonicalImageTitle = nextTitle
    isCanonicalImagePending = false
    return
  }

  let cancelled = false
  const image = new Image()

  image.onload = () => {
    if (cancelled) return
    presentedCanonicalImageSrc = nextSrc
    presentedCanonicalImageHref = nextHref
    presentedCanonicalImageTitle = nextTitle
    isCanonicalImagePending = false
    handleCanonicalImageLoad({
      width: image.naturalWidth,
      height: image.naturalHeight,
    })
  }

  image.onerror = () => {
    if (cancelled) return
    presentedCanonicalImageSrc = nextSrc
    presentedCanonicalImageHref = nextHref
    presentedCanonicalImageTitle = nextTitle
    isCanonicalImagePending = false
  }

  image.src = nextSrc

  return () => {
    cancelled = true
  }
})

const configuredFeatureForm = configureForm(() => ({
  form: featureForm as never,
  onsubmit: (({ data }: { data: FeatureFormInput }) => {
    const submittedPayload = prepareSubmitPayloadMeta(data, {
      defaultMode: isNewFeatureRef ? 'create' : 'update',
      resolveUpdateId: () => feature?.data?.id ?? committedFeature?.data?.id ?? '',
    })
    return submittedPayload as typeof data
  }) as never,
  key: featureRef,
  schema: FeaturePreflightFormData as never,
  data: featureFormSource,
}))
const formCtx = $derived(configuredFeatureForm())
const currentFormValue = $derived(formCtx.form.fields.value() as FeatureFormInput)
const currentFeatureData = $derived(currentFormValue?.data ?? emptyFeatureFormSeed.data)
const isRequiredInPreflight = createSchemaRequiredInferer(() => featureFormSource)
const isEditing = $derived(isNewFeatureRef || headerCtrl.state.isEditing)
const organisationIdValue = $derived(String(currentFeatureData.organisationId ?? ''))
const projectIdValue = $derived(String(currentFeatureData.projectId ?? ''))
const layerIdValue = $derived(String(currentFeatureData.layerId ?? ''))
const hasSelectedLayer = $derived(layerIdValue.trim().length > 0)
const title = $derived(
  currentFeatureData.i18n?.[localeKey]?.title ||
    feature?.data?.i18n?.[localeKey]?.title ||
    m.feature__title(),
)
const featureCoordinates = $derived(
  getCoordinates(
    ((currentFeatureData.geometry as Point)?.coordinates ?? [
      114.1693671540923, 22.319307515052614,
    ]) as [number, number],
  ),
)
const initialMapCenter = $derived.by(() => {
  const userLocation = adminCtx.appCtx.state.userLocation
  if (!userLocation) return null
  return [userLocation.coords.longitude, userLocation.coords.latitude] as [
    number,
    number,
  ]
})
const canonicalImageHref = $derived(
  feature?.data?.id
    ? (getUrlForResource(
        adminCtx,
        FirstClassResource.feature,
        feature.data.id,
        'images',
      ) ?? undefined)
    : undefined,
)
const canonicalImage = $derived(feature?.data?.image as ImageCtxEnvelope | null)
const canonicalImageSrc = $derived.by(() => {
  if (!canonicalImage) return null
  try {
    return getURLfromImage({ image: canonicalImage })
  } catch {
    return null
  }
})
const resolvedCanonicalImageAspectRatio = $derived(
  canonicalImageMeasuredAspectRatio ?? 1,
)
const visualSectionClass = $derived(
  [
    'bits-feature-editor__section',
    'bits-feature-editor__section--with-visual',
    isVisualSectionCollapsed
      ? 'bits-feature-editor__section--visual-collapsed'
      : 'bits-feature-editor__section--visual-expanded',
  ].join(' '),
)
const sectionClass = 'bits-feature-editor__section'
const featureDescriptorFieldConfigs = [
  { key: 'title', label: m.feature__title(), kind: 'input' },
  { key: 'description', label: m.feature__description(), kind: 'textarea' },
] as const
const nonTranslatableItems = $derived(
  (currentFeatureData.properties ?? [])
    .filter(
      property =>
        property.property?.type === 'classifier' ||
        (property.property?.type === 'specifier' && !property.property?.isTranslatable),
    )
    .map(property => ({
      property: property.property!,
      value: property.value ?? '',
      checked: property.value === 'true',
      isEditing,
      options:
        property.property?.values?.map((option: any) => ({
          value: option.id,
          label:
            option.i18n?.[localeKey]?.value ?? option.i18n?.en?.value ?? option.value,
        })) ?? [],
      onChange: (nextValue: string | boolean) => {
        updatePropertyValue(property.propertyId, nextValue)
      },
    })),
)
const translatableSpecifierItems = $derived(
  (currentFeatureData.properties ?? []).filter(
    property =>
      property.property?.type === 'specifier' &&
      Boolean(property.property?.isTranslatable),
  ),
)
const visibleAllIssues = $derived(
  (formCtx.allIssues ?? []) as Array<{
    message?: string
    path?: Array<string | number>
  }>,
)
const formLevelIssues = $derived.by(() => {
  const messages = visibleAllIssues
    .filter(issue => !Array.isArray(issue.path) || issue.path.length === 0)
    .map(issue => issue.message)
    .filter((message): message is string => Boolean(message))
  return Array.from(new Set(messages))
})
const organisationIssues = $derived.by(() => {
  const messages = visibleAllIssues
    .filter(issue => issue.path?.[1] === 'organisationId')
    .map(issue => issue.message)
    .filter((message): message is string => Boolean(message))
  return Array.from(new Set(messages))
})
const projectIssues = $derived.by(() => {
  const messages = visibleAllIssues
    .filter(issue => issue.path?.[1] === 'projectId')
    .map(issue => issue.message)
    .filter((message): message is string => Boolean(message))
  return Array.from(new Set(messages))
})
const layerIssues = $derived.by(() => {
  const messages = visibleAllIssues
    .filter(issue => issue.path?.[1] === 'layerId')
    .map(issue => issue.message)
    .filter((message): message is string => Boolean(message))
  return Array.from(new Set(messages))
})
const hiddenOrganisationInputAttrs = $derived.by(() => {
  if (!organisationIdValue) return null
  return formCtx.form.fields.data.organisationId.as('hidden', organisationIdValue)
})
const hiddenProjectInputAttrs = $derived.by(() => {
  if (!projectIdValue) return null
  return formCtx.form.fields.data.projectId.as('hidden', projectIdValue)
})
const hiddenLayerInputAttrs = $derived.by(() => {
  if (!layerIdValue) return null
  return formCtx.form.fields.data.layerId.as('hidden', layerIdValue)
})
const selectedOrganisation = $derived.by(() => {
  if (!organisationIdValue) return null
  return selectedOrganisationById[organisationIdValue] ?? null
})
const selectedProject = $derived.by(() => {
  if (!projectIdValue) return null
  return selectedProjectById[projectIdValue] ?? null
})
const selectedLayer = $derived.by(() => {
  if (!layerIdValue) return null
  return selectedLayerById[layerIdValue] ?? null
})
const currentFeatureId = $derived(feature?.data?.id ?? '')
const currentFeatureIndex = $derived.by(() => {
  if (!currentFeatureId) return -1
  return featureList.findIndex(item => item.id === currentFeatureId)
})
const previousFeatureRef = $derived.by(() => {
  if (currentFeatureIndex <= 0) return null
  return featureList[currentFeatureIndex - 1]?.id ?? null
})
const nextFeatureRef = $derived.by(() => {
  if (currentFeatureIndex < 0) return null
  return featureList[currentFeatureIndex + 1]?.id ?? null
})

function toParentOrganisationItem(
  organisation: Record<string, any> | null | undefined,
): ParentSectionOrganisationItem | null {
  if (!organisation?.id) return null
  return {
    id: organisation.id,
    code: organisation.code ?? '',
    i18n: organisation.i18n ?? null,
    image: organisation.image ?? null,
  }
}

function toParentProjectItem(
  project: Record<string, any> | null | undefined,
): ParentSectionProjectItem | null {
  if (!project?.id) return null
  return {
    id: project.id,
    organisationId: project.organisationId ?? '',
    code: project.code ?? '',
    i18n: project.i18n ?? null,
    image: project.image ?? null,
  }
}

function toParentLayerItem(
  layer: Record<string, any> | null | undefined,
): ParentSectionLayerItem | null {
  if (!layer?.id) return null
  return {
    id: layer.id,
    organisationId: layer.organisationId ?? '',
    projectId: layer.projectId ?? '',
    code: layer.code ?? '',
    i18n: layer.i18n ?? null,
    image: layer.image ?? null,
  }
}

function syncSelectedOrganisation(
  organisation: ParentSectionOrganisationItem | null | undefined,
): void {
  if (!organisation?.id) return
  selectedOrganisationById = {
    ...selectedOrganisationById,
    [organisation.id]: organisation,
  }
}

function syncSelectedProject(
  project: ParentSectionProjectItem | null | undefined,
): void {
  if (!project?.id) return
  selectedProjectById = {
    ...selectedProjectById,
    [project.id]: project,
  }
}

function syncSelectedLayer(layer: ParentSectionLayerItem | null | undefined): void {
  if (!layer?.id) return
  selectedLayerById = {
    ...selectedLayerById,
    [layer.id]: layer,
  }
}

$effect(() => {
  const id = organisationIdValue
  if (!id || selectedOrganisationById[id]) return
  let cancelled = false
  void adminCtx.appCtx.getOrganisationById(id).then(organisation => {
    if (cancelled) return
    syncSelectedOrganisation(toParentOrganisationItem(organisation as never))
  })
  return () => {
    cancelled = true
  }
})

$effect(() => {
  const id = projectIdValue
  if (!id || selectedProjectById[id]) return
  let cancelled = false
  void adminCtx.appCtx.getProjectById(id).then(project => {
    if (cancelled) return
    syncSelectedProject(toParentProjectItem(project as never))
  })
  return () => {
    cancelled = true
  }
})

$effect(() => {
  const id = layerIdValue
  if (!id || selectedLayerById[id]) return
  let cancelled = false
  void adminCtx.appCtx.getLayerById(id).then(layer => {
    if (cancelled) return
    syncSelectedLayer(toParentLayerItem(layer as never))
  })
  return () => {
    cancelled = true
  }
})

function resetFeatureParents(): void {
  applyFeatureParentSelection({
    organisationId: '',
    projectId: '',
    layerId: '',
  })
  organisationReplaceOrganisationId = null
  organisationReplaceProjectId = null
  organisationReplaceLayerId = null
  projectReplaceProjectId = null
  projectReplaceLayerId = null
  layerReplaceLayerId = null
}

function getFacetActionLabel(facet: FacetType): string {
  switch (facet) {
    case 'core':
      return m.admin__forms_common_descriptors()
    case 'fields':
      return m.feature__fields_title()
    case 'address':
      return m.feature__address()
    case 'images':
      return m.feature__images()
    default:
      return facet
  }
}

function getAdjacentFacet(
  facet: FacetType,
  direction: 'previous' | 'next',
): FacetType | null {
  const currentIndex = visibleFacetOrder.indexOf(facet)
  if (currentIndex === -1) return null
  const adjacentIndex = direction === 'previous' ? currentIndex - 1 : currentIndex + 1
  return visibleFacetOrder[adjacentIndex] ?? null
}

function buildFacetNavAction(
  facet: FacetType,
  direction: 'previous' | 'next',
): FormFacetNavAction | null {
  const adjacentFacet = getAdjacentFacet(facet, direction)
  if (!adjacentFacet) return null
  const isDisabled = adjacentFacet === 'fields' && !hasSelectedLayer

  return {
    text: m.admin__forms_common_set({ label: getFacetActionLabel(adjacentFacet) }),
    disabled: isDisabled,
    onClick: () => {
      if (isDisabled) return
      goToFacet(adjacentFacet)
    },
  }
}

function goToFacet(facet: FacetType): void {
  if (facet === 'fields' && !hasSelectedLayer) return
  if (facet === 'images' && isNewFeatureRef) return
  if (facet === activeFacet) return

  const href = getUrlForResource(
    adminCtx,
    FirstClassResource.feature,
    featureRef,
    facet,
  )
  if (!href) return

  adminCtx.setFacet(facet, featureRef, FirstClassResource.feature)
  void goto(href, {
    noScroll: true,
    keepFocus: true,
    replaceState: false,
  })
}

function commitFeatureState(value: FeatureGetState): void {
  committedFeature = value
  feature = value
}

async function refreshFeature(ref: string = featureRef): Promise<FeatureGetState> {
  if (ref === NEW_REF) {
    const nextSeed = toEmptyFeatureFormInput(parentLayerId)
    commitFeatureState(null)
    emptyFeatureFormSeed = nextSeed
    featureFormSource = nextSeed
    return null
  }

  const result = (await getFeature({
    ref,
    refKey: 'id',
    meta: { isAdminRequest: true, profile: 'admin' },
  }).catch(() => null)) as FeatureGetState

  commitFeatureState(result)
  if (result?.data) {
    featureFormSource = toFeatureFormInput(result.data, parentLayerId)
  }
  return result
}

async function refreshFeatureList(): Promise<void> {
  if (isNewFeatureRef) {
    featureList = []
    return
  }

  try {
    const result = await getFeatures({
      conditions: adminCtx.appCtx.isSuperAdmin()
        ? { isArchived: null, isPublished: null }
        : { isArchived: false, isPublished: null },
      prisms: adminCtx.appCtx.state.prisms,
      meta: { isAdminRequest: true, profile: 'card' },
    })
    featureList = (result.data ?? []) as Array<Record<string, any>>
  } catch {
    featureList = []
  }
}

function handleCanonicalImageLoad(payload: { width: number; height: number }): void {
  if (payload.width <= 0 || payload.height <= 0) return
  isCanonicalImageLoaded = true
  canonicalImageMeasuredAspectRatio = payload.width / payload.height
}

function updateFeatureData(
  mutator: (data: FeatureFormInput['data']) => FeatureFormInput['data'],
): void {
  updateFormData(formCtx.form, data => mutator(data as FeatureFormInput['data']))
}

function updatePropertyValue(propertyId: string, nextValue: string | boolean): void {
  updateFeatureData(data => ({
    ...data,
    properties: (data.properties ?? []).map(property =>
      property.propertyId === propertyId
        ? {
            ...property,
            value: String(nextValue),
            propertyValueId:
              property.property?.component === 'SelectField'
                ? String(nextValue)
                : property.propertyValueId,
          }
        : property,
    ),
  }))
}

function updatePropertyI18nValue(
  propertyId: string,
  locale: string,
  nextValue: string,
): void {
  updateFeatureData(data => ({
    ...data,
    properties: (data.properties ?? []).map(property =>
      property.propertyId === propertyId
        ? {
            ...property,
            i18n: {
              ...(property.i18n ?? {}),
              [locale]: {
                ...(property.i18n?.[locale as keyof typeof property.i18n] ?? {}),
                value: nextValue,
              },
            },
          }
        : property,
    ),
  }))
}

function togglePropertyI18nValueGen(propertyId: string, locale: string): void {
  updateFeatureData(data => ({
    ...data,
    properties: (data.properties ?? []).map(property =>
      property.propertyId === propertyId
        ? {
            ...property,
            i18n: {
              ...(property.i18n ?? {}),
              [locale]: {
                ...(property.i18n?.[locale as keyof typeof property.i18n] ?? {}),
                valueGen:
                  !property.i18n?.[locale as keyof typeof property.i18n]?.valueGen,
              },
            },
          }
        : property,
    ),
  }))
}

function onResetTranslatableValues(targetLocale: string): void {
  updateFeatureData(data => ({
    ...data,
    properties: (data.properties ?? []).map(property => {
      if (
        property.property?.type !== 'specifier' ||
        !property.property?.isTranslatable
      ) {
        return property
      }

      return {
        ...property,
        i18n: {
          ...(property.i18n ?? {}),
          [targetLocale]: {
            ...(property.i18n?.[targetLocale as keyof typeof property.i18n] ?? {}),
            value: '',
            valueGen: false,
          },
        },
      }
    }),
  }))
}

async function onTranslateTranslatableValues(
  _sourceLocale: string,
  _targetLocale: string,
  _sectionKey?: string,
): Promise<void> {
  toast.info('Translation restore is not wired yet.')
}

function handleCoordinateChange(nextCoordinates: number[]): void {
  updateFeatureData(data => ({
    ...data,
    geometry: {
      ...(data.geometry as Point),
      type: 'Point',
      coordinates: nextCoordinates,
    },
  }))
}

function applyFeatureParentSelection(params: {
  organisationId?: string
  projectId?: string
  layerId?: string
}): void {
  const nextLayerId = params.layerId ?? ''
  updateFeatureData(data => ({
    ...data,
    organisationId: params.organisationId ?? '',
    projectId: params.projectId ?? '',
    layerId: nextLayerId,
  }))
  void syncLayerBackedProperties(nextLayerId)
}

function beginReplaceParentOrganisation(): void {
  if (!organisationIdValue) return
  organisationReplaceOrganisationId = organisationIdValue
  organisationReplaceProjectId = projectIdValue
  organisationReplaceLayerId = layerIdValue
}

function cancelReplaceParentOrganisation(): void {
  organisationReplaceOrganisationId = null
  organisationReplaceProjectId = null
  organisationReplaceLayerId = null
}

function beginReplaceParentProject(): void {
  if (!projectIdValue) return
  projectReplaceProjectId = projectIdValue
  projectReplaceLayerId = layerIdValue
}

function cancelReplaceParentProject(): void {
  projectReplaceProjectId = null
  projectReplaceLayerId = null
}

function beginReplaceParentLayer(): void {
  if (!layerIdValue) return
  layerReplaceLayerId = layerIdValue
}

function cancelReplaceParentLayer(): void {
  layerReplaceLayerId = null
}

function toLayerBackedFeatureProperties(
  layer: Layer | null | undefined,
  currentProperties: FeatureFormInput['data']['properties'] | null | undefined,
): FeatureFormInput['data']['properties'] {
  if (!layer) return []

  const currentByPropertyId = new Map(
    (currentProperties ?? []).map(property => [property.propertyId, property]),
  )

  const nextProperties = (layer.properties ?? [])
    .filter(layerProperty => {
      const property = layerProperty.property
      return (
        layerProperty.isVisible === true &&
        layerProperty.isUserContributable === true &&
        property &&
        (property.type === 'classifier' || property.type === 'specifier') &&
        property.key !== 'grade'
      )
    })
    .map(layerProperty => {
      const current = currentByPropertyId.get(layerProperty.propertyId)
      if (current) {
        return {
          ...current,
          property: layerProperty.property,
        }
      }

      return {
        propertyId: layerProperty.propertyId,
        value: '',
        propertyValueId: '',
        i18n: {
          en: { value: '', valueGen: false },
          zhHans: { value: '', valueGen: false },
          zhHant: { value: '', valueGen: false },
        },
        property: layerProperty.property,
        propertyValue: null,
      }
    })

  return sortFeatureProperties(
    nextProperties as Omit<FeatureProperty, 'featureId'>[],
  ) as FeatureFormInput['data']['properties']
}

async function syncLayerBackedProperties(
  layerId: string | null | undefined,
): Promise<void> {
  const resolvedLayerId = layerId?.trim() ?? ''

  if (!resolvedLayerId) {
    updateFeatureData(data => {
      if ((data.properties ?? []).length === 0) return data
      return {
        ...data,
        properties: [],
      }
    })
    return
  }

  try {
    const result = await getLayer({
      ref: resolvedLayerId,
      refKey: 'id',
      meta: { isAdminRequest: true, profile: 'admin' },
    })
    const layer = (result?.data ?? null) as Layer | null
    syncSelectedLayer(toParentLayerItem(layer as never))
    updateFeatureData(data => ({
      ...data,
      properties: toLayerBackedFeatureProperties(layer, data.properties),
    }))
  } catch {
    updateFeatureData(data => {
      if ((data.properties ?? []).length === 0) return data
      return {
        ...data,
        properties: [],
      }
    })
  }
}

async function onSearchParentOrganisations(
  query: string,
): Promise<ParentSectionOrganisationItem[]> {
  const result = await getOrganisationsWhichHaveLayers({
    q: query,
    prisms: adminCtx.appCtx.state.prisms,
    conditions: {
      isArchived: false,
      isPublished: null,
    },
    meta: { isAdminRequest: true, profile: 'admin' as const },
  })

  return (result.data ?? [])
    .map(item => toParentOrganisationItem(item as never))
    .filter(Boolean) as ParentSectionOrganisationItem[]
}

async function onSearchParentProjects(
  query: string,
): Promise<ParentSectionProjectItem[]> {
  const result = await getProjectsWhichHaveLayers({
    q: query,
    prisms: {
      ...adminCtx.appCtx.state.prisms,
      organisation: organisationIdValue ? [organisationIdValue] : [],
      project: [],
    },
    conditions: { isArchived: false, isPublished: null },
    meta: { isAdminRequest: true, profile: 'admin' as const },
  })

  return (result.data ?? [])
    .map(item => toParentProjectItem(item as never))
    .filter(Boolean) as ParentSectionProjectItem[]
}

async function onSearchParentLayers(query: string): Promise<ParentSectionLayerItem[]> {
  const result = await getLayers({
    q: query,
    prisms: {
      ...adminCtx.appCtx.state.prisms,
      organisation: organisationIdValue ? [organisationIdValue] : [],
      project: projectIdValue ? [projectIdValue] : [],
      layer: [],
    },
    conditions: { isArchived: false, isPublished: null },
    meta: { isAdminRequest: true, profile: 'admin' as const },
  })

  return (result.data ?? [])
    .map(item => toParentLayerItem(item as never))
    .filter(Boolean) as ParentSectionLayerItem[]
}

function onReplaceParentOrganisation(
  organisation: ParentSectionOrganisationItem,
): void {
  organisationReplaceOrganisationId = null
  organisationReplaceProjectId = null
  organisationReplaceLayerId = null
  syncSelectedOrganisation(organisation)

  applyFeatureParentSelection({
    organisationId: organisation.id,
    projectId: '',
    layerId: '',
  })
}

function onReplaceParentProject(project: ParentSectionProjectItem): void {
  projectReplaceProjectId = null
  projectReplaceLayerId = null
  syncSelectedProject(project)

  applyFeatureParentSelection({
    organisationId: project.organisationId ?? '',
    projectId: project.id,
    layerId: '',
  })
}

function onReplaceParentLayer(layer: ParentSectionLayerItem): void {
  layerReplaceLayerId = null
  syncSelectedLayer(layer)

  applyFeatureParentSelection({
    organisationId: layer.organisationId ?? '',
    projectId: layer.projectId ?? '',
    layerId: layer.id,
  })
}

async function getCreatableProjectRecords(
  params: { query?: string; organisationIds?: string[] } = {},
): Promise<Record<string, any>[]> {
  const result = await getProjectsWhichHaveLayers({
    q: params.query ?? '',
    prisms: {
      ...adminCtx.appCtx.state.prisms,
      organisation: params.organisationIds ?? [],
      project: [],
    },
    conditions: { isArchived: false, isPublished: null },
    meta: { isAdminRequest: true, profile: 'admin' as const },
  })

  return (result.data ?? []) as Record<string, any>[]
}

$effect(() => {
  if (!isNewFeatureRef) return
  if (organisationIdValue || projectIdValue) return

  let cancelled = false
  void getCreatableProjectRecords().then(async projects => {
    if (cancelled || organisationIdValue || projectIdValue) return

    if (projects.length === 1) {
      const project = toParentProjectItem(projects[0])
      if (project) {
        onReplaceParentOrganisation({
          id: project.organisationId,
          code: '',
          i18n: null,
          image: null,
        })
      }
      return
    }

    const organisationIds = Array.from(
      new Set(
        projects
          .map(project => project.organisationId)
          .filter(
            (organisationId): organisationId is string =>
              typeof organisationId === 'string' && organisationId.trim().length > 0,
          ),
      ),
    )

    if (organisationIds.length !== 1) return

    const organisation = await adminCtx.appCtx.getOrganisationById(organisationIds[0])
    if (cancelled || organisationIdValue || projectIdValue) return
    const item = toParentOrganisationItem(organisation as never)
    if (!item) return
    onReplaceParentOrganisation(item)
  })

  return () => {
    cancelled = true
  }
})

$effect(() => {
  if (!isNewFeatureRef) return
  if (!organisationIdValue || projectIdValue) return

  let cancelled = false
  void getCreatableProjectRecords({
    organisationIds: [organisationIdValue],
  }).then(projects => {
    if (cancelled || projectIdValue) return
    if (projects.length !== 1) return

    const project = toParentProjectItem(projects[0])
    if (!project) return
    onReplaceParentProject(project)
  })

  return () => {
    cancelled = true
  }
})

$effect(() => {
  if (!isNewFeatureRef) return
  if (!projectIdValue || layerIdValue) return

  let cancelled = false
  void getLayers({
    q: '',
    prisms: {
      ...adminCtx.appCtx.state.prisms,
      organisation: organisationIdValue ? [organisationIdValue] : [],
      project: [projectIdValue],
      layer: [],
    },
    conditions: { isArchived: false, isPublished: null },
    meta: { isAdminRequest: true, profile: 'admin' as const },
  }).then(result => {
    if (cancelled || layerIdValue) return

    const layers = (result.data ?? [])
      .map(item => toParentLayerItem(item as never))
      .filter(Boolean) as ParentSectionLayerItem[]

    if (layers.length !== 1) return
    onReplaceParentLayer(layers[0])
  })

  return () => {
    cancelled = true
  }
})

$effect(() => {
  if (activeFacet === 'images' && isNewFeatureRef) {
    adminCtx.setFacet('core', featureRef, FirstClassResource.feature)
  }
})

$effect(() => {
  let cancelled = false
  void Promise.all([refreshFeature(featureRef), refreshFeatureList()]).then(() => {
    if (cancelled) return
  })
  return () => {
    cancelled = true
  }
})

$effect(() => {
  if (!isNewFeatureRef) return
  if (headerCtrl.state.isEditing) return
  headerCtrl.setEditing(true)
})

$effect(() => {
  featureRef
  optimisticHeaderState = captureHeaderTransitionSnapshot(headerCtrl)
})

$effect(() => {
  const resolvedFacets = resolveOptimisticHeaderFacets(
    true,
    visibleFacetTabs,
    optimisticHeaderState,
  )
  const displayFacets = (
    Array.isArray(resolvedFacets)
      ? resolvedFacets
      : Array.from(resolvedFacets.entries()).map(([ref, config]) =>
          typeof config === 'string'
            ? { ref, label: config, icon: null, disabled: false }
            : {
                ref,
                label: config.label,
                icon: config.icon ?? null,
                hasIssues: config.hasIssues === true,
                disabled: false,
              },
        )
  ).map(facet => ({
    ...facet,
    disabled: facet.ref === 'fields' ? !hasSelectedLayer : Boolean(facet.disabled),
  }))

  const facetKey = displayFacets
    .map(
      facet =>
        `${facet.ref}:${facet.hasIssues === true ? '1' : '0'}:${facet.disabled === true ? '1' : '0'}`,
    )
    .join('|')
  const headerKey = `${featureRef}:${title}:${facetKey}`
  if (headerKey === lastHeaderKey) return
  lastHeaderKey = headerKey

  untrack(() => {
    headerCtrl.setHeaderForEntity(title, FeatureIcon, new Map())
    headerCtrl.setFacets(displayFacets)
  })
})

onMount(() => {
  untrack(() => {
    resourceEditorPage.wireHeaderHandlers({
      reset: () => onReset(),
      submit: () => onSubmit(),
      togglePublish: () => void onPublishToggle(),
      toggleDelete: () => void onDeleteToggle(),
    })
  })
})

$effect(() => {
  const status = resolveOptimisticHeaderStatus({
    isSettled: true,
    isImageFacetActive: isImagesFacet,
    isNewRef: isNewFeatureRef,
    dirty: Boolean(formCtx.dirty),
    isSubmitting: formCtx.submitting,
    hasIssues: (formCtx.allIssues?.length ?? 0) > 0,
    isPublished: Boolean(feature?.data?.isPublished),
    isDeleted: Boolean(feature?.data?.isArchived),
    canEdit: true,
    canPublish: !isNewFeatureRef,
    showDeleteAction: !isNewFeatureRef,
    showPublishAction: !isNewFeatureRef,
    snapshot: optimisticHeaderState,
  })

  lastFormActionsSignature = resourceEditorPage.syncHeaderStatus({
    headerCtrl,
    status: {
      ...status,
      onEditingToggle: (next?: boolean) => {
        headerCtrl.setEditing(Boolean(next))
      },
      onReset: () => onReset(),
      onSave: () => onSubmit(),
      onDeleteToggle: () => void onDeleteToggle(),
      onPublishToggle: () => void onPublishToggle(),
    },
    lastSignature: lastFormActionsSignature,
  })
})

async function handleFeatureStateToggle(
  field: 'isPublished' | 'isArchived',
): Promise<void> {
  const current = feature?.data
  if (!current) return

  const nextState = !current[field]
  const mutate = field === 'isPublished' ? publishFeature : archiveFeature
  const setBusy =
    field === 'isPublished'
      ? (value: boolean) => headerCtrl.setPublishing(value)
      : (value: boolean) => headerCtrl.setDeleting(value)

  try {
    setBusy(true)
    await mutate({
      id: current.id,
      state: nextState,
      meta: { isAdminRequest: true },
    }).updates(
      getFeature({
        ref: current.id,
        refKey: 'id',
        meta: { isAdminRequest: true, profile: 'admin' },
      }).withOverride(overrideFeatureEntityBoolean(field, nextState)),
      getFeatures({
        conditions: adminCtx.appCtx.isSuperAdmin()
          ? { isArchived: null, isPublished: null }
          : { isArchived: false, isPublished: null },
        prisms: adminCtx.appCtx.state.prisms,
        meta: { isAdminRequest: true, profile: 'card' },
      }).withOverride(overrideFeatureListItemBoolean(current.id, field, nextState)),
    )

    commitFeatureState(await refreshFeature())
    toast.success(
      `${
        nextState
          ? field === 'isPublished'
            ? m.published()
            : m.bad_swift_cheetah_surge()
          : field === 'isPublished'
            ? m.forms__unpublished()
            : m.forms__restored()
      } ${getNameForToast(feature, 'title')}`,
    )
  } catch {
    toast.error(m.long_crazy_peacock_care())
  } finally {
    setBusy(false)
  }
}

async function onPublishToggle(): Promise<void> {
  if (isNewFeatureRef) return
  await handleFeatureStateToggle('isPublished')
}

async function onDeleteToggle(): Promise<void> {
  if (isNewFeatureRef) return
  await handleFeatureStateToggle('isArchived')
}

function onSubmit(): void {
  formCtx.requestSubmit({
    meta: {
      ...(currentFormValue.meta ?? {}),
      mode: isNewFeatureRef ? 'create' : 'update',
      isAdminRequest: true,
    },
  })
}

function onReset(): void {
  formCtx.clearSubmitAttemptState()
  const resetValue = committedFeature?.data
    ? toFeatureFormInput(committedFeature.data, parentLayerId)
    : emptyFeatureFormSeed
  featureFormSource = resetValue
  formCtx.form.fields.set(resetValue)
}

function getVisualInfoTitle(): string {
  return m.feature__map()
}

function handleFeatureStepperNavigation(direction: 'previous' | 'next'): void {
  const targetRef = direction === 'previous' ? previousFeatureRef : nextFeatureRef
  if (!targetRef) return
  if (targetRef === featureRef) return

  const href = getUrlForResource(
    adminCtx,
    FirstClassResource.feature,
    targetRef,
    activeFacet === 'images' && isNewFeatureRef ? 'core' : activeFacet,
  )
  if (!href) return

  adminCtx.setFacet(activeFacet, targetRef, FirstClassResource.feature)
  void goto(href, {
    noScroll: true,
    keepFocus: true,
    replaceState: false,
  })
}
</script>

<Main.Root class="bits-feature-editor">
  <Main.Form
    attrs={formCtx.attributes}
    isReady={true}
    class="bits-feature-editor__form"
  >
    {#if showsVisualSection}
      <Main.VisualSection
        class="bits-feature-editor__visual"
        isCollapsed={isVisualSectionCollapsed}
        imageAspectRatio={resolvedCanonicalImageAspectRatio}
      >
        {#snippet leftControls()}
          <UserAttributionCard
            userId={currentFeatureData.contributorId ?? feature?.data?.contributorId ?? null}
            date={currentFeatureData.createdAt ?? feature?.data?.createdAt ?? undefined}
            type="contributor"
          />
        {/snippet}

        {#snippet centerControls()}
          <div class="bits-feature-visual__control-bar">
            <div class="bits-feature-visual__toggle-control">
              <SwapField
                class="bits-feature-visual__switch bits-feature-visual__switch--icon-only"
                checked={Boolean(currentFeatureData.isIntangible)}
                label={m.feature__intangible()}
                onCheckedChange={checked => {
                  updateFeatureData(data => ({
                    ...data,
                    isIntangible: checked,
                  }))
                }}
              />
            </div>
            <div class="bits-feature-visual__toggle-control">
              <SwapField
                class="bits-feature-visual__switch bits-feature-visual__switch--icon-only"
                checked={Boolean(currentFeatureData.isVisitable)}
                label="Visitable"
                onCheckedChange={checked => {
                  updateFeatureData(data => ({
                    ...data,
                    isVisitable: checked,
                  }))
                }}
              />
            </div>
            <Separator
              orientation="vertical"
              class="bits-feature-visual__control-separator"
            />
            <InfoDialog
              title={getVisualInfoTitle()}
              triggerText=""
              triggerIconComponent={CircleHelpIcon}
            >
              <section>
                <h3 class="bits-feature-info__heading">{m.feature__intangible()}</h3>
                <p>{@html m.home_legal_trout_hurl()}</p>
              </section>
            </InfoDialog>
            <button
              type="button"
              class="bits-feature-visual__icon-button bits-feature-visual__icon-button--collapse bits-feature-visual__icon-button--collapse-tight"
              aria-label={isVisualSectionCollapsed
                  ? m.admin__forms_common_expand()
                  : m.admin__forms_common_collapse()}
              onclick={() => {
                isVisualSectionCollapsed = !isVisualSectionCollapsed
              }}
            >
              {#if isVisualSectionCollapsed}
                <ExpandIcon />
              {:else}
                <ShrinkIcon />
              {/if}
            </button>
          </div>
        {/snippet}

        {#snippet rightControls()}
          <div class="bits-feature-visual__control-bar">
            <button
              type="button"
              class="bits-feature-visual__icon-button"
              aria-label="Previous feature"
              disabled={!previousFeatureRef}
              onclick={() => {
                handleFeatureStepperNavigation('previous')
              }}
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              class="bits-feature-visual__icon-button"
              aria-label="Next feature"
              disabled={!nextFeatureRef}
              onclick={() => {
                handleFeatureStepperNavigation('next')
              }}
            >
              <ChevronRightIcon />
            </button>
          </div>
        {/snippet}

        {#snippet map()}
          <Main.VisualSectionMap>
            <FormMapSection
              class="bits-feature-visual__map-surface"
              initialCenter={initialMapCenter}
              coordinates={featureCoordinates ?? [114.1693671540923, 22.319307515052614]}
              addressMeta={currentFeatureData.addressMeta ?? null}
              draggable={!isEditing}
              onCoordinateChange={handleCoordinateChange}
            />
          </Main.VisualSectionMap>
        {/snippet}

        {#snippet image()}
          <Main.VisualSectionImage>
            <a
              class="bits-feature-visual-media bits-feature-visual__image-surface"
              href={presentedCanonicalImageHref}
            >
              {#if presentedCanonicalImageSrc}
                <img
                  class={[
                    'bits-feature-visual-media__img',
                    isCanonicalImagePending ? 'bits-feature-visual-media__img--pending' : '',
                  ].filter(Boolean).join(' ')}
                  src={presentedCanonicalImageSrc}
                  alt={presentedCanonicalImageTitle}
                >
              {:else}
                <div class="bits-feature-visual-media__empty">
                  <div>
                    <ImageIcon />
                    <p>
                      {isNewFeatureRef ? 'Save the feature to add images' : 'No canonical image yet'}
                    </p>
                  </div>
                </div>
              {/if}
            </a>
          </Main.VisualSectionImage>
        {/snippet}
      </Main.VisualSection>
    {/if}

    <Main.Section
      isVisible={isCoreFacet}
      transition="fade"
      class={showsVisualSection ? visualSectionClass : sectionClass}
      attrs={{ 'data-facet-id': 'core' }}
    >
      {#if isCoreFacet}
        <div class="bits-feature-editor__content-pad">
          <FormI18nSection
            class="bits-feature-editor__content-section mt-4"
            {locales}
            {isEditing}
          >
            {#snippet center()}
              <FormFeatureSectionHeader
                title={m.admin__forms_common_descriptors()}
                subtitle={m.feature__descriptor_subtitle()}
                issues={formLevelIssues}
              />
            {/snippet}

            {#snippet children(locale)}
              <FormI18nDescriptorFields
                form={formCtx.form}
                fields={formCtx.form.fields.data.i18n[locale]}
                {locale}
                {isEditing}
                fieldConfigs={featureDescriptorFieldConfigs as never}
                {isRequiredInPreflight}
              />
            {/snippet}
          </FormI18nSection>

          <FormFeatureParentSection
            class="bits-feature-editor__content-section bits-feature-editor__collections-section"
            {isEditing}
            onClearAll={resetFeatureParents}
            sharedSectionProps={{
              isEditing,
              isSubmitting: formCtx.submitting,
              isSubmitRequested: formCtx.isSubmitRequested,
            }}
            organisationSection={{
              issues: organisationIssues,
              parent: selectedOrganisation as any,
              hiddenOrganisationInputAttrs,
              startInAddingMode: organisationIdValue.length === 0,
              searchScopeKey: 'organisation',
              onBeginReplaceParent: beginReplaceParentOrganisation,
              onCancelReplaceParent: cancelReplaceParentOrganisation,
              onSearchOrganisations: onSearchParentOrganisations,
              onReplaceParent: onReplaceParentOrganisation,
            }}
            projectSection={{
              issues: projectIssues,
              parent: selectedProject as any,
              hiddenProjectInputAttrs,
              startInAddingMode: projectIdValue.length === 0,
              searchScopeKey: organisationIdValue,
              onBeginReplaceParent: beginReplaceParentProject,
              onCancelReplaceParent: cancelReplaceParentProject,
              onSearchProjects: onSearchParentProjects,
              onReplaceParent: onReplaceParentProject,
            }}
            layerSection={{
              issues: layerIssues,
              parent: selectedLayer as any,
              hiddenLayerInputAttrs,
              startInAddingMode: layerIdValue.length === 0,
              searchScopeKey: `${organisationIdValue}:${projectIdValue}`,
              onBeginReplaceParent: beginReplaceParentLayer,
              onCancelReplaceParent: cancelReplaceParentLayer,
              onSearchLayers: onSearchParentLayers,
              onReplaceParent: onReplaceParentLayer,
            }}
          />

          <FormFacetNav
            previousAction={buildFacetNavAction('core', 'previous')}
            nextAction={buildFacetNavAction('core', 'next')}
          />
        </div>
      {/if}
    </Main.Section>

    <Main.Section
      isVisible={isFieldsFacet}
      transition="fade"
      class={showsVisualSection ? visualSectionClass : sectionClass}
      attrs={{ 'data-facet-id': 'fields' }}
    >
      {#if isFieldsFacet}
        <div class="bits-feature-editor__content-pad">
          {#if nonTranslatableItems.length > 0}
            <div class="pt-4">
              <FormFeatureSectionHeader
                title={m.feature__fields_title()}
                subtitle={m.feature__fields_subtitle()}
                issues={[]}
              />
            </div>
            <FormFeatureFieldsSection
              class="bits-feature-editor__content-section bits-feature-editor__fields-section"
              {localeKey}
              items={nonTranslatableItems}
              {isEditing}
            />
          {/if}

          {#if translatableSpecifierItems.length > 0}
            <section
              class="bits-form__i18n-section bits-feature-editor__content-section bits-feature-editor__fields-section bits-feature-editor__translatable-fields"
            >
              <FormFeatureSectionHeader
                title={m.feature__translatable_fields_title()}
                subtitle={m.feature__translatable_fields_subtitle()}
                issues={[]}
              />

              <div class="bits-feature-editor__translatable-card-grid">
                {#each locales as locale (locale)}
                  <FormI18nSectionFormSection
                    {locale}
                    cardClass="bits-form__i18n-card bits-feature-editor__translatable-card"
                    onTranslate={onTranslateTranslatableValues}
                    onResetLocale={onResetTranslatableValues}
                    sectionKey="feature-translatable-values"
                    {isEditing}
                    showTranslationBar={true}
                  >
                    {#snippet children(locale)}
                      <div class="flex flex-col gap-4">
                        {#each translatableSpecifierItems as property (property.propertyId)}
                          {@const label = ((property.property?.i18n?.[locale] as { label?: string } | undefined)?.label ?? (property.property?.i18n?.en as { label?: string } | undefined)?.label ?? property.property?.key ?? property.propertyId) as string}
                          {@const currentValue = property.i18n?.[locale]?.value ?? ''}
                          {@const isTextarea = property.property?.component === 'TextareaField'}

                          {#if isTextarea}
                            <TextArea
                              {label}
                              value={currentValue}
                              {locale}
                              isTranslated={locale !== getLocaleKey()}
                              isGenAI={Boolean(property.i18n?.[locale]?.valueGen)}
                              {isEditing}
                              onToggleGenAI={() =>
                                togglePropertyI18nValueGen(property.propertyId, locale)}
                              onValueChange={nextValue =>
                                updatePropertyI18nValue(property.propertyId, locale, nextValue)}
                            />
                          {:else}
                            <TextInput
                              {label}
                              value={currentValue}
                              {locale}
                              isTranslated={locale !== getLocaleKey()}
                              isGenAI={Boolean(property.i18n?.[locale]?.valueGen)}
                              {isEditing}
                              onToggleGenAI={() =>
                                togglePropertyI18nValueGen(property.propertyId, locale)}
                              onValueChange={nextValue =>
                                updatePropertyI18nValue(property.propertyId, locale, nextValue)}
                            />
                          {/if}
                        {/each}
                      </div>
                    {/snippet}
                  </FormI18nSectionFormSection>
                {/each}
              </div>
            </section>
          {/if}

          <FormFacetNav
            previousAction={buildFacetNavAction('fields', 'previous')}
            nextAction={buildFacetNavAction('fields', 'next')}
          />
        </div>
      {/if}
    </Main.Section>

    <Main.Section
      isVisible={isAddressFacet}
      transition="fade"
      class={sectionClass}
      attrs={{ 'data-facet-id': 'address' }}
    >
      <div class="bits-feature-facet-placeholder">
        <p>Address facet shell restored.</p>
        <FormFacetNav
          previousAction={buildFacetNavAction('address', 'previous')}
          nextAction={buildFacetNavAction('address', 'next')}
        />
      </div>
    </Main.Section>

    <Main.Section
      isVisible={isImagesFacet && !isNewFeatureRef}
      transition="fade"
      class={sectionClass}
      attrs={{ 'data-facet-id': 'images' }}
    >
      <div class="bits-feature-facet-placeholder">
        <p>
          {isNewFeatureRef ? 'Images are available after the feature is created.' : 'Image controls will be restored next.'}
        </p>
        <FormFacetNav
          previousAction={buildFacetNavAction('images', 'previous')}
          nextAction={buildFacetNavAction('images', 'next')}
        />
      </div>
    </Main.Section>
  </Main.Form>
</Main.Root>
