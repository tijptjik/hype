<script lang="ts">
// SVELTE
import { fade, scale } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getAppCtx } from '$lib/context/app.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// SERVICES
import { uploadAndProcessImage } from '$lib/client/services/image'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import { Photo, CheckCircle, XCircle, CloudArrowUp } from '@steeze-ui/heroicons'
import ImageUp from 'virtual:icons/lucide/image-up'
import Dropzone from 'svelte-file-dropzone'
// ENUMS
import { FirstClassResource, ImageContextResource } from '$lib/enums'
// TYPES
import type {
  Image,
  ImageUploadCtx,
  Feature,
  Layer,
  Project,
  Organisation,
} from '$lib/types'

type BatchUploadResult = {
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  savedImage?: Image
  error?: string
  featureId?: string | null
}

// CONTEXT
const adminCtx = getAdminCtx()
const appCtx = getAppCtx()
const headerCtrl = getHeaderCtrl()

// Set the active resource to something appropriate for admin context
adminCtx.setFacet(false, false, FirstClassResource.feature)
headerCtrl.setHeaderForStandAlone(m.admin__batch_image_upload(), ImageUp, {
  showNew: false,
  showFilter: false,
  showViewActions: false,
  showLayoutToggle: false,
  showControlsToggle: false,
})

// STATE
let uploadResults: BatchUploadResult[] = $state([])
let isUploading = $state(false)
let currentBatch = $state(0)
let totalBatches = $state(0)

// Extract feature ID from filename
function extractFeatureIdFromFilename(filename: string): string | null {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')

  // Validate the feature ID exists in our resources
  const feature = appCtx.getFeatureById(nameWithoutExt)
  if (!feature) {
    console.warn(`No matching feature found for ID: ${nameWithoutExt}`)
    return null
  }

  return nameWithoutExt
}

// Define the context type
type FeatureContext = {
  feature: Feature
  layer: Layer
  project: Project
  organisation: Organisation
  layerId: string
  projectId: string
  organisationId: string
}

// Get context for a feature ID
async function getContextForFeature(featureId: string): Promise<FeatureContext | null> {
  try {
    const feature = await appCtx.getFeatureById(featureId)
    if (!feature) {
      console.error(`Feature not found for ID: ${featureId}`)
      return null
    }

    const { layer, project, organisation } = await appCtx.getHierarchy(feature)

    if (!layer || !project || !organisation) {
      console.error(`Missing hierarchy for feature ${featureId}:`, {
        layer,
        project,
        organisation,
      })
      return null
    }

    return {
      feature,
      layer,
      project,
      organisation,
      layerId: layer.id,
      projectId: project.id,
      organisationId: organisation.id,
    }
  } catch (error) {
    console.error(`Error getting context for feature ${featureId}:`, error)
    return null
  }
}

// Create upload context for feature
async function createUploadContextForFeature(
  featureId: string,
  context: FeatureContext,
): Promise<ImageUploadCtx | null> {
  try {
    const uploadCtx: ImageUploadCtx = {
      ctxType: ImageContextResource.feature,
      ctxId: featureId,
      organisation: context.organisation,
      project: context.project,
    }

    return uploadCtx
  } catch (error) {
    console.error(`Error creating upload context for feature ${featureId}:`, error)
    return null
  }
}

// Handle file drop
async function handleDrop(e: CustomEvent) {
  const acceptedFiles: File[] = e.detail.acceptedFiles
  const fileRejections: any[] = e.detail.fileRejections

  if (fileRejections.length > 0) {
    console.warn('Some files were rejected:', fileRejections)
  }

  if (acceptedFiles.length === 0) return

  // Initialize upload results
  uploadResults = acceptedFiles.map(file => ({
    file,
    status: 'pending' as const,
    featureId: extractFeatureIdFromFilename(file.name),
  }))

  // Process in batches of 10
  const batchSize = 10
  totalBatches = Math.ceil(uploadResults.length / batchSize)

  isUploading = true

  for (let i = 0; i < uploadResults.length; i += batchSize) {
    currentBatch = Math.floor(i / batchSize) + 1
    const batch = uploadResults.slice(i, i + batchSize)

    // Process batch in parallel
    await Promise.allSettled(
      batch.map(async (result, index) => {
        const globalIndex = i + index
        await processSingleUpload(result, globalIndex)
      }),
    )
  }

  isUploading = false

  const successful = uploadResults.filter(r => r.status === 'success').length
  const failed = uploadResults.filter(r => r.status === 'error').length
}

// Process a single upload
async function processSingleUpload(result: BatchUploadResult, index: number) {
  if (!result.featureId) {
    uploadResults[index] = {
      ...result,
      status: 'error',
      error: m.error_message__failed_to_extract_feature_id_from_image(),
    }
    console.error(
      `Error for ${result.file.name}:`,
      m.error_message__failed_to_extract_feature_id_from_image(),
    )
    return
  }

  const context = await getContextForFeature(result.featureId)
  if (!context) {
    uploadResults[index] = {
      ...result,
      status: 'error',
      error: `Feature not found or missing hierarchy for ID: ${result.featureId}`,
    }
    console.error(
      `Error for ${result.file.name}:`,
      `Feature not found or missing hierarchy for ID: ${result.featureId}`,
    )
    return
  }

  const uploadCtx = await createUploadContextForFeature(result.featureId, context)
  if (!uploadCtx) {
    uploadResults[index] = {
      ...result,
      status: 'error',
      error: 'Could not create upload context',
    }
    console.error(`Error for ${result.file.name}:`, 'Could not create upload context')
    return
  }

  try {
    uploadResults[index] = { ...result, status: 'uploading' }

    const savedImage = await uploadAndProcessImage(result.file, uploadCtx, {
      isPublished: true,
      intent: 'canonical',
    })

    uploadResults[index] = {
      ...result,
      status: 'success',
      savedImage,
    }
    // Refresh the features in resource state
    adminCtx.invalidateAndRefresh(FirstClassResource.feature)
  } catch (error) {
    uploadResults[index] = {
      ...result,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }

    console.error(`Error for ${result.file.name}:`, error)
  }
}

let successCount = $derived(uploadResults.filter(r => r.status === 'success').length)
let errorCount = $derived(uploadResults.filter(r => r.status === 'error').length)
let uploadingCount = $derived(
  uploadResults.filter(r => r.status === 'uploading').length,
)
let pendingCount = $derived(uploadResults.filter(r => r.status === 'pending').length)
</script>

<div class="h-full p-6">
  <div class="flex items-center gap-4">
    <h3 class=" text-xl font-bold uppercase">
      {m.admin__batch_image_upload()}
      <small
        class="case hidden select-text pr-3 text-sm normal-case text-base-content/70 @sm:block"
        >{m.caring_aloof_haddock_bubble()}</small
      >
    </h3>
  </div>

  <div class="flex h-full flex-col gap-6 overflow-y-auto p-6">
    <!-- Dropzone -->
    <div class="flex-1">
      <Dropzone
        accept={['image/*']}
        on:drop={handleDrop}
        on:select={handleDrop}
        multiple={true}
        class="flex h-64 w-full flex-col justify-center gap-4 rounded-xl border-2 border-dashed border-base-content/20 bg-glass-300/30 text-center transition-colors hover:border-primary hover:bg-base-200/50"
        disableDefaultStyles={true}
        disabled={isUploading}
      >
        <Icon src={CloudArrowUp} class="mx-auto h-12 w-12 text-base-content/50" />
        <div class="space-y-2">
          <p class="text-lg font-medium">{m.maroon_teary_warbler_nourish()}</p>
          <p class="text-sm text-base-content/70">{m.teal_dizzy_finch_file()}</p>
          {#if isUploading}
            <p class="text-sm text-warning">
              {m.flat_close_slug_bubble()}
              {currentBatch}
              / {totalBatches}...
            </p>
          {/if}
        </div>
      </Dropzone>
    </div>

    <!-- Progress Summary -->
    {#if uploadResults.length > 0}
      <div class="flex-none" in:fade={{ duration: 300 }}>
        <div class="card bg-glass-result">
          <div class="card-body">
            <h3 class="card-title text-lg">{m.batch_upload__progress()}</h3>
            <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div class="stat">
                <div class="stat-title">{m.batch_upload__success()}</div>
                <div class="stat-value text-glass-accepted">{successCount}</div>
              </div>
              <div class="stat">
                <div class="stat-title">{m.batch_upload__errors()}</div>
                <div class="stat-value text-glass-rejected">{errorCount}</div>
              </div>
              <div class="stat">
                <div class="stat-title">{m.batch_upload__uploading()}</div>
                <div class="stat-value text-glass-100">{uploadingCount}</div>
              </div>
              <div class="stat">
                <div class="stat-title">{m.batch_upload__pending()}</div>
                <div class="stat-value text-glass-100">{pendingCount}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Upload Results -->
    {#if uploadResults.length > 0}
      <div class="flex-1" in:fade={{ duration: 300, delay: 200 }}>
        <h3 class="mb-4 text-lg font-medium">{m.batch_upload__results()}</h3>
        <div class="space-y-2">
          {#each uploadResults as result, index (result.file.name)}
            <div
              class="flex items-center justify-between rounded-lg border border-primary bg-glass-result p-4"
              in:scale={{ duration: 200, delay: index * 50 }}
            >
              <div class="flex items-center space-x-3">
                <!-- Status Icon -->
                {#if result.status === 'success'}
                  <Icon src={CheckCircle} class="h-5 w-5 text-glass-accepted" />
                {:else if result.status === 'error'}
                  <Icon src={XCircle} class="h-5 w-5 text-glass-rejected" />
                {:else if result.status === 'uploading'}
                  <span class="loading loading-ring loading-sm text-warning"></span>
                {:else}
                  <Icon src={Photo} class="h-5 w-5 text-base-content/50" />
                {/if}

                <!-- File Info -->
                <div>
                  <div class="font-medium">{result.file.name}</div>
                  <div class="text-sm text-base-content/70">
                    {m.batch_upload__feature_id()}: {result.featureId || 'Not found'}
                  </div>
                  {#if result.error}
                    <div class="text-sm text-error">{result.error}</div>
                  {/if}
                </div>
              </div>

              <!-- Status Badge -->
              <div
                class="badge {result.status === 'success'
                  ? 'badge-success'
                  : result.status === 'error'
                    ? 'badge-error'
                    : result.status === 'uploading'
                      ? 'badge-warning'
                      : 'badge-ghost'}"
              >
                {result.status}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
