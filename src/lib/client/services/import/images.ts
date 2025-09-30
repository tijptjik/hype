import { uploadAndProcessImage } from '$lib/client/services/image';
import { FirstClassResource, ImageContextResource } from '$lib/enums';
import type {
  FeatureFromCollection,
  Feature,
  ImageUploadCtx,
  BatchUploadResult
} from '$lib/types';

export interface ImageDropEvent {
  acceptedFiles: File[];
  fileRejections: any[];
}

// Define the context type
type FeatureContext = {
  feature: FeatureFromCollection | Feature;
  layer: any;
  project: any;
  organisation: any;
  layerId: string;
  projectId: string;
  organisationId: string;
};

// Extract feature ID from filename
export function extractFeatureIdFromFilename(
  filename: string,
  appCtx: any
): string | null {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

  // Validate the feature ID exists in our resources
  const feature = appCtx.getFeatureById(nameWithoutExt);
  if (!feature) {
    console.warn(`No matching feature found for ID: ${nameWithoutExt}`);
    return null;
  }

  return nameWithoutExt;
}

// Get context for a feature ID
export async function getContextForFeature(
  featureId: string,
  appCtx: any
): Promise<FeatureContext | null> {
  try {
    const feature = await appCtx.getFeatureById(featureId);
    if (!feature) {
      console.error(`Feature not found for ID: ${featureId}`);
      return null;
    }

    const { layer, project, organisation } = await appCtx.getHierarchy(feature);

    if (!layer || !project || !organisation) {
      console.error(`Missing hierarchy for feature ${featureId}:`, {
        layer,
        project,
        organisation
      });
      return null;
    }

    return {
      feature,
      layer,
      project,
      organisation,
      layerId: layer.id,
      projectId: project.id,
      organisationId: organisation.id
    };
  } catch (error) {
    console.error(`Error getting context for feature ${featureId}:`, error);
    return null;
  }
}

// Create upload context for feature
export async function createUploadContextForFeature(
  featureId: string,
  context: FeatureContext
): Promise<ImageUploadCtx | null> {
  try {
    const uploadCtx: ImageUploadCtx = {
      ctxType: ImageContextResource.feature,
      ctxId: featureId,
      organisation: context.organisation,
      project: context.project
    };

    return uploadCtx;
  } catch (error) {
    console.error(`Error creating upload context for feature ${featureId}:`, error);
    return null;
  }
}

// Process a single upload
export async function processSingleUpload(
  result: BatchUploadResult,
  index: number,
  uploadResults: BatchUploadResult[],
  appCtx: any,
  adminCtx: any,
  updateResults: (results: BatchUploadResult[]) => void,
  getErrorMessage: () => string
) {
  if (!result.featureId) {
    uploadResults[index] = {
      ...result,
      status: 'error',
      error: getErrorMessage()
    };
    console.error(`Error for ${result.file.name}:`, getErrorMessage());
    updateResults(uploadResults);
    return;
  }

  const context = await getContextForFeature(result.featureId, appCtx);
  if (!context) {
    uploadResults[index] = {
      ...result,
      status: 'error',
      error: `Feature not found or missing hierarchy for ID: ${result.featureId}`
    };
    console.error(
      `Error for ${result.file.name}:`,
      `Feature not found or missing hierarchy for ID: ${result.featureId}`
    );
    updateResults(uploadResults);
    return;
  }

  const uploadCtx = await createUploadContextForFeature(result.featureId, context);
  if (!uploadCtx) {
    uploadResults[index] = {
      ...result,
      status: 'error',
      error: 'Could not create upload context'
    };
    console.error(`Error for ${result.file.name}:`, 'Could not create upload context');
    updateResults(uploadResults);
    return;
  }

  try {
    uploadResults[index] = { ...result, status: 'uploading' };
    updateResults(uploadResults);

    const savedImage = await uploadAndProcessImage(result.file, uploadCtx, {
      isPublished: true,
      intent: 'canonical'
    });

    uploadResults[index] = {
      ...result,
      status: 'success',
      savedImage
    };
    // Refresh the features in resource state
    adminCtx.invalidateAndRefresh(FirstClassResource.feature);
    updateResults(uploadResults);
  } catch (error) {
    uploadResults[index] = {
      ...result,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    console.error(`Error for ${result.file.name}:`, error);
    updateResults(uploadResults);
  }
}

// Handle image drop event
export function handleImageDropEvent(
  e: CustomEvent,
  appCtx: any,
  setUploadResults: (results: BatchUploadResult[]) => void,
  setUploading: (uploading: boolean) => void,
  setBatches: (current: number, total: number) => void
) {
  const imageEvent: ImageDropEvent = {
    acceptedFiles: e.detail.acceptedFiles,
    fileRejections: e.detail.fileRejections
  };

  if (imageEvent.fileRejections.length > 0) {
    console.warn('Some files were rejected:', imageEvent.fileRejections);
  }

  // Initialize upload results
  const uploadResults = imageEvent.acceptedFiles.map((file) => ({
    file,
    status: 'pending' as const,
    featureId: extractFeatureIdFromFilename(file.name, appCtx)
  }));

  setUploadResults(uploadResults);
  setUploading(true);

  handleImageDrop(
    imageEvent,
    (current: number, total: number) => {
      setBatches(current, total);
    },
    (results: any[]) => {
      const finalResults = results.map((result) => ({
        file: result.file,
        status: result.success ? 'success' : 'error',
        featureId: extractFeatureIdFromFilename(result.file, appCtx),
        error: result.error
      }));
      setUploadResults(finalResults);
      setUploading(false);

      const successful = finalResults.filter((r) => r.status === 'success').length;
      const failed = finalResults.filter((r) => r.status === 'error').length;

      console.log(`Upload complete: ${successful} successful, ${failed} failed`);
    },
    (error: Error) => {
      console.error('Upload failed:', error);
      setUploading(false);
    }
  );
}

export async function handleImageDrop(
  event: ImageDropEvent,
  onProgress: (current: number, total: number) => void,
  onComplete: (results: any[]) => void,
  onError: (error: Error) => void
) {
  const { acceptedFiles } = event;

  if (acceptedFiles.length === 0) return;

  const batchSize = 5;
  const totalBatches = Math.ceil(acceptedFiles.length / batchSize);
  const results: any[] = [];

  try {
    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, acceptedFiles.length);
      const batch = acceptedFiles.slice(start, end);

      onProgress(i + 1, totalBatches);

      const batchPromises = batch.map(async (file) => {
        try {
          const result = await uploadAndProcessImage(file);
          return { file: file.name, success: true, result };
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          return { file: file.name, success: false, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to prevent overwhelming the server
      if (i < totalBatches - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    onComplete(results);
  } catch (error) {
    onError(error instanceof Error ? error : new Error('Upload failed'));
  }
}
