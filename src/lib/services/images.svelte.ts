// UTILS
import { capitalizeFirstLetter } from '$lib';
import Coordinates from 'coordinate-parser';

// TYPES
import type {
  NewImageAPI,
  GetImageAPI,
  ParamsToSign,
  ImageUploadRefs,
  ResourceType,
  Id,
  OrganisationDB,
  ProjectDB,
  Organisation,
  Project,
  Intent,
  ImageUploadState,
  ImageEditRefs,
  ImageDB
} from '$lib/types';

type LngLat = {
  latitude?: string;
  longitude?: string;
};

type Metadata = Record<string, string>;
type SignData = {
  cloudname: string;
  apikey: string;
  timestamp: string;
  signature: string;
};

// ═══════════════════════
// Y. METADATA
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
    console.warn('Failed to parse coordinates with coordinate-parser:', error);
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
    const normalized = dateStr.replace(/^(\\d{4}):(\\d{2}):(\\d{2})/, '$1-$2-$3');
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
// X. EXTENSIONS
// ═══════════════════════

/**
 * Extends the image data with feature image information.
 * @param image - The image data to extend.
 * @param refs - The upload references containing resource type, entity, organisation, project, and imageToReplace.
 * @param extended - Optional extended information for feature image.
 * @returns The extended image data.
 */
export function extendFeatureImage(
  image: Partial<NewImageAPI>,
  refs: ImageUploadRefs,
  extended?: {
    featureImage?: {
      isPublished: boolean;
      intent: string; // Assuming Intent is a string type from $lib/types
    };
  }
) {
  if (refs.resource === 'feature') {
    image.featureImage = refs.imageToReplace
      ? {
          featureId: refs.imageToReplace.featureId,
          intent: refs.imageToReplace.intent,
          isPublished: refs.imageToReplace.isPublished
        }
      : ({
          featureId: refs.entity,
          intent: extended?.featureImage?.intent || 'undefined',
          isPublished: extended?.featureImage?.isPublished || true
        } as any); // Cast as any to match NewFeatureImages if necessary
  }
}

/**
 * Extends the image data with resource information.
 * @param image - The image data to extend.
 * @param refs - The upload references containing resource type, entity, organisation, project, and imageToReplace.
 * @returns The extended image data.
 */
export function extendImageWithResource(
  image: Partial<NewImageAPI>,
  refs: ImageUploadRefs
) {
  if (
    refs.resource === 'project' ||
    refs.resource === 'organisation' ||
    refs.resource === 'feature'
  ) {
    image.refType = refs.resource;
    image.refId = refs.entity;
  }
}

// ═══════════════════════
// X. CLOUDINARY :: UTILS
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
  image: ImageDB;
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
export function getImageFromCloudinaryResponse(response: any): Partial<NewImageAPI> {
  const metadata = response.image_metadata || {}; // Ensure metadata is an object
  return {
    cdn: 'cloudinary' as const,
    env: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
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
 * @param refs - The upload references containing resource type, entity, organisation, project, and imageToReplace.
 * @returns An object with folder and public_id (which can be null).
 * @throws Error if refs are invalid for determining path.
 */
export function getPublicPathCloudinaryImage(refs: {
  resource: ResourceType | null;
  entity: Id | null;
  organisation?: Organisation | OrganisationDB | null;
  project?: Project | ProjectDB | null;
  imageToReplace?: GetImageAPI | null;
}): { folder: string; public_id: string | null } {
  if (refs.resource === 'organisation' && refs.organisation) {
    return {
      folder: `/${refs.organisation.code}`,
      public_id: refs.entity
    };
  } else if (refs.resource === 'project' && refs.project && refs.organisation) {
    return {
      folder: `/${refs.organisation.code}/${refs.project.code}`,
      public_id: refs.entity
    };
  } else if (
    refs.resource === 'feature' &&
    refs.project &&
    refs.organisation &&
    refs.imageToReplace
  ) {
    return {
      folder: `/${refs.organisation.code}/${refs.project.code}`,
      public_id: refs.imageToReplace.publicId.split('/').pop()!
    };
  } else if (refs.resource === 'feature' && refs.project && refs.organisation) {
    // New feature image, no public_id for replacement
    return {
      folder: `/${refs.organisation.code}/${refs.project.code}`,
      public_id: null
    };
  }
  console.error('Invalid refs for getPublicPath:', refs);
  throw new Error('Invalid refs for getPublicPath');
}

// ═══════════════════════
// X. CLOUDINARY :: API
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
// X. INTERNAL :: API
// ═══════════════════════

/**
 * Creates a new image record in the backend.
 * @param imageData - The image data to save.
 * @param fetchFn - The fetch function to use for the API call.
 * @returns The saved image data from the backend.
 */
export async function createImage(
  imageData: NewImageAPI,
  fetchFn: typeof fetch = fetch
): Promise<GetImageAPI> {
  const response = await fetchFn('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(imageData)
  });
  if (!response.ok) {
    throw new Error('Failed to create new image in backend');
  }
  return response.json(); // Assumes API returns the full GetImageAPI object
}

/**
 * Fetches images from the API based on provided parameters.
 *
 * @param refType The type of the reference (e.g., feature, project).
 * @param refId The ID of the reference.
 * @param isAdminView Whether to fetch with admin privileges/views.
 * @param fetchFn Optional fetch function, defaults to global fetch.
 * @returns Promise resolving with an array of images.
 */
export async function getImages(
  refType: ResourceType | null,
  refId: Id | null,
  isAdminView: boolean,
  fetchFn: typeof fetch = fetch
): Promise<(GetImageAPI & { preview?: string })[]> {
  const basePath = '/api/images'; // Centralized base path
  const params = new URLSearchParams();

  if (isAdminView) {
    params.append('isAdminView', 'true');
  }

  // Assuming HierarchicalResource might be relevant here as in original buildApiUrl
  // For simplicity, directly using refType and refId as per original logic in buildApiUrl
  if (refType === 'feature' && refId) {
    // Using string literal 'feature' as HierarchicalResource.feature would need enum import
    params.append('featureId', refId);
  } else if (refType === 'project' && refId) {
    params.append('projectId', refId); // Example: Add if your API supports this
  } else if (refType === 'organisation' && refId) {
    params.append('organisationId', refId); // Example: Add if your API supports this
  }
  // Add other refType conditions as needed based on your API capabilities

  const apiUrl = `${basePath}?${params.toString()}`;

  const response = await fetchFn(apiUrl);
  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Failed to fetch images via API:', apiUrl, errorBody);
    throw new Error(
      `Network response was not ok for fetching images: ${response.statusText}`
    );
  }
  return response.json() as Promise<(GetImageAPI & { preview?: string })[]>;
}

/**
 * Updates an existing image record in the backend.
 * @param imageId - The ID of the image to update.
 * @param imageData - The new image data.
 * @param fetchFn - The fetch function to use for the API call.
 * @returns The updated image data from the backend.
 */
export async function updateImage(
  imageId: string,
  imageData: NewImageAPI,
  fetchFn: typeof fetch = fetch
): Promise<GetImageAPI> {
  const response = await fetchFn(`/api/images/${imageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(imageData)
  });
  if (!response.ok) {
    throw new Error('Failed to update existing image in backend');
  }
  // Assuming PATCH also returns the full GetImageAPI object (or relevant parts to merge)
  const result = await response.json();
  return result.image || result; // Handle if API wraps it in an 'image' property
}

/**
 * Updates the intent of an image via the API.
 * @param imageId The ID of the image to update.
 * @param intent The new intent for the image.
 * @param refs Contextual references (refType, refId) for the API call.
 * @param fetchFn Optional fetch function, defaults to global fetch.
 * @returns Promise resolving when the update is complete.
 */
export async function updateImageIntent(
  imageId: string,
  intent: Intent,
  refs: ImageEditRefs,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  // Assuming API returns success/failure, not the full image object
  const response = await fetchFn(`/api/images/${imageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...refs,
      featureImage: { intent } // Ensure this matches your API's expected body structure
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Failed to update intent via API:', errorBody);
    throw new Error(`Failed to update intent: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Updates the publish status of an image via the API.
 * @param imageId The ID of the image to update.
 * @param isPublished The new publish status for the image.
 * @param refs Contextual references (refType, refId) for the API call.
 * @param fetchFn Optional fetch function, defaults to global fetch.
 * @returns Promise resolving with the JSON response from the API.
 */
export async function updateImageIsPublished(
  imageId: string,
  isPublished: boolean,
  refs: ImageEditRefs,
  fetchFn: typeof fetch = fetch
): Promise<any> {
  // API currently returns { success: boolean } or similar
  const response = await fetchFn(`/api/images/${imageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...refs,
      featureImage: { isPublished } // Ensure this matches your API's expected body structure
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Failed to update publish status via API:', errorBody);
    throw new Error(`Failed to update publish status: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Deletes an image via the API.
 * @param imageId The ID of the image to delete.
 * @param refs Contextual references (refType, refId) for the API call.
 * @param fetchFn Optional fetch function, defaults to global fetch.
 * @returns Promise resolving with the JSON response from the API.
 */
export async function deleteImage(
  imageId: string,
  refs: ImageEditRefs, // refs are in the body of the DELETE request in original code
  fetchFn: typeof fetch = fetch
): Promise<any> {
  // Original code expects JSON response
  const response = await fetchFn(`/api/images/${imageId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }, // Ensure API expects JSON body for DELETE
    body: JSON.stringify(refs)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Failed to delete image via API:', errorBody);
    throw new Error(`Failed to delete image: ${response.statusText}`);
  }
  return response.json(); // Original code does .then(res => res.json())
}

// ═══════════════════════
// X. IMAGE UPLOAD ORCHESTRATION
// ═══════════════════════

/**
 * Orchestrates the full image upload process: gets path, signs, uploads to Cloudinary,
 * processes response, extends metadata, and saves/updates the image record in the backend.
 * This function does NOT handle frontend state updates (e.g., upload queue status, image list updates).
 *
 * @param file The file to upload.
 * @param uploadRefs References for the upload (resource type, ID, org, project, imageToReplace).
 * @param extendedFeatureInfo Optional info for feature images (publish status, intent).
 * @param fetchFn Optional fetch function, defaults to global fetch.
 * @returns The saved/updated image data from the backend.
 */
export async function uploadAndProcessImage(
  file: File,
  uploadRefs: ImageUploadRefs,
  extendedFeatureInfo?: {
    isPublished: boolean;
    intent: Intent;
  },
  fetchFn: typeof fetch = fetch
): Promise<GetImageAPI> {
  // 1. Determine public path for Cloudinary
  const { folder, public_id } = getPublicPathCloudinaryImage(uploadRefs);
  const paramsToSign: ParamsToSign = uploadRefs.imageToReplace
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
  let imageData = getImageFromCloudinaryResponse(cloudinaryResponse);

  // 5. Extend image data with feature/hierarchical info
  extendFeatureImage(
    imageData,
    uploadRefs,
    extendedFeatureInfo ? { featureImage: extendedFeatureInfo } : undefined
  );
  extendImageWithResource(imageData, uploadRefs);

  // 6. Upsert image in the backend
  let savedImage: GetImageAPI;
  if (uploadRefs.imageToReplace) {
    savedImage = await updateImage(
      uploadRefs.imageToReplace.id,
      imageData as NewImageAPI,
      fetchFn
    );
  } else {
    savedImage = await createImage(imageData as NewImageAPI, fetchFn);
  }

  return savedImage;
}
