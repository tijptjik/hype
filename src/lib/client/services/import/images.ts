// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 0. QUEUE RESULT FACTORIES
// - createUploadResultId
// - createPendingUploadResult
// - parseSequenceNumber
// - assignIntendedIntents
// - emitUploadResults
//
// 1. FILENAME PARSING AND EXPORT
// - parseImageFilename
// - extractFeatureIdFromFilename
// - downloadImageUploadResults
//
// 2. FEATURE CONTEXT RESOLUTION
// - getContextsForFeatures
// - enrichUploadResultsWithContexts
//
// 3. UPLOAD INTENT RESOLUTION
// - findLikelyDuplicateImage
// - resolveUploadIntent
// - createUploadContextForFeature
//
// 4. UPLOAD PROCESSING
// - processSingleUpload
//
// 5. DROP ORCHESTRATION
// - handleImageDropEvent
// - handleImageDrop
// ---

import { getFeatureForImport } from '$lib/api/server/feature.remote'
import { getFeatureCanonicalImageOccupancy } from '$lib/api/server/image.remote'
import { getOrganisation } from '$lib/api/server/organisation.remote'
import { getProject } from '$lib/api/server/project.remote'
import {
  calculateImageContentHash,
  uploadAndProcessImage,
} from '$lib/client/services/image'
import type { AdminCtx } from '$lib/context/admin.svelte'
import { FirstClassResource, ImageContextResource } from '$lib/enums'
import { normalizeUploadFileForAssetPipeline } from '$lib/images/upload'
import type {
  Feature,
  BatchUploadResult,
  Organisation,
  Project,
  ImageDropEvent,
  ParsedImageFilename,
  FeatureContext,
} from '$lib/client/services/import/types'
import type { ImageCtxEnvelope, ImageUploadCtx } from '$lib/db/zod/schema/image.types'
import type { Intent } from '$lib/db/zod/schema/image.types'

/********************
 *  0. QUEUE RESULT FACTORIES
 ************/
// +++ Queue Result Factories

/**
 * Create a stable queue item key so Svelte keyed lists remain valid during updates.
 *
 * @param file - Queued upload file.
 * @param index - Original file order in the drop/select batch.
 * @returns Stable upload result identifier.
 */
function createUploadResultId(file: File, index: number): string {
  return `${file.name}-${file.lastModified}-${file.size}-${index}`
}

/**
 * Create the initial pending result for a queued image upload.
 *
 * @param file - Queued upload file.
 * @param index - Original file order in the drop/select batch.
 * @returns Pending upload result with filename-derived feature metadata.
 */
function createPendingUploadResult(file: File, index: number): BatchUploadResult {
  const parsedFilename = parseImageFilename(file.name)

  return {
    id: createUploadResultId(file, index),
    file,
    status: 'pending',
    featureId: parsedFilename.featureId,
    imageSequence: parsedFilename.imageSequence,
  }
}

/**
 * Parse a filename sequence segment into a sortable number.
 *
 * @param imageSequence - Sequence value parsed from a filename.
 * @returns Numeric sequence, or `null` when no sequence is available.
 */
function parseSequenceNumber(imageSequence: string | null | undefined): number | null {
  if (!imageSequence) return null
  const parsed = Number.parseInt(imageSequence, 10)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Resolve the intended image intent per feature before uploads start.
 *
 * @param uploadResults - Pending upload results for a single drop/select batch.
 * @returns Upload results with canonical/undefined intent assigned per feature.
 * @remarks When multiple files target the same feature, the lowest numeric sequence
 * becomes the canonical candidate and the rest are uploaded as secondary images.
 */
function assignIntendedIntents(
  uploadResults: BatchUploadResult[],
): BatchUploadResult[] {
  const resultsWithIntent = uploadResults.map(result => ({
    ...result,
    intendedIntent: 'canonical' as Intent,
  }))
  const resultsByFeature = new Map<string, BatchUploadResult[]>()

  for (const result of resultsWithIntent) {
    if (!result.featureId) continue
    const current = resultsByFeature.get(result.featureId) ?? []
    current.push(result)
    resultsByFeature.set(result.featureId, current)
  }

  for (const [featureId, results] of resultsByFeature) {
    if (results.length === 1) {
      continue
    }

    const sorted = [...results].sort((left, right) => {
      const leftSequence = parseSequenceNumber(left.imageSequence)
      const rightSequence = parseSequenceNumber(right.imageSequence)

      if (leftSequence !== null && rightSequence !== null) {
        return leftSequence - rightSequence
      }
      if (leftSequence !== null) return -1
      if (rightSequence !== null) return 1
      return (
        uploadResults.findIndex(item => item.id === left.id) -
        uploadResults.findIndex(item => item.id === right.id)
      )
    })

    const canonicalResultId = sorted[0]?.id
    if (!canonicalResultId) continue

    resultsByFeature.set(
      featureId,
      results.map(result => ({
        ...result,
        intendedIntent: result.id === canonicalResultId ? 'canonical' : 'undefined',
      })),
    )
  }

  const resolvedById = new Map(
    [...resultsByFeature.values()].flat().map(result => [result.id, result]),
  )

  return resultsWithIntent.map(result => resolvedById.get(result.id) ?? result)
}

/**
 * Emit a cloned queue array so state updates propagate consistently to the UI.
 *
 * @param uploadResults - Mutable upload queue state.
 * @param updateResults - UI callback for receiving immutable queue snapshots.
 * @returns Nothing.
 */
function emitUploadResults(
  uploadResults: BatchUploadResult[],
  updateResults: (results: BatchUploadResult[]) => void,
): void {
  updateResults([...uploadResults])
}

// ---

/********************
 *  1. FILENAME PARSING AND EXPORT
 ************/
// +++ Filename Parsing And Export

/**
 * Feature ID length used by every resource schema (`nanoid(12)`).
 *
 * Used by {@link parseImageFilename} to disambiguate a trailing `-<digits>`
 * sequence suffix from a hyphen that is genuinely part of a feature ID.
 */
const FEATURE_ID_LENGTH = 12

/**
 * Parse an uploaded filename using the `featureId<sep>sequence.ext` convention.
 *
 * Separator rules, in priority order:
 *
 * 1. `.` is always treated as a sequence separator when followed by digits —
 *    nanoid feature IDs never contain `.`, so this split is unambiguous.
 * 2. `-` is treated as a sequence separator only when the preceding segment is
 *    exactly {@link FEATURE_ID_LENGTH} characters long. nanoid feature IDs can
 *    contain `-` followed by digits (e.g. `abc-123`), so a bare `-<digits>`
 *    suffix is ambiguous; requiring the leading segment to be a full-length
 *    feature ID prevents truncating valid IDs like `abc-123.jpg` while still
 *    recognising explicit sequences like `0Gd7fU4rEvRM-00.webp`.
 *
 * @param filename Uploaded file name.
 * @returns Parsed feature and sequence values, or `null` parts when they cannot be derived.
 */
export function parseImageFilename(filename: string): ParsedImageFilename {
  // Remove file extension.
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')
  const trimmedName = nameWithoutExt.trim()

  if (!trimmedName) {
    return {
      featureId: null,
      imageSequence: null,
    }
  }

  // Dot separator: unambiguous because nanoid IDs never contain `.`.
  const dotMatch = trimmedName.match(/^(.+)\.(\d+)$/)
  if (dotMatch) {
    const featureId = dotMatch[1].trim()
    const imageSequence = dotMatch[2].trim()
    return {
      featureId: featureId || null,
      imageSequence: imageSequence || null,
    }
  }

  // Dash separator: only treat the trailing `-<digits>` as a sequence when the
  // preceding segment is a full-length feature ID. This keeps hyphenated IDs
  // such as `abc-123` intact while still splitting `0Gd7fU4rEvRM-00`.
  const dashMatch = trimmedName.match(/^(.+)-(\d+)$/)
  if (dashMatch && dashMatch[1].length === FEATURE_ID_LENGTH) {
    const featureId = dashMatch[1].trim()
    const imageSequence = dashMatch[2].trim()
    return {
      featureId: featureId || null,
      imageSequence: imageSequence || null,
    }
  }

  return {
    featureId: trimmedName,
    imageSequence: null,
  }
}

/**
 * Derive a feature ID from an uploaded filename.
 *
 * @param filename Uploaded file name.
 * @returns The extracted feature ID, or `null` when the filename does not contain one.
 */
export function extractFeatureIdFromFilename(filename: string): string | null {
  return parseImageFilename(filename).featureId
}

/**
 * Downloads image import results as a JSON file for review or audit.
 *
 * @param uploadResults - Current image upload queue results.
 * @returns Nothing.
 * @remarks This helper is browser-only because it creates an object URL and
 * programmatically clicks a temporary anchor element.
 */
export function downloadImageUploadResults(uploadResults: BatchUploadResult[]): void {
  const exportPayload = uploadResults.map(result => ({
    id: result.id,
    fileName: result.file.name,
    fileSize: result.file.size,
    mimeType: result.file.type,
    featureId: result.featureId ?? null,
    imageSequence: result.imageSequence ?? null,
    intendedIntent: result.intendedIntent ?? null,
    status: result.status,
    error: result.error ?? null,
    existingCanonicalImageId: result.existingCanonicalImage?.image.id ?? null,
    savedImageId: result.savedImage?.image.id ?? null,
    savedImage: result.savedImage ?? null,
  }))

  // Create a temporary object URL so the browser can save the JSON payload.
  const file = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')

  link.href = url
  link.download = `image-upload-results-${new Date().toISOString()}.json`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// ---

/********************
 *  2. FEATURE CONTEXT RESOLUTION
 ************/
// +++ Feature Context Resolution

/**
 * Fetch feature-scoped upload contexts in batches using admin-safe remotes.
 *
 * @param featureIds Unique feature identifiers derived from filenames.
 * @returns A map of resolved upload contexts keyed by feature id.
 * @remarks This prefetch keeps upload processing deterministic by resolving
 * feature hierarchy and canonical image state before batch uploads begin.
 */
export async function getContextsForFeatures(
  featureIds: string[],
): Promise<Map<string, FeatureContext>> {
  const contexts = new Map<string, FeatureContext>()
  const uniqueFeatureIds = [...new Set(featureIds.filter(Boolean))]

  if (uniqueFeatureIds.length === 0) {
    return contexts
  }

  const chunkSize = 100

  for (let index = 0; index < uniqueFeatureIds.length; index += chunkSize) {
    const chunk = uniqueFeatureIds.slice(index, index + chunkSize)
    const featureResponses = await Promise.all(
      chunk.map(id => getFeatureForImport({ id, meta: { isAdminRequest: true } })),
    )

    const features = featureResponses
      .map(response => response.data as Feature | null | undefined)
      .filter((feature): feature is Feature => Boolean(feature))

    const projectIds = [
      ...new Set(features.map(feature => feature.projectId).filter(Boolean)),
    ]
    const organisationIds = [
      ...new Set(features.map(feature => feature.organisationId).filter(Boolean)),
    ]

    const [projectResponses, organisationResponses] = await Promise.all([
      Promise.all(
        projectIds.map(id =>
          getProject({
            ref: id,
            refKey: 'id',
            meta: { isAdminRequest: true, profile: 'admin' },
          }),
        ),
      ),
      Promise.all(
        organisationIds.map(id =>
          getOrganisation({
            ref: id,
            refKey: 'id',
            meta: { isAdminRequest: true, profile: 'admin' },
          }),
        ),
      ),
    ])

    const projectsById = new Map(
      projectResponses
        .map(response => response.data as Project | null | undefined)
        .filter((project): project is Project => Boolean(project))
        .map(project => [project.id, project]),
    )
    const organisationsById = new Map(
      organisationResponses
        .map(response => response.data as Organisation | null | undefined)
        .filter((organisation): organisation is Organisation => Boolean(organisation))
        .map(organisation => [organisation.id, organisation]),
    )
    const canonicalOccupancyResponse =
      chunk.length > 0
        ? await getFeatureCanonicalImageOccupancy({
            featureIds: chunk,
            meta: { isAdminRequest: true },
          })
        : { data: [] }
    const canonicalFeatureIds = new Set(canonicalOccupancyResponse.data)

    for (const feature of features) {
      const project = projectsById.get(feature.projectId)
      const organisation = organisationsById.get(feature.organisationId)
      const existingCanonicalImage =
        (feature.images?.find(image => image.intent === 'canonical') as
          | ImageCtxEnvelope
          | undefined) ?? null
      const existingImages = (feature.images ?? []) as ImageCtxEnvelope[]

      if (!project || !organisation) {
        console.error(`Missing hierarchy for feature ${feature.id}:`, {
          project,
          organisation,
        })
        continue
      }

      contexts.set(feature.id, {
        feature,
        project,
        organisation,
        projectId: project.id,
        organisationId: organisation.id,
        existingCanonicalImage,
        hasCanonicalImage: canonicalFeatureIds.has(feature.id),
        existingImages,
      })
    }
  }

  return contexts
}

/**
 * Attach upload contexts and canonical-image metadata to each queued result.
 *
 * @param uploadResults - Upload queue items to enrich.
 * @param featureContexts - Resolved feature contexts keyed by feature id.
 * @returns Queue items with upload context metadata attached where possible.
 */
function enrichUploadResultsWithContexts(
  uploadResults: BatchUploadResult[],
  featureContexts: Map<string, FeatureContext>,
): BatchUploadResult[] {
  return uploadResults.map(result => {
    if (!result.featureId) {
      return result
    }

    const context = featureContexts.get(result.featureId)
    if (!context) {
      return result
    }

    return {
      ...result,
      uploadCtx: {
        ctxType: ImageContextResource.feature,
        ctxId: context.feature.id,
        organisation: context.organisation as unknown as NonNullable<
          ImageUploadCtx['organisation']
        >,
        project: context.project as ImageUploadCtx['project'],
      },
      existingCanonicalImage: context.existingCanonicalImage,
      intendedIntent: result.intendedIntent ?? 'canonical',
    }
  })
}

// ---

/********************
 *  3. UPLOAD INTENT RESOLUTION
 ************/
// +++ Upload Intent Resolution

/**
 * Find an existing image with matching normalized upload content.
 *
 * @param file - Upload file to fingerprint.
 * @param context - Resolved feature context containing existing images.
 * @returns Matching existing image envelope, or `null` when no duplicate exists.
 */
async function findLikelyDuplicateImage(
  file: File,
  context: FeatureContext,
): Promise<ImageCtxEnvelope | null> {
  const normalizedUpload = await normalizeUploadFileForAssetPipeline(file)
  const contentHash = await calculateImageContentHash(normalizedUpload.file)

  return (
    context.existingImages.find(
      image => image.image.contentHash && image.image.contentHash === contentHash,
    ) ?? null
  )
}

type ResolvedUploadIntent = {
  intent: Intent
  isPublished: boolean
  isConflict: boolean
  existingDuplicateImage?: ImageCtxEnvelope | null
  error?: string
}

/**
 * Resolve how a queued image should be uploaded.
 *
 * @param result - Queued upload result with intended intent metadata.
 * @param context - Resolved feature context for the target feature.
 * @returns Upload intent, publish state, and conflict details.
 * @remarks Duplicate detection happens before canonical fallback logic so exact
 * content matches can be shown as replaceable conflicts instead of uploaded again.
 */
async function resolveUploadIntent(
  result: BatchUploadResult,
  context: FeatureContext,
): Promise<ResolvedUploadIntent> {
  const intendedIntent = result.intendedIntent ?? 'canonical'
  const existingDuplicateImage = await findLikelyDuplicateImage(result.file, context)

  if (existingDuplicateImage) {
    return {
      intent: intendedIntent,
      isPublished: intendedIntent === 'canonical',
      isConflict: true,
      existingDuplicateImage,
      error: 'Duplicate detected.',
    }
  }

  if (intendedIntent !== 'canonical') {
    return {
      intent: intendedIntent,
      isPublished: false,
      isConflict: false,
    }
  }

  if (!context.existingCanonicalImage) {
    if (context.hasCanonicalImage) {
      return {
        intent: 'undefined',
        isPublished: false,
        isConflict: false,
      }
    }

    return {
      intent: 'canonical',
      isPublished: true,
      isConflict: false,
    }
  }

  return {
    intent: 'undefined',
    isPublished: false,
    isConflict: false,
  }
}

/**
 * Build the image upload context for a feature-scoped upload.
 *
 * @param featureId Feature identifier derived from the filename.
 * @param context Resolved hierarchy for the target feature.
 * @param imageToReplace Existing image selected as a replacement target.
 * @returns A fully populated upload context, or `null` on failure.
 */
export async function createUploadContextForFeature(
  featureId: string,
  context: FeatureContext,
  imageToReplace?: ImageCtxEnvelope,
): Promise<ImageUploadCtx | null> {
  try {
    const uploadCtx: ImageUploadCtx = {
      ctxType: ImageContextResource.feature,
      ctxId: featureId,
      organisation: context.organisation as unknown as NonNullable<
        ImageUploadCtx['organisation']
      >,
      project: context.project as ImageUploadCtx['project'],
      ...(imageToReplace ? { imageToReplace } : {}),
    }

    return uploadCtx
  } catch (error) {
    console.error(`Error creating upload context for feature ${featureId}:`, error)
    return null
  }
}

// ---

/********************
 *  4. UPLOAD PROCESSING
 ************/
// +++ Upload Processing

/**
 * Process a single queued image upload and update the shared results array in place.
 *
 * @param result Current queue item.
 * @param index Index in the shared results array.
 * @param uploadResults Shared mutable queue state.
 * @param featureContexts Prefetched feature upload contexts keyed by feature id.
 * @param updateResults UI callback for queue updates.
 * @param getErrorMessage Error factory used when the filename cannot be mapped to a feature.
 * @param options Upload behavior flags.
 * @returns Resolves when the queue item reaches a terminal status.
 * @remarks Replacement uploads skip conflict checks and pass the selected existing
 * image through the upload context so the asset service can replace it.
 */
export async function processSingleUpload(
  result: BatchUploadResult,
  index: number,
  uploadResults: BatchUploadResult[],
  featureContexts: Map<string, FeatureContext>,
  updateResults: (results: BatchUploadResult[]) => void,
  getErrorMessage: () => string,
  options: { replaceExisting?: boolean } = {},
): Promise<void> {
  if (!result.featureId) {
    uploadResults[index] = {
      ...result,
      status: 'error',
      error: getErrorMessage(),
    }
    console.error(`Error for ${result.file.name}:`, getErrorMessage())
    emitUploadResults(uploadResults, updateResults)
    return
  }

  const context =
    featureContexts.get(result.featureId) ??
    (result.uploadCtx?.organisation
      ? ({
          feature: { id: result.featureId } as Feature,
          project: result.uploadCtx.project as Project,
          organisation: result.uploadCtx.organisation as unknown as Organisation,
          projectId: result.uploadCtx.project?.id ?? '',
          organisationId: result.uploadCtx.organisation.id,
          existingCanonicalImage: result.existingCanonicalImage ?? null,
          hasCanonicalImage: Boolean(result.existingCanonicalImage),
          existingImages: [],
        } as FeatureContext)
      : null)
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
    emitUploadResults(uploadResults, updateResults)
    return
  }

  const resolvedIntent = options.replaceExisting
    ? {
        intent: 'canonical' as Intent,
        isPublished: true,
        isConflict: false,
      }
    : await resolveUploadIntent(result, context)

  if (resolvedIntent.isConflict && !options.replaceExisting) {
    uploadResults[index] = {
      ...result,
      status: 'conflict',
      error: resolvedIntent.error,
      existingCanonicalImage: context.existingCanonicalImage,
      existingDuplicateImage: resolvedIntent.existingDuplicateImage ?? null,
    }
    emitUploadResults(uploadResults, updateResults)
    return
  }

  const replacementTarget =
    result.existingDuplicateImage ?? context.existingCanonicalImage ?? undefined

  const uploadCtx = await createUploadContextForFeature(
    result.featureId,
    context,
    options.replaceExisting ? replacementTarget : undefined,
  )
  if (!uploadCtx) {
    uploadResults[index] = {
      ...result,
      status: 'error',
      error: 'Could not create upload context',
    }
    console.error(`Error for ${result.file.name}:`, 'Could not create upload context')
    emitUploadResults(uploadResults, updateResults)
    return
  }

  try {
    uploadResults[index] = {
      ...result,
      status: 'uploading',
      error: options.replaceExisting ? undefined : result.error,
    }
    emitUploadResults(uploadResults, updateResults)

    const savedImage = await uploadAndProcessImage(result.file, uploadCtx, {
      isPublished: resolvedIntent.isPublished,
      intent: resolvedIntent.intent,
    })

    uploadResults[index] = {
      ...result,
      status: 'success',
      savedImage,
      intendedIntent: resolvedIntent.intent,
      error: undefined,
    }
    emitUploadResults(uploadResults, updateResults)
  } catch (error) {
    uploadResults[index] = {
      ...result,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }

    console.error(`Error for ${result.file.name}:`, error)
    emitUploadResults(uploadResults, updateResults)
  }
}

// ---

/********************
 *  5. DROP ORCHESTRATION
 ************/
// +++ Drop Orchestration

/**
 * Initialize queue state for an image drop/select event and start uploading in batches.
 *
 * @param e Drop/select event emitted by the image import dropzone.
 * @param adminCtx Admin context used for post-upload refresh.
 * @param setUploadResults UI callback for queue updates.
 * @param setUploading UI callback for upload lifecycle state.
 * @param setBatches UI callback for batch progress.
 * @returns Nothing. Upload work continues asynchronously.
 */
export function handleImageDropEvent(
  e: CustomEvent,
  adminCtx: AdminCtx,
  setUploadResults: (results: BatchUploadResult[]) => void,
  setUploading: (uploading: boolean) => void,
  setBatches: (current: number, total: number) => void,
): void {
  const imageEvent: ImageDropEvent = {
    acceptedFiles: e.detail.acceptedFiles,
    fileRejections: e.detail.fileRejections,
  }

  if (imageEvent.fileRejections.length > 0) {
    console.warn('Some files were rejected:', imageEvent.fileRejections)
  }

  // Initialize upload results
  const uploadResults = imageEvent.acceptedFiles.map((file, index) =>
    createPendingUploadResult(file, index),
  )

  setUploadResults(uploadResults)
  setUploading(true)
  setBatches(0, Math.ceil(imageEvent.acceptedFiles.length / 5))

  void handleImageDrop(
    imageEvent,
    (current: number, total: number) => {
      setBatches(current, total)
    },
    results => {
      setUploadResults(results)
    },
    (results: BatchUploadResult[]) => {
      setUploadResults(results)
      setUploading(false)

      const successful = results.filter(r => r.status === 'success').length
      const failed = results.filter(r => r.status === 'error').length

      if (successful > 0) {
        adminCtx.invalidateAndRefresh(FirstClassResource.feature)
      }
    },
    (error: Error) => {
      console.error('Upload failed:', error)
      setUploading(false)
    },
  )
}

/**
 * Upload queued image files in small batches while continuously updating the shared queue state.
 *
 * @param event Accepted image files from the drop/select interaction.
 * @param onProgress Callback invoked before each batch begins.
 * @param onUpdateResults Callback invoked whenever queue item status changes.
 * @param onComplete Callback invoked once all queue items reach a terminal state.
 * @param onError Callback invoked when the batch orchestration itself fails.
 * @returns Resolves when all queued files have been processed.
 */
export async function handleImageDrop(
  event: ImageDropEvent,
  onProgress: (current: number, total: number) => void,
  onUpdateResults: (results: BatchUploadResult[]) => void,
  onComplete: (results: BatchUploadResult[]) => void,
  onError: (error: Error) => void,
): Promise<void> {
  const { acceptedFiles } = event

  if (acceptedFiles.length === 0) {
    onComplete([])
    return
  }

  const batchSize = 5
  const totalBatches = Math.ceil(acceptedFiles.length / batchSize)
  const initialUploadResults = assignIntendedIntents(
    acceptedFiles.map((file, index) => createPendingUploadResult(file, index)),
  )
  const featureContexts = await getContextsForFeatures(
    initialUploadResults
      .map(result => result.featureId)
      .filter((featureId): featureId is string => Boolean(featureId)),
  )
  const uploadResults = enrichUploadResultsWithContexts(
    initialUploadResults,
    featureContexts,
  )

  onUpdateResults(uploadResults)

  try {
    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize
      const end = Math.min(start + batchSize, acceptedFiles.length)
      const batch = uploadResults.slice(start, end)

      onProgress(i + 1, totalBatches)

      await Promise.all(
        batch.map((result, batchIndex) =>
          processSingleUpload(
            result,
            start + batchIndex,
            uploadResults,
            featureContexts,
            onUpdateResults,
            () =>
              `No matching feature found for filename "${result.file.name}". Expected the filename to follow "featureId.sequence.ext" or "featureId-sequence.ext" (dash separator only recognised when the feature ID is ${FEATURE_ID_LENGTH} characters).`,
          ),
        ),
      )

      // Small delay between batches to prevent overwhelming the server.
      if (i < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    onComplete([...uploadResults])
  } catch (error) {
    onError(error instanceof Error ? error : new Error('Upload failed'))
  }
}

// ---
