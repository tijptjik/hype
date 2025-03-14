/**
 * Image Management Module
 * ═══════════════════════
 *
 * Table of Contents
 * ────────────────
 * 1. Types & Imports
 * 2. Configuration
 * 3. State Management
 *    - Image Sets
 *    - Intent Context
 * 4. Core Image Operations
 *    - Sorting & Selection
 *    - Navigation
 *    - Intent Management
 *    - Publication Control
 * 5. File Operations
 *    - Upload Management
 *    - Download Handling
 *    - Delete Handling
 * 6. Metadata Handling
 *    - EXIF Data Processing
 *    - Coordinate Processing
 * 7. URL Management
 * 8. Utility Functions
 */

// ═══════════════════════
// 1. TYPES & IMPORTS
// ═══════════════════════
import { SvelteSet } from 'svelte/reactivity';
import { error } from '@sveltejs/kit';
import Coordinates from 'coordinate-parser';
import { capitalizeFirstLetter } from '$lib';
import type {
  ImageDB,
  GetImageAPI,
  NewImageAPI,
  Intent,
  ImageUploadRefs as Refs,
  ImageUploadState,
  LoadStatus,
  UploadStatus,
  ImageEditRefs as EditRefs
} from '$lib/types';
import { featureImage } from '$lib/db/schema';

// ═══════════════════════
// 2. CONFIGURATION
// ═══════════════════════
/** Order of image intents for sorting purposes */
export const intentOrder = [
  'undefined',
  'canonical',
  'closeUp',
  'context',
  'general',
  'evidence'
];

// ═══════════════════════
// 3. STATE MANAGEMENT
// ═══════════════════════
/** Global image sets state management */
export const imageSets = $state({
  activeImage: null as GetImageAPI | null,
  activeImagePreview: null as string | null,
  images: [] as GetImageAPI[],
  // Track loading states for all images
  imageLoadStates: {} as Record<string, LoadStatus>,
  // Track upload states for all images
  imageUploadStates: {} as Record<string, UploadStatus>,
  // Track upload states for gallery uploads
  uploadQueue: [] as ImageUploadState[],
  standaloneUploadState: 'idle' as UploadStatus,
  imagesPendingConfirmation: new SvelteSet<string>(),
  imagesToDelete: new SvelteSet<string>(),
  rejectedImages: [] as File[]
});

/** Intent context state management */
export const intentContext = $state({
  id: null as string | null,
  ref: null as HTMLDivElement | null
});

// Add derived states for active image
const activeImageState = $derived({
  get isLoading() {
    if (!imageSets.activeImage) return false;
    const isLoading = imageSets.imageLoadStates[imageSets.activeImage.id] === 'loading';
    return isLoading;
  },
  get isLoaded() {
    if (!imageSets.activeImage) return false;
    const isLoaded = imageSets.imageLoadStates[imageSets.activeImage.id] === 'loaded';
    return isLoaded;
  },
  get isUploading() {
    const isUploading = imageSets.standaloneUploadState === 'uploading';
    return isUploading;
  },
  get preview() {
    return imageSets.activeImagePreview;
  }
});

export let getActiveImageState = () => {
  return activeImageState;
};

// Add helper functions to manage states
export const setImageLoadState = (imageId: string, state: LoadStatus) => {
  imageSets.imageLoadStates[imageId] = state;
};

export const setImageUploadState = (imageId: string, state: UploadStatus) => {
  imageSets.imageUploadStates[imageId] = state;
};

export const setStandaloneUploadState = (state: UploadStatus, imageId?: string) => {
  imageSets.standaloneUploadState = state;

  if (state === 'uploading') {
    // Reset states when starting new upload
    resetImageStates();
  }

  if (imageId) {
    imageSets.imageUploadStates[imageId] = state;
  }
};

export const setStandaloneLoadState = (state: UploadStatus, imageId?: string) => {
  imageSets.standaloneUploadState = state;
  if (imageId) {
    imageSets.imageUploadStates[imageId] = state;
  }
};

// Add a reset function for image states
export const resetImageStates = (imageId?: string) => {
  if (imageId) {
    // Reset specific image state
    delete imageSets.imageLoadStates[imageId];
  } else {
    // Reset all states
    imageSets.imageLoadStates = {};
  }
};

// ═══════════════════════
// 4. CORE IMAGE OPERATIONS
// ═══════════════════════
/** Sort images based on publication status, intent, and creation date */
export const sortImages = (): void => {
  imageSets.images.sort((a, b) => {
    // First sort by publication status
    if (a.isPublished !== b.isPublished) {
      return a.isPublished ? -1 : 1;
    }
    // Then sort by intent order
    const intentCompare = intentOrder.indexOf(a.intent) - intentOrder.indexOf(b.intent);
    if (intentCompare !== 0) {
      return intentCompare;
    }
    // Finally, sort by creation date (newest first)
    return (
      new Date(b.createdAt as string).getTime() -
      new Date(a.createdAt as string).getTime()
    );
  });
};

/** Select an image as active */
export const selectActiveImage = (image: GetImageAPI) => {
  if (!image) return;
  imageSets.activeImage = image;
};

/** Navigate between images */
export const navigateImage = (e: Event, direction: 'prev' | 'next') => {
  e.preventDefault();
  e.stopPropagation();
  if (!imageSets.activeImage || !imageSets.images.length) return;

  const currentIndex = imageSets.images.findIndex(
    (img) => img.id === imageSets.activeImage?.id
  );
  if (currentIndex === -1) return;

  let newIndex: number;
  if (direction === 'prev') {
    newIndex = currentIndex === 0 ? imageSets.images.length - 1 : currentIndex - 1;
  } else {
    newIndex = currentIndex === imageSets.images.length - 1 ? 0 : currentIndex + 1;
  }

  imageSets.activeImage = imageSets.images[newIndex];
};

// Update the updateIntent function to handle canonical images
export const updateIntent = async (
  imageId: string,
  newIntent: Intent,
  refs: EditRefs
) => {
  try {
    // If trying to set as canonical, first check if another image is already canonical
    if (newIntent === 'canonical') {
      const currentCanonical = imageSets.images.find(
        (img) => img.id !== imageId && img.intent === 'canonical'
      );

      if (currentCanonical) {
        // First update the current canonical image to undefined
        const response = await fetch(`/api/images/${currentCanonical.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...refs,
            featureImage: {
              intent: 'undefined'
            }
          })
        });

        if (!response.ok) throw new Error('Failed to update previous canonical image');

        // Update local state for the previous canonical image
        imageSets.images = imageSets.images.map((img) =>
          img.id === currentCanonical.id ? { ...img, intent: 'undefined' } : img
        );
        sortImages();
      }
    }

    // Now update the current image
    const response = await fetch(`/api/images/${imageId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...refs,
        featureImage: {
          intent: newIntent
        }
      })
    });

    if (!response.ok) throw new Error('Failed to update intent');

    // Update local state for the current image
    imageSets.images = imageSets.images.map((img) =>
      img.id === imageId ? { ...img, intent: newIntent as Intent } : img
    );
    sortImages();
  } catch (error) {
    console.error('Failed to update intent:', error);
    // You might want to add error handling UI here
  } finally {
    intentContext.id = null;
    intentContext.ref = null;
  }
};

// HANDLERS :: PUBLISH TOGGLE
export const handlePublishToggle = async (refs: EditRefs) => {
  if (!imageSets.activeImage) return;

  try {
    await fetch(`/api/images/${imageSets.activeImage.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...refs,
        featureImage: {
          isPublished: !imageSets.activeImage.isPublished
        }
      })
    })
      .then((res) => res.json())
      .then((res) => {
        if (res?.success) {
          imageSets.activeImage!.isPublished = !imageSets.activeImage!.isPublished;
          sortImages();
        }
      })
      .catch((err) => {
        console.error('Failed to update publication state:', err);
        throw err;
      });
  } catch (err) {
    console.error('Failed to toggle publication:', err);
  }
};

// ═══════════════════════
// 5. FILE OPERATIONS
// ═══════════════════════
/** Handle file selection and upload */

// ═══════════════════════
// 5.1 FILE OPERATIONS :: UPLOAD
// ═══════════════════════

const refsToPublicRouter = (refs: Refs) => {
  // Organisation images are stored in
  // - /{organsation.code}/organsation.id
  // There can be only 1 image per organisation, so replace on upload
  //
  // Project images are stored in
  // - {organsation.code}/{project.code}/project.id
  // There can be only 1 image per project, so replace on upload

  // Feature images are stored in
  // - {organsation.code}/{project.code}/{image.publicId}
  // There can be multiple images per feature, so by default, we consider an upload to not replace the existing image and cloudinary will generate a new publicId.
  // However, if we do want to replace the existing image, we can set the publicId in the paramsToSign object to override the asset in Cloudinary.
  // Admins can drop images into the viewer to replace the existing image from the Feature Image section.

  // Task images are stored in
  // - {organsation.code}/{project.code}/{image.publicId}
  // There can be multiple images per task, however, these images are used in review and will often require postprocessing. So uploads against these items are considered replacements.
  // Admins can drop images into the task viewer to replace the existing image in the Review Queue.
  if (refs.resource === 'organisation' && refs.organisation) {
    return {
      folder: `/${refs.organisation.code}`,
      public_id: refs.entity
    };
  } else if (refs.resource === 'project' && refs.project) {
    return {
      folder: `/${refs.organisation.code}/${refs.project.code}`,
      public_id: refs.entity
    };
  } else if (refs.resource === 'feature' && refs.project && refs.imageToReplace) {
    return {
      folder: `/${refs.organisation.code}/${refs.project.code}`,
      public_id: refs.imageToReplace.publicId.split('/').pop()
    };
  } else if (refs.resource === 'feature' && refs.project) {
    return {
      folder: `/${refs.organisation.code}/${refs.project.code}`,
      public_id: null
    };
  } else {
    throw new Error('Invalid refs');
  }
};

export const handleFilesSelect = async (
  event: { detail: { acceptedFiles: File[]; fileRejections: File[] } },
  config: {
    refs: Refs;
    callback?: (savedImage: GetImageAPI) => void;
    onError?: () => void;
    isStandalone?: boolean;
  }
) => {
  const newFiles = event.detail.acceptedFiles.map((file) => ({
    file,
    status: 'uploading' as UploadStatus,
    retries: 0
  }));

  if (config.isStandalone && newFiles.length > 0) {
    // Reset states before setting new preview
    resetImageStates();
    const previewURL = URL.createObjectURL(newFiles[0].file);
    imageSets.activeImagePreview = previewURL;
  }

  // Add to upload queue if not standalone
  if (!config.isStandalone) {
    imageSets.uploadQueue = [...imageSets.uploadQueue, ...newFiles];
  }

  imageSets.rejectedImages = [
    ...imageSets.rejectedImages,
    ...event.detail.fileRejections
  ];

  try {
    // Process each file
    await Promise.all(
      newFiles.map(async (fileState) => {
        try {
          const savedImage = await handleUpload({
            fileState,
            refs: config.refs
          });

          if (savedImage) {
            // Update queue status if not standalone
            if (!config.isStandalone) {
              imageSets.uploadQueue = imageSets.uploadQueue.map((item) =>
                item.file === fileState.file ? { ...item, status: 'uploaded' } : item
              );
            }
            if (config.callback) {
              config.callback(savedImage);
            }
          }
        } catch (error) {
          console.error('Failed to upload file:', error);
          if (!config.isStandalone) {
            imageSets.uploadQueue = imageSets.uploadQueue.map((item) =>
              item.file === fileState.file ? { ...item, status: 'error' } : item
            );
          } else {
            URL.revokeObjectURL(imageSets.activeImagePreview!);
            imageSets.activeImagePreview = null;
          }
          if (config.onError) {
            config.onError();
          }
        }
      })
    );
  } catch (error) {
    console.error('Failed to process files:', error);
    if (config.onError) {
      config.onError();
    }
  }
};

/** Process individual file upload */
export const handleUpload = async (args: {
  fileState: ImageUploadState;
  refs: Refs;
  event?: { fetch: typeof fetch };
  featureImage?: {
    isPublished: boolean;
    intent: Intent;
  };
}) => {
  let { fileState, refs, event, featureImage } = args;
  const localFetch = event?.fetch ?? fetch;
  try {
    const { public_id, folder } = refsToPublicRouter(refs);
    let paramsToSign: ParamsToSign = { folder };

    // If we are replacing an image, set the publicId to override the asset in Cloudinary
    if (refs.imageToReplace) {
      paramsToSign.public_id = public_id;
    }
    // Prepare the image data for our database
    let imageData = await uploadToCloudinary({
      file: fileState.file,
      paramsToSign,
      refs,
      event
    });

    if (featureImage) {
      imageData.featureImage = {
        featureId: refs.entity,
        intent: featureImage.intent,
        isPublished: featureImage.isPublished
      };
    }

    // Set initial upload state
    setImageUploadState(imageData!.id!, 'uploading');

    let savedImage: GetImageAPI;

    // Save to database
    if (refs.imageToReplace) {
      savedImage = await localFetch(`/api/images/${refs.imageToReplace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imageData)
      })
        .then((res) => res.json())
        .then(({ image: updatedImage }) => {
          // TODO INSPECT IF THIS IS CORRECT
          imageSets.images = imageSets.images.map((img) =>
            img.id === refs.imageToReplace?.id ? updatedImage : img
          );
          setImageUploadState(updatedImage.id, 'uploaded');
          return updatedImage;
        })
        .catch((err) => {
          console.error('Failed to save image to database:', err);
          throw err;
        });
    } else {
      savedImage = await localFetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imageData)
      })
        .then((res) => res.json())
        .then((savedImage) => {
          setImageUploadState(savedImage.id, 'uploaded');
          imageSets.images = [savedImage, ...imageSets.images];
          return savedImage;
        });
    }

    // Only after successful save and image state updates
    if (savedImage) {
      sortImages();
      imageSets.activeImage = savedImage;
      // Now we can safely remove from upload queue
      imageSets.uploadQueue = imageSets.uploadQueue.filter(
        (item) => item.file !== fileState.file
      );
      return savedImage;
    }
  } catch (error) {
    console.error('Failed to process image:', error);
    if (refs.imageToReplace) {
      setImageUploadState(refs.imageToReplace.id, 'error');
    }
    throw error;
  }
};

export const uploadToCloudinary = async (uploadConfig: {
  file: File;
  paramsToSign: ParamsToSign;
  refs: Refs;
  intent?: string;
  isPublished?: boolean;
  event?: { fetch: typeof fetch };
}): Promise<NewImageAPI | undefined> => {
  const {
    file,
    paramsToSign,
    refs,
    intent = 'undefined',
    isPublished = true,
    event
  } = uploadConfig;
  let media_metadata = 'true';

  const localFetch = event?.fetch ?? fetch;

  try {
    const signData = await localFetch('/api/cloudinary', {
      method: 'POST',
      body: JSON.stringify({
        paramsToSign: {
          ...paramsToSign,
          media_metadata: 'true'
        }
      })
    }).then((res) => res.json());

    const url = getUploadURL(signData.cloudname);
    const formData = new FormData();

    formData.append('file', file);
    formData.append('folder', paramsToSign.folder);
    formData.append('api_key', signData.apikey);
    formData.append('timestamp', signData.timestamp);
    formData.append('signature', signData.signature);
    formData.append('media_metadata', media_metadata);

    if (paramsToSign.public_id) {
      formData.append('public_id', paramsToSign.public_id);
    }

    // Upload to Cloudinary
    let res = await localFetch(url, {
      method: 'POST',
      body: formData
    })
      .then((res) => res.json())
      .then((res) => imageFromCloudinaryResponse(res, refs, intent, isPublished));
    return res;
  } catch (error) {
    console.error('Failed to upload image to Cloudinary:', error);
    return null;
  }
};

/** Retry failed uploads */
export const retryUpload = (args: { fileState: ImageUploadState; refs: Refs }) => {
  let { fileState, refs } = args;
  imageSets.uploadQueue = imageSets.uploadQueue.map((item) =>
    item.file === fileState.file
      ? { ...item, status: 'uploading' as UploadStatus, retries: item.retries + 1 }
      : item
  );
  handleUpload(args);
};

// ═══════════════════════
// 5.2 FILE OPERATIONS :: DOWNLOAD
// ═══════════════════════

/** Download image file */
export const downloadImage = async (
  e: Event,
  image: GetImageAPI = imageSets.activeImage!
) => {
  e.preventDefault();
  e.stopPropagation();

  if (!image) return;
  let downloadUrl = '';

  if (image.cdn.toLowerCase() === 'cloudinary') {
    downloadUrl = getURLfromImage({ image, raw: true });
  } else {
    throw new Error('Unsupported CDN');
  }

  try {
    const response = await fetch(downloadUrl);
    const contentType = response.headers.get('content-type');
    const extension = contentType ? `.${contentType.split('/')[1]}` : '';
    const filename = `${image.publicId.split('/').pop()}${extension}`;
    const blob = await response.blob();

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  } catch (err) {
    console.error('Failed to download image:', err);
  }
};

export const getUploadURL = (cloudname: string) => {
  return `https://api.cloudinary.com/v1_1/${cloudname}/auto/upload`;
};

type ParamsToSign = {
  folder: string;
  public_id?: string | null;
};

export const imageFromCloudinaryResponse = (
  response: any,
  refs: Refs,
  intent: string = 'undefined',
  isPublished: boolean = true
) => {
  let image: NewImageAPI = {
    cdn: 'cloudinary' as const,
    env: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
    cdnId: response.asset_id,
    publicId: response.public_id,
    version: response.version,
    originalFilename: response.original_filename,
    originalExtension: response.format,
    originalWidth: response.width,
    originalHeight: response.height,
    // Metadata
    metadata: response.image_metadata,
    cameraModel: toCameraModel(response.image_metadata),
    capturedAt: toCapturedAt(response.image_metadata),
    credit: toCredit(response.image_metadata),
    ...toCoordinates(response.image_metadata)
  };
  // RELATED ENTITY
  if (refs.resource == 'feature') {
    image.featureImage = refs.imageToReplace
      ? {
          featureId: refs.imageToReplace.featureId,
          intent: refs.imageToReplace.intent,
          isPublished: refs.imageToReplace.isPublished
        }
      : {
          featureId: refs.entity,
          intent: intent as Intent,
          isPublished: isPublished
        };
  }
  if (
    refs.resource == 'project' ||
    refs.resource == 'organisation' ||
    refs.resource == 'feature'
  ) {
    image.refType = refs.resource;
    image.refId = refs.entity;
  } else {
    console.warn('IMAGE FELL THROUGH THE RABBIT HOLE');
  }
  return image;
};

// ═══════════════════════
// 5.3 FILE OPERATIONS :: DELETE
// ═══════════════════════

export const handleDelete = (e: Event, image: GetImageAPI, refs: Refs) => {
  e.preventDefault();
  e.stopPropagation();
  // imageSets.imagesPendingConfirmation = new Set(
  //   imageSets.imagesPendingConfirmation
  // ).add(image.id);
  imageSets.imagesPendingConfirmation.add(image.id);
};

export const cancelDelete = (e: Event, image: GetImageAPI) => {
  e.preventDefault();
  e.stopPropagation();
  imageSets.imagesPendingConfirmation.delete(image.id);
};

// Update the confirmDelete function
export const confirmDelete = async (e: Event, image: GetImageAPI, refs: EditRefs) => {
  e.preventDefault();
  e.stopPropagation();

  imageSets.imagesToDelete.add(image.id);

  try {
    await fetch(`/api/images/${image.id}`, {
      method: 'DELETE',
      body: JSON.stringify(refs)
    })
      .then((res) => res.json())
      .catch((err) => {
        console.error('Failed to delete image:', err);
        throw err;
      });

    // Only filter images after successful deletion
    imageSets.images = imageSets.images.filter((img) => img.id !== image.id);
    // Select the next image
    imageSets.activeImage = imageSets.images[0];
  } catch (error) {
    console.error('Failed to delete image:', error);
    // Show error toast or notification
  } finally {
    imageSets.imagesPendingConfirmation.delete(image.id);
    imageSets.imagesToDelete.delete(image.id);
  }
};

// ═══════════════════════
// 6. METADATA HANDLING
// ═══════════════════════
/** Retrieve image metadata from CDN */
// export const getMetadataOrError = async (publicId: string, cdn: string = 'cloudinary') => {
//   if (cdn === 'cloudinary') {
//     const url = `https://${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}@  api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image/upload/${publicId}?media_metadata=1`;
//     const response = await fetch(url);
//     const data = await response.json();
//     return data;
//   } else {
//     return error(400, 'CDN Not Supported');
//   }
// };

/** Convert metadata to coordinates */
export const toCoordinates = (
  metadata: any
): { latitude: string | undefined; longitude: string | undefined } => {
  // "GPSLatitude": "51 deg 30' 14.78\" N",
  // "GPSLongitude": "0 deg 4' 28.47\" W",
  try {
    console.debug('COORDINATES :: GIVEN', metadata.GPSLatitude, metadata.GPSLongitude);
    console.debug(
      'COORDINATES :: PREPARED',
      `${metadata.GPSLatitude.replace(' deg', '°')} ${metadata.GPSLongitude.replace(' deg', '°')}`
    );
    const coordinates = new Coordinates(
      `${metadata.GPSLatitude.replace(' deg', '°')} ${metadata.GPSLongitude.replace(' deg', '°')}`
    );
    console.debug(
      'COORDINATES :: PARSED',
      coordinates.getLatitude(),
      coordinates.getLongitude()
    );
    return {
      latitude: coordinates.getLatitude().toString(),
      longitude: coordinates.getLongitude().toString()
    };
  } catch (error) {
    return {
      latitude: undefined,
      longitude: undefined
    };
  }
};

/** Extract capture date from metadata */
export const toCapturedAt = (metadata: Record<string, string>): string => {
  // Helper to convert EXIF date format "YYYY:MM:DD HH:MM:SS" to ISO format
  const parseExifDate = (dateStr: string): string => {
    // Replace EXIF date separator ':' with standard '-' for YYYY-MM-DD
    const normalized = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    return new Date(normalized).toISOString();
  };

  // Try primary date fields first
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

  // Try fallback to separate date/time fields
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

  // Default to current timestamp in ISO format
  return new Date().toISOString();
};

/** Extract camera model from metadata */
export const toCameraModel = (metadata: Record<string, string>): string | undefined => {
  const make = capitalizeFirstLetter(metadata.Make) ?? '';
  const model = capitalizeFirstLetter(metadata.Model) ?? '';
  let hasCamera = model.includes(make);
  return hasCamera ? model.trim() : `${make} ${model}`.trim() || undefined;
};

/** Extract credit information from metadata */
export const toCredit = (metadata: Record<string, string>): string | undefined => {
  let possibleFields = ['CopyrightNotice', 'Credit', 'By-line'];
  for (let field of possibleFields) {
    if (metadata[field]) {
      return metadata[field];
    }
  }
  return undefined;
};

// ═══════════════════════
// 7. URL MANAGEMENT
// ═══════════════════════
/** Generate CDN URL for image */
export const getURLfromImage = (opts: {
  image: ImageDB;
  transformation?: string;
  raw?: boolean;
  gravity?: string;
  quality?: string;
  format?: string;
}) => {
  let {
    image,
    transformation = 'c_fit,h_1000,w_1000',
    gravity = 'auto',
    format = 'auto',
    quality = 'auto',
    raw = false
  } = opts;

  transformation = `${transformation}/g_${gravity}/f_${format}/q_${quality}`;

  if (image.cdn === 'cloudinary') {
    return raw
      ? `https://res.cloudinary.com/${image.env}/image/upload/fl_attachment/${image.publicId}`
      : `https://res.cloudinary.com/${image.env}/image/upload/${transformation}/v${image.version}/${image.publicId}`;
  } else {
    return error(404, `Image CDN <code>${image.cdn}</code> not supported`);
  }
};
