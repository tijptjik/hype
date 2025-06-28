// SVELTE
import { error } from '@sveltejs/kit';
// COORDINATES
import Coordinates from 'coordinate-parser';
// UTILS
import { capitalizeFirstLetter } from '$lib';
// SERVICES
import { intentOrder } from '$lib/api/services/image';
// ENUMS
import { ImageContextResource, ImageContextResourceExtended } from '$lib/enums';
// TYPES
import type {
  ImageNew,
  Image,
  ParamsToSign,
  ImageUploadCtx,
  Id,
  Intent,
  ImageEditCtx,
  ImageDB,
  ImageDBBasic,
  ImagePartial,
  Metadata,
  LngLat,
  SignData
} from '$lib/types';
import { hashicon } from '@emeraldpay/hashicon';

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ORCHESTRATION
//    - uploadAndProcessImage
//
// 2. INTERNAL :: API
//    - createImage
//    - getImages
//    - updateImage
//    - updateImageIntent
//    - updateImageIsPublished
//    - deleteImage
//
// 3. CLOUDINARY :: API
//    - createCloudinaryImage
//
// 4. CLOUDINARY :: UTILS
//    - getCloudinaryUploadEndpoint
//    - getURLfromImage
//    - getImageFromCloudinaryResponse
//    - getCloudinarySignature
//    - getPublicPathCloudinaryImage
//
// 5. EXTENSIONS
//    - extendFeatureImage
//    - extendImageWithResource
//
// 6. METADATA
//    - getCoordinatesFromMetadata
//    - getCapturedAtFromMetadata
//    - getCameraFromMetadata
//    - getCreditFromMetadata
//
// 7. UTILS
//    - sortImages
//    - addCtxToUrl
//    - getHashiconUrl
//

// ═══════════════════════
// 1. ORCHESTRATION
// ═══════════════════════

/**
 * Orchestrates the full image upload process: gets path, signs, uploads to Cloudinary,
 * processes response, extends metadata, and saves/updates the image record in the backend.
 * This function does NOT handle frontend state updates (e.g., upload queue status, image list updates).
 *
 * @param file The file to upload.
 * @param uploadCtx Context for the upload (resource type, ID, org, project, imageToReplace).
 * @param extendedFeatureInfo Optional info for feature images (publish status, intent).
 * @param fetchFn Optional fetch function, defaults to global fetch.
 * @returns The saved/updated image data from the backend.
 */
export async function uploadAndProcessImage(
  file: File,
  uploadCtx: ImageUploadCtx,
  extendedFeatureInfo?: {
    isPublished: boolean;
    intent: Intent;
  },
  fetchFn: typeof fetch = fetch
): Promise<Image> {
  // 1. Determine public path for Cloudinary
  const { folder, public_id } = getPublicPathCloudinaryImage(uploadCtx);
  const paramsToSign: ParamsToSign = uploadCtx.imageToReplace
    ? { folder, public_id: public_id! } // public_id will exist if imageToReplace is true and path is valid
    : { folder };

  // 2. Fetch Cloudinary signature
  const signData = await getCloudinarySignature(paramsToSign, fetchFn);

  // 3. Upload file to Cloudinary
  const cloudinaryResponse = await createCloudinaryImage(
    file,
    paramsToSign,
    signData,
    fetchFn
  );

  // 4. Process Cloudinary response into our image format
  const imageData = getImageFromCloudinaryResponse(cloudinaryResponse);

  // 5. Extend image data with feature/hierarchical info
  extendFeatureImage(
    imageData,
    uploadCtx,
    extendedFeatureInfo ? { featureImage: extendedFeatureInfo } : undefined
  );
  extendImageWithResource(imageData, uploadCtx);

  // 6. Upsert image in the backend
  let savedImage: Image;
  if (uploadCtx.imageToReplace) {
    savedImage = await updateImage(
      uploadCtx.imageToReplace.id,
      imageData as ImagePartial,
      uploadCtx,
      fetchFn
    );
  } else {
    savedImage = await createImage(imageData as ImageNew, fetchFn);
  }

  return savedImage;
}

// ═══════════════════════
// 2. INTERNAL :: API
// ═══════════════════════

/**
 * Creates a new image record in the backend.
 * @param imageData - The image data to save.
 * @param fetchFn - The fetch function to use for the API call.
 * @returns The saved image data from the backend.
 */
export async function createImage(
  imageData: ImageNew,
  fetchFn: typeof fetch = fetch
): Promise<Image> {
  const response = await fetchFn('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(imageData)
  });
  if (!response.ok) {
    throw new Error('Failed to create new image in backend');
  }
  return response.json(); // Assumes API returns the full Image object
}

/**
 * Fetches images from the API based on provided parameters.
 *
 * @param ctxType The resourceType the image is associated with (e.g., feature, project).
 * @param ctxId The ID of the resource the image is associated with.
 * @param fetchFn Optional fetch function, defaults to global fetch.
 * @returns Promise resolving with an array of images.
 */
export async function getImages(
  ctxType: ImageContextResource | ImageContextResourceExtended,
  ctxId: Id,
  fetchFn: typeof fetch = fetch
): Promise<(Image & { preview?: string })[]> {
  const basePath = '/api/images'; // Centralized base path
  const params = new URLSearchParams();

  if (ctxType === ImageContextResource.feature && ctxId) {
    params.append('featureId', ctxId);
  } else if (ctxType === ImageContextResource.project && ctxId) {
    params.append('projectId', ctxId);
  } else if (ctxType === ImageContextResource.organisation && ctxId) {
    params.append('organisationId', ctxId);
  } else if (ctxType === ImageContextResourceExtended.task && ctxId) {
    params.append('taskId', ctxId);
  }

  const apiUrl = `${basePath}?${params.toString()}`;

  const response = await fetchFn(apiUrl);
  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Failed to fetch images via API:', apiUrl, errorBody);
    throw new Error(
      `Network response was not ok for fetching images: ${response.statusText}`
    );
  }
  return response.json() as Promise<(Image & { preview?: string })[]>;
}

/**
 * Updates an existing image record in the backend.
 * @param imageId - The ID of the image to update.
 * @param imageData - The new image data.
 * @param ctx - The context for the update (used for URL query params).
 * @param fetchFn - The fetch function to use for the API call.
 * @returns The updated image data from the backend.
 */
export async function updateImage(
  imageId: string,
  imageData: ImagePartial,
  ctx: ImageEditCtx,
  fetchFn: typeof fetch = fetch
): Promise<Image> {
  const apiUrl = addCtxToUrl(`/api/images/${imageId}`, ctx);
  const response = await fetchFn(apiUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(imageData)
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to update existing image in backend: ${errorBody}`);
  }
  // Assuming PATCH also returns the full Image object (or relevant parts to merge)
  const result = await response.json();
  return result.data || result; // API returns { type: 'success', data: responseData }
}

/**
 * Updates the intent of an image via the API.
 * @param imageId The ID of the image to update.
 * @param intent The new intent for the image.
 * @param ctx Context (ctxType, ctxId) for the API call.
 * @param fetchFn Optional fetch function, defaults to global fetch.
 * @returns Promise resolving when the update is complete.
 */
export async function updateImageIntent(
  imageId: string,
  intent: Intent,
  ctx: ImageEditCtx,
  fetchFn: typeof fetch = fetch
): Promise<Image> {
  const apiUrl = addCtxToUrl(`/api/images/${imageId}`, ctx);
  const response = await fetchFn(apiUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent,
      imageId,
      featureId: ctx.ctxId
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to update intent: ${errorBody}`);
  }
  const result = await response.json();
  return result.data || result;
}

/**
 * Updates the publish status of an image via the API.
 * @param imageId The ID of the image to update.
 * @param isPublished The new publish status for the image.
 * @param ctx Context (ctxType, ctxId) for the API call.
 * @param fetchFn Optional fetch function, defaults to global fetch.
 * @returns Promise resolving with the JSON response from the API.
 */
export async function updateImageIsPublished(
  imageId: string,
  isPublished: boolean,
  ctx: ImageEditCtx,
  fetchFn: typeof fetch = fetch
): Promise<Image> {
  // Expecting the updated image back
  const apiUrl = addCtxToUrl(`/api/images/${imageId}`, ctx);
  const response = await fetchFn(apiUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      isPublished,
      imageId,
      featureId: ctx.ctxId
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to update publish status: ${errorBody}`);
  }
  const result = await response.json();
  return result.data || result;
}

/**
 * Deletes an image via the API.
 * @param imageId The ID of the image to delete.
 * @param ctx Context (ctxType, ctxId) for the API call.
 * @param fetchFn Optional fetch function, defaults to global fetch.
 * @returns Promise resolving with the JSON response from the API.
 */
export async function deleteImage(
  imageId: string,
  ctx: ImageEditCtx,
  fetchFn: typeof fetch = fetch
): Promise<any> {
  // DELETE might not return the image, just a success message
  const apiUrl = addCtxToUrl(`/api/images/${imageId}`, ctx);
  const response = await fetchFn(apiUrl, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to delete image: ${errorBody}`);
  }
  return response.json();
}

// ═══════════════════════
// 3. CLOUDINARY :: API
// ═══════════════════════

/**
 * Uploads a file directly to Cloudinary.
 * @param file - The file to upload.
 * @param paramsToSign - Original parameters that were signed (folder, public_id if replacing).
 * @param signData - The signature data obtained from `serviceFetchCloudinarySignature`.
 * @param fetchFn - The fetch function to use for the API call.
 * @returns The Cloudinary API response.
 */
export async function createCloudinaryImage(
  file: File,
  paramsToSign: ParamsToSign, // folder, public_id (if any)
  signData: SignData,
  fetchFn: typeof fetch = fetch
): Promise<any> {
  const url = getCloudinaryUploadEndpoint(signData.cloudname);
  const formData = new FormData();

  formData.append('file', file);
  formData.append('folder', paramsToSign.folder);
  formData.append('api_key', signData.apikey);
  formData.append('timestamp', signData.timestamp);
  formData.append('signature', signData.signature);
  formData.append('media_metadata', 'true');

  if (paramsToSign.public_id) {
    formData.append('public_id', paramsToSign.public_id);
  }

  const response = await fetchFn(url, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('Cloudinary upload failed:', errorData);
    throw new Error(`Cloudinary upload failed: ${response.statusText}`);
  }
  return response.json();
}

// ═══════════════════════
// 4. CLOUDINARY :: UTILS
// ═══════════════════════

/**
 * Generates the Cloudinary upload endpoint URL.
 * @param cloudname - The Cloudinary cloud name.
 * @returns The upload URL string.
 */
export function getCloudinaryUploadEndpoint(cloudname: string): string {
  return `https://api.cloudinary.com/v1_1/${cloudname}/auto/upload`;
}

/**
 * Generates a URL for a Cloudinary image based on the image data.
 * @param opts - Options for generating the URL.
 * @param opts.image - The image data.
 * @param opts.transformation - The transformation to apply to the image.
 * @param opts.raw - Whether to return the raw image URL.
 * @returns The generated URL string.
 */
export function getURLfromImage(opts: {
  image: ImageDB | ImageDBBasic;
  transformation?: string;
  raw?: boolean;
  gravity?: string;
  quality?: string;
  format?: string;
}): string {
  const {
    image,
    transformation = 'c_fit,h_1000,w_1000',
    gravity = 'auto',
    format = 'auto',
    quality = 'auto',
    raw = false
  } = opts;

  const finalTransformation = `${transformation}/g_${gravity}/f_${format}/q_${quality}`;

  if (image.cdn === 'cloudinary') {
    return raw
      ? `https://res.cloudinary.com/${image.env}/image/upload/fl_attachment/${image.publicId}`
      : `https://res.cloudinary.com/${image.env}/image/upload/${finalTransformation}/v${image.version}/${image.publicId}`;
  } else {
    throw error(404, `Image CDN <code>${image.cdn}</code> not supported`);
  }
}

/**
 * Transforms a Cloudinary API response into a partial NewImageAPI object.
 * @param response - The raw Cloudinary API response.
 * @returns A partial NewImageAPI object.
 */
export function getImageFromCloudinaryResponse(response: any): Partial<ImageNew> {
  const metadata = response.image_metadata || {}; // Ensure metadata is an object
  return {
    cdn: 'cloudinary' as const,
    env: response.env,
    cdnId: response.asset_id,
    publicId: response.public_id,
    version: response.version,
    originalFilename: response.original_filename,
    originalExtension: response.format,
    originalWidth: response.width,
    originalHeight: response.height,
    metadata: metadata,
    cameraModel: getCameraFromMetadata(metadata),
    capturedAt: getCapturedAtFromMetadata(metadata),
    credit: getCreditFromMetadata(metadata),
    ...getCoordinatesFromMetadata(metadata)
  };
}

/**
 * Fetches the signature required for Cloudinary upload from the backend.
 * @param paramsToSign - Parameters to be signed for the Cloudinary upload.
 * @param fetchFn - The fetch function to use for the API call.
 * @returns The signature data from the backend.
 */
export async function getCloudinarySignature(
  paramsToSign: ParamsToSign,
  fetchFn: typeof fetch = fetch
): Promise<SignData> {
  const response = await fetchFn('/api/cloudinary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paramsToSign: {
        ...paramsToSign,
        media_metadata: 'true'
      }
    })
  });
  if (!response.ok) {
    throw new Error('Failed to fetch Cloudinary signature');
  }
  return response.json();
}

/**
 * Determines the public path for Cloudinary upload based on resource type.
 * @param ctx - The upload context containing resource type, entity, organisation, project, and imageToReplace.
 * @returns An object with folder and public_id (which can be null).
 * @throws Error if ctx are invalid for determining path.
 */
export function getPublicPathCloudinaryImage(ctx: ImageUploadCtx): {
  folder: string;
  public_id: string | null;
} {
  if (ctx.ctxType === ImageContextResource.organisation && ctx.organisation) {
    return {
      folder: `/${ctx.organisation.code}`,
      public_id: ctx.ctxId
    };
  } else if (
    ctx.ctxType === ImageContextResource.project &&
    ctx.project &&
    ctx.organisation
  ) {
    return {
      folder: `/${ctx.organisation.code}/${ctx.project.code}`,
      public_id: ctx.ctxId
    };
  } else if (
    ctx.ctxType === ImageContextResource.feature &&
    ctx.project &&
    ctx.organisation &&
    ctx.imageToReplace
  ) {
    return {
      folder: `/${ctx.organisation.code}/${ctx.project.code}`,
      public_id: ctx.imageToReplace.publicId.split('/').pop()!
    };
  } else if (
    ctx.ctxType === ImageContextResource.feature &&
    ctx.project &&
    ctx.organisation
  ) {
    // New feature image, no public_id for replacement
    return {
      folder: `/${ctx.organisation.code}/${ctx.project.code}`,
      public_id: null
    };
  }
  console.error('Invalid ctx for getPublicPath:', ctx);
  throw new Error('Invalid ctx for getPublicPath');
}

// ═══════════════════════
// 5. EXTENSIONS
// ═══════════════════════

/**
 * Extends the image data with feature image information.
 * @param image - The image data to extend.
 * @param ctx - The upload context containing resource type, entity, organisation, project, and imageToReplace.
 * @param extended - Optional extended information for feature image.
 * @returns The extended image data.
 */
export function extendFeatureImage(
  image: Partial<ImageNew>,
  ctx: ImageUploadCtx,
  extended?: {
    featureImage?: {
      isPublished: boolean;
      intent: string;
    };
  }
) {
  if (ctx.ctxType === 'feature') {
    image.featureImage = ctx.imageToReplace
      ? {
          featureId: ctx.imageToReplace.featureId,
          intent: ctx.imageToReplace.intent,
          isPublished: ctx.imageToReplace.isPublished
        }
      : ({
          featureId: ctx.ctxId,
          intent: extended?.featureImage?.intent || 'undefined',
          isPublished: extended?.featureImage?.isPublished
        } as any); // Cast as any to match NewFeatureImages if necessary
  }
}

/**
 * Extends the image data with resource information.
 * @param image - The image data to extend.
 * @param ctx - The upload context containing resource type, entity, organisation, project, and imageToReplace.
 * @returns The extended image data.
 */
export function extendImageWithResource(image: Partial<ImageNew>, ctx: ImageUploadCtx) {
  if (
    Object.values(ImageContextResource).includes(ctx.ctxType as ImageContextResource)
  ) {
    image.ctxType = ctx.ctxType as ImageContextResource;
    image.ctxId = ctx.ctxId;
  }
}

// ═══════════════════════
// 6. METADATA
// ═══════════════════════

/**
 * Converts GPS metadata to latitude and longitude.
 * @param metadata - The image metadata object.
 * @returns An object containing latitude and longitude strings, or undefined if parsing fails.
 */
export function getCoordinatesFromMetadata(metadata: Metadata): LngLat {
  try {
    const coordinates = new Coordinates(
      `${metadata.GPSLatitude.replace(' deg', '°')} ${metadata.GPSLongitude.replace(' deg', '°')}`
    );
    return {
      latitude: coordinates.getLatitude().toString(),
      longitude: coordinates.getLongitude().toString()
    };
  } catch (error) {
    console.warn('Failed to parse coordinates with coordinate-parser');
    // Fallback or simplified parsing if direct fields are available
    if (metadata.GPSLatitude && metadata.GPSLongitude) {
      return {
        latitude: String(metadata.GPSLatitude),
        longitude: String(metadata.GPSLongitude)
      };
    }
    return { latitude: undefined, longitude: undefined };
  }
}

/**
 * Extracts and parses the capture date from metadata.
 * @param metadata - The image metadata object.
 * @returns An ISO string of the capture date, or the current date as a fallback.
 */
export function getCapturedAtFromMetadata(metadata: Metadata): string {
  const parseExifDate = (dateStr: string): string => {
    const normalized = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    return new Date(normalized).toISOString();
  };

  const possibleFields = ['DateTimeOriginal', 'CreateDate', 'ModifyDate'];
  for (const field of possibleFields) {
    if (metadata[field]) {
      try {
        return parseExifDate(metadata[field]);
      } catch (e) {
        console.warn(`Failed to parse ${field}:`, metadata[field]);
        continue;
      }
    }
  }

  if (metadata.DateCreated && metadata.TimeCreated) {
    try {
      return parseExifDate(`${metadata.DateCreated} ${metadata.TimeCreated}`);
    } catch (e) {
      console.warn(
        'Failed to parse DateCreated/TimeCreated:',
        metadata.DateCreated,
        metadata.TimeCreated
      );
    }
  }

  return new Date().toISOString();
}

/**
 * Extracts and formats the camera model from metadata.
 * @param metadata - The image metadata object.
 * @returns The camera model string, or undefined.
 */
export function getCameraFromMetadata(metadata: Metadata): string | undefined {
  const make = capitalizeFirstLetter(metadata.Make) ?? '';
  const model = capitalizeFirstLetter(metadata.Model) ?? '';
  const hasCamera = model.includes(make);
  return hasCamera ? model.trim() : `${make} ${model}`.trim() || undefined;
}

/**
 * Extracts credit/copyright information from metadata.
 * @param metadata - The image metadata object.
 * @returns The credit string, or undefined.
 */
export function getCreditFromMetadata(metadata: Metadata): string | undefined {
  const possibleFields = ['CopyrightNotice', 'Credit', 'By-line'];
  for (const field of possibleFields) {
    if (metadata[field]) {
      return metadata[field];
    }
  }
  return undefined;
}

// ═══════════════════════
// 7. UTILS
// ═══════════════════════

export function sortImages(images: Image[]) {
  const sortedImages = images.sort((a, b) => {
    // Priority 1: Unpublished with no intent (undefined) come first
    const aIsUnpublishedNoIntent =
      !a.isPublished && (!a.intent || a.intent === 'undefined');
    const bIsUnpublishedNoIntent =
      !b.isPublished && (!b.intent || b.intent === 'undefined');

    if (aIsUnpublishedNoIntent && !bIsUnpublishedNoIntent) return -1;
    if (!aIsUnpublishedNoIntent && bIsUnpublishedNoIntent) return 1;

    // Priority 2: Published vs unpublished (published first among remaining)
    if (a.isPublished !== b.isPublished) {
      return a.isPublished ? -1 : 1;
    }

    // Priority 3: Intent order within same publish status
    if (a.intent && b.intent) {
      const intentCompare =
        intentOrder.indexOf(a.intent as Intent) -
        intentOrder.indexOf(b.intent as Intent);
      if (intentCompare !== 0) {
        return intentCompare;
      }
    }

    // Priority 4: Creation date (newest first)
    return (
      new Date(b.createdAt as string).getTime() -
      new Date(a.createdAt as string).getTime()
    );
  });
  return sortedImages;
}

/**
 * Adds context information as query parameters to a URL.
 * @param baseUrl The base URL string.
 * @param ctx The image edit context.
 * @returns The URL string with context query parameters.
 */
function addCtxToUrl(baseUrl: string, ctx: ImageEditCtx): string {
  const url = new URL(baseUrl, window.location.origin);
  if (ctx.ctxId && ctx.ctxType) {
    if (
      ctx.ctxType === ImageContextResource.organisation ||
      ctx.ctxType === ImageContextResource.project ||
      ctx.ctxType === ImageContextResource.feature
    ) {
      // ctx.ctxType is definitely ImageContextResource here
      switch (ctx.ctxType) {
        case ImageContextResource.organisation:
          url.searchParams.append('organisationId', ctx.ctxId);
          break;
        case ImageContextResource.project:
          url.searchParams.append('projectId', ctx.ctxId);
          break;
        case ImageContextResource.feature:
          url.searchParams.append('featureId', ctx.ctxId);
          break;
      }
    } else if (ctx.ctxType === ImageContextResourceExtended.task) {
      url.searchParams.append('taskId', ctx.ctxId);
    } else {
      // Handle cases where ctx.ctxType might be a string not matching any enum value
      // Or if there are other values in ImageContextResourceExtended not handled above
      console.warn(`Unsupported context type for URL: ${ctx.ctxType}`);
    }
  }
  return url.pathname + url.search;
}

// Generate hashicon URL for fallback
export function getHashiconUrl(id: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  hashicon(id, { size: 64, createCanvas: () => canvas });
  return canvas.toDataURL();
}
