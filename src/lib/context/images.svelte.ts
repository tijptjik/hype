// SVELTE
import { getContext, setContext } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import { error } from '@sveltejs/kit';
// UTILS
import Coordinates from 'coordinate-parser';
import { capitalizeFirstLetter } from '$lib';
// TYPES
import type { Writable } from 'svelte/store';
import type { QueryClient } from '@tanstack/svelte-query';
import type {
  ImageDB,
  GetImageAPI,
  NewImageAPI,
  Intent,
  ImageUploadRefs as Refs,
  ImageUploadState as ImageUpload,
  LoadStatus,
  UploadStatus,
  ImageEditRefs,
  ParamsToSign,
  ResourceType,
  Id,
  OrganisationDB,
  ProjectDB,
  ImageUploadRefs,
  Organisation,
  Project,
  ImagePatchAPI,
  ImageAPI,
  NewFeatureImage,
  NewFeatureImages
} from '$lib/types';
import { image } from '$lib/db/schema';

/**
 * Image Service
 * ═══════════════════════
 *
 * Table of Contents
 * ────────────────
 * 1. Configuration
 * 2. Service
 * 3. State Management
 *   - States
 *   - Derived
 *   - Accessors
 * 4. Navigation
 * 5. Uploads
 * 6. Patching
 * 7. Deletion
 * 8. Downloads
 * 9. Metadata Handling
 * 10. Paths
 * 11. Data Casting
 * 12. Utils
 * 13. Context Setup
 */

// ═══════════════════════
// 1. CONFIGURATION
// ═══════════════════════

const intentOrder = [
  'undefined',
  'canonical',
  'closeUp',
  'context',
  'general',
  'evidence'
] as const;

type ImageServiceMode = 'standalone' | 'gallery';
type ImageServiceState = {
  mode: ImageServiceMode;
  refType: ResourceType | null;
  refId: Id | null;
  refOrganisation: OrganisationDB | null;
  refProject: ProjectDB | null;
  uploadQueue: ImageUpload[];
  imageLoadStates: Record<string, LoadStatus>;
  activeImage: GetImageAPI | null;
  activeImagePreview: string | null;
  images: GetImageAPI[];
  pendingConfirmation: SvelteSet<string>;
  deletionQueue: SvelteSet<string>;
  rejected: File[];
};

// ═══════════════════════
// 2. SERVICE
// ═══════════════════════

export class ImageService {
  queryClient: QueryClient;

  constructor(
    queryClient: QueryClient,
    mode: ImageServiceMode = 'gallery',
    refType: ResourceType,
    refId: Id,
    refOrganisation?: OrganisationDB,
    refProject?: ProjectDB
  ) {
    this.queryClient = queryClient;
    this.state.mode = mode;
    this.state.refType = refType;
    this.state.refId = refId || null;
    this.state.refOrganisation = refOrganisation || null;
    this.state.refProject = refProject || null;
  }

  // ═══════════════════════
  // 3. STATE MANAGEMENT
  // ═══════════════════════

  // ═══════════════════════
  // 3.A STATES
  // ═══════════════════════

  state: ImageServiceState = $state({
    // Mode of the image service
    mode: 'gallery',
    // The type of resource the image is associated with
    refType: null,
    // The ID of the resource the image is associated with
    refId: null,
    // The organisation the image is ultimately associated with
    refOrganisation: null,
    // The project the image is ultimately associated with
    refProject: null,

    // CRUD :: CREATE

    // Queue of images to be uploaded
    uploadQueue: [] as ImageUpload[],
    // Rejected images
    rejected: [] as File[],

    // CRUD :: READ

    // Image to be shown in the viewer
    activeImage: null as GetImageAPI | null,
    // Preview of an uploaded image based on local file
    activeImagePreview: null as string | null,
    // Images related to the active resource (e.g. organisation, project, feature)
    images: [] as GetImageAPI[],
    // Load state of each image
    imageLoadStates: {} as Record<string, LoadStatus>,

    // CRUD :: DELETE

    // Ask user to confirm deletion of these images
    pendingConfirmation: new SvelteSet<string>(),
    // Queue of images to be deleted
    deletionQueue: new SvelteSet<string>()
  });

  // ═══════════════════════
  // 3.B DERIVED STATES
  // ═══════════════════════

  // Convert to class methods that can be used in derived computations
  private testActiveImageState(state: LoadStatus | UploadStatus) {
    if (!this.state.activeImage) return false;
    return this.state.imageLoadStates[this.state.activeImage.id] === state;
  }

  activeImageState = $derived({
    isLoaded: this.testActiveImageState('loaded'),
    isLoading: this.testActiveImageState('loading'),
    isUploading: this.testActiveImageState('uploading')
  });

  // ═══════════════════════
  // 3.C STATE ACCESSORS
  // ═══════════════════════

  // MODE

  setMode(mode: 'standalone' | 'gallery') {
    this.state.mode = mode;
  }

  // REFS

  setRefs(refs: ImageEditRefs) {
    this.state.refType = refs.refType;
    this.state.refId = refs.refId;
  }

  getRefs(): ImageEditRefs {
    return {
      refType: this.state.refType as ResourceType,
      refId: this.state.refId as Id
    };
  }

  getUploadRefs(imageToReplace?: GetImageAPI): ImageUploadRefs {
    return {
      resource: this.state.refType as ResourceType,
      entity: this.state.refId as Id,
      organisation: this.state.refOrganisation as Organisation,
      project: this.state.refProject as Project,
      ...(imageToReplace !== undefined ? { imageToReplace } : {})
    };
  }

  // IMAGE UPLOAD STATE

  setUploadQueue(uploadQueue: ImageUpload[]) {
    this.state.uploadQueue = uploadQueue;
  }

  addToUploadQueue(files: File[], imageToReplace?: GetImageAPI) {
    this.state.uploadQueue.push(
      ...files.map(
        (file) =>
          ({ file, status: 'uploading', retries: 0, imageToReplace }) as ImageUpload
      )
    );
  }

  addToRejected(files: File[]) {
    this.state.rejected.push(...files);
  }

  removeFromUploadQueue(file: File) {
    this.setUploadQueue(this.state.uploadQueue.filter((item) => item.file !== file));
  }

  setImageUploadStatus(fileObject: ImageUpload, status: UploadStatus) {
    this.state.uploadQueue.find(
      (item) => item.file.name === fileObject.file.name
    )!.status = status;
  }

  setUploadToRetry(fileObject: ImageUpload) {
    this.setUploadQueue(
      this.state.uploadQueue.map((item) =>
        item.file === fileObject.file
          ? { ...item, status: 'uploading', retries: item.retries + 1 }
          : item
      )
    );
  }

  addToPendingConfirmation(imageId: string) {
    this.state.pendingConfirmation.add(imageId);
  }

  removeFromPendingConfirmation(imageId: string) {
    this.state.pendingConfirmation.delete(imageId);
  }

  addToDeletionQueue(imageId: string) {
    this.state.deletionQueue.add(imageId);
  }

  removeFromDeletionQueue(imageId: string) {
    this.state.deletionQueue.delete(imageId);
  }

  // IMAGE LOAD STATE

  getImages() {
    return this.state.images;
  }

  setImages(images: GetImageAPI[]) {
    this.state.images = images;
    this.sortImages();
  }

  setImageLoadState(imageId: string, state: LoadStatus) {
    this.state.imageLoadStates[imageId] = state;
  }

  resetImageState(imageId?: string) {
    if (imageId) {
      delete this.state.imageLoadStates[imageId];
    } else {
      this.state.imageLoadStates = {};
    }
  }

  removeImage(imageId: string) {
    this.state.images = this.state.images.filter((img) => img.id !== imageId);
  }

  // ACTIVE IMAGE

  getActiveImage() {
    return this.state.activeImage;
  }

  setActiveImage(image: GetImageAPI) {
    this.state.activeImage = image;
  }

  setActiveImageToFirst() {
    if (!this.state.images.length) {
      this.state.activeImage = null;
    } else {
      this.setActiveImage(this.state.images[0]);
    }
  }

  setForActiveImage(key: keyof GetImageAPI, value: any) {
    const activeImageId = this.getActiveImage()!.id;
    if (!activeImageId) return;
    this.setForImage(activeImageId, key, value);
  }

  toggleForActiveImage(key: keyof GetImageAPI) {
    const activeImageId = this.getActiveImage()!.id;
    if (!activeImageId) return;
    this.setForActiveImage(key, !this.getActiveImage()![key]);
  }

  setForImage(imageId: string, key: keyof GetImageAPI, value: any) {
    const image = this.getImages().find((img) => img.id === imageId);
    if (!image) return;
    image[key] = value as never;
  }

  // ═══════════════════════
  // 4. NAVIGATION
  // ═══════════════════════

  switchToImage(direction: 'prev' | 'next') {
    if (!this.state.activeImage || !this.state.images.length) return;

    const currentIndex = this.state.images.findIndex(
      (img) => img.id === this.state.activeImage?.id
    );
    if (currentIndex === -1) return;

    // Calculate the new index based on the direction
    // Supports wrapping around the end of the array
    const newIndex =
      direction === 'prev'
        ? currentIndex === 0
          ? this.state.images.length - 1
          : currentIndex - 1
        : currentIndex === this.state.images.length - 1
          ? 0
          : currentIndex + 1;

    this.setActiveImage(this.state.images[newIndex]);
  }

  // ═══════════════════════
  // 5. UPLOADS
  // ═══════════════════════

  async handleFilesSelect(
    acceptedFiles: File[],
    fileRejections: File[],
    config: {
      onLoad?: (savedImage: GetImageAPI) => void;
      onError?: () => void;
    },
    imageToReplace?: GetImageAPI
  ) {
    if (acceptedFiles.length > 1 && imageToReplace) {
      throw new Error('Cannot replace multiple images');
    }
    this.addToUploadQueue(acceptedFiles, imageToReplace);
    this.addToRejected(fileRejections);

    // if (this.state.mode === 'standalone' && newFiles.length > 0) {
    //   const previewURL = URL.createObjectURL(newFiles[0].file);
    //   this.state.activeImagePreview = previewURL;
    // }
    await this.processUploadQueue(config);
    // Sort images after all uploads have been processed
    this.sortImages();
  }

  private async processUploadQueue(config: {
    onLoad?: (savedImage: GetImageAPI) => void;
    onError?: () => void;
  }) {
    await Promise.all(
      this.state.uploadQueue
        .filter((item) => item.status === 'uploading')
        .map(async (fileObject) => {
          try {
            const savedImage = await this.upload({
              fileObject
            });

            if (savedImage) {
              this.setActiveImage(savedImage);

              if (config.onLoad) {
                config.onLoad(savedImage);
              }
            }
          } catch (error) {
            if (config.onError) {
              config.onError();
            }
          }
        })
    );
  }

  async upload(args: {
    fileObject: ImageUpload;
    event?: { fetch: typeof fetch };
    // featureImage?: {
    //   isPublished: boolean;
    //   intent: Intent;
    // };
  }) {
    // const { fileObject, event, featureImage } = args;
    const { fileObject, event } = args;
    const localFetch = event?.fetch ?? fetch;

    try {
      const { public_id, folder } = this.getPublicPath(fileObject.imageToReplace);
      const paramsToSign: ParamsToSign = fileObject.imageToReplace
        ? { folder, public_id }
        : { folder };
      const refs = this.getUploadRefs(fileObject.imageToReplace);

      let imageData = await this.uploadToCloudinary({
        file: fileObject.file,
        paramsToSign,
        refs,
        event
      });

      this.extendFeatureImage(imageData, refs);
      this.extendHierachicalResource(imageData, refs);

      //   if (featureImage) {
      // imageData.featureImage = {
      //   featureId: refs.entity,
      //   intent: featureImage.intent,
      //   isPublished: featureImage.isPublished
      // };
      //   }

      const savedImage = await this.upsertImage(
        fileObject,
        imageData as NewImageAPI,
        localFetch
      );

      if (savedImage) {
        this.removeFromUploadQueue(fileObject.file);
        return savedImage;
      }
    } catch (error) {
      console.error('Failed to process image:', error);
      this.setImageUploadStatus(fileObject, 'error');
      throw error;
    }
  }

  private async upsertImage(
    fileObject: ImageUpload,
    imageData: NewImageAPI,
    localFetch: typeof window.fetch
  ) {
    let savedImage: GetImageAPI;

    if (fileObject.imageToReplace) {
      savedImage = await this.updateExistingImage(fileObject, imageData, localFetch);
    } else {
      savedImage = await this.createNewImage(fileObject, imageData, localFetch);
    }
    return savedImage;
  }

  private async updateExistingImage(
    fileObject: ImageUpload,
    imageData: NewImageAPI,
    fetch: typeof window.fetch
  ) {
    this.setImageUploadStatus(fileObject, 'uploading');

    const response = await fetch(`/api/images/${fileObject.imageToReplace!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(imageData)
    });

    const { image: updatedImage } = await response.json();
    this.setImageUploadStatus(fileObject, 'uploaded');
    this.setImages(
      this.state.images.map((img) =>
        img.id === fileObject.imageToReplace!.id ? updatedImage : img
      )
    );
    return updatedImage;
  }

  private async createNewImage(
    fileObject: ImageUpload,
    imageData: NewImageAPI,
    fetch: typeof window.fetch
  ) {
    this.setImageUploadStatus(fileObject, 'uploading');

    const response = await fetch('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(imageData)
    });

    const savedImage = await response.json();
    this.setImageUploadStatus(fileObject, 'uploaded');
    this.setImages([savedImage, ...this.state.images]);
    return savedImage;
  }

  async uploadToCloudinary(uploadConfig: {
    file: File;
    paramsToSign: ParamsToSign;
    refs: Refs;
    event?: { fetch: typeof fetch };
  }): Promise<Partial<NewImageAPI>> {
    const { file, paramsToSign, refs, event } = uploadConfig;
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

      const url = this.getUploadURL(signData.cloudname);
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

      const response = await localFetch(url, {
        method: 'POST',
        body: formData
      });

      const cloudinaryResponse = await response.json();
      return this.imageFromCloudinaryResponse(cloudinaryResponse);
    } catch (error) {
      console.error('Failed to upload image to Cloudinary:', error);
      throw error;
    }
  }

  retryUpload(fileObject: ImageUpload) {
    this.setUploadToRetry(fileObject);
    this.upload({ fileObject });
  }

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

  // ═══════════════════════
  // 6. PATCHING
  // ═══════════════════════

  async handleSetIntent(imageId: string, newIntent: Intent) {
    try {
      // If trying to set as canonical, first check if another image is already canonical
      if (newIntent === 'canonical') {
        const currentCanonical = this.state.images.find(
          (img) => img.id !== imageId && img.intent === 'canonical'
        );

        // If another image is already canonical, update its intent to undefined
        if (currentCanonical) {
          await this.updateIntent(currentCanonical.id, 'undefined');
          this.setForImage(currentCanonical.id, 'intent', 'undefined');
        }
      }

      // Update the intent of the image
      await this.updateIntent(imageId, newIntent);
      this.setForImage(imageId, 'intent', newIntent);
    } catch (error) {
      console.error('Failed to update intent:', error);
    }
  }

  private async updateIntent(imageId: string, intent: Intent) {
    const response = await fetch(`/api/images/${imageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...this.getRefs(),
        featureImage: { intent }
      })
    });

    if (!response.ok) throw new Error('Failed to update intent');
  }

  async handlePublishToggle() {
    if (!this.state.activeImage) return;
    const data = await this.updatePublish();
    if (data?.success) {
      this.toggleForActiveImage('isPublished');
    }
  }

  private async updatePublish() {
    if (!this.state.activeImage) return;
    try {
      const response = await fetch(`/api/images/${this.getActiveImage()!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...this.getRefs(),
          featureImage: {
            isPublished: !this.getActiveImage()!.isPublished
          }
        })
      });
      return await response.json();
    } catch (err) {
      console.error('Failed to update publication:', err);
      return null;
    }
  }

  // ═══════════════════════
  // 7. DELETION
  // ═══════════════════════

  handlePreDelete(image: GetImageAPI) {
    this.addToPendingConfirmation(image.id);
  }

  handleCancelDelete(image: GetImageAPI) {
    this.removeFromPendingConfirmation(image.id);
  }

  handleConfirmDelete(image: GetImageAPI) {
    this.addToDeletionQueue(image.id);
    this.processDeletionQueue();
  }

  async processDeletionQueue() {
    await Promise.all(
      Array.from(this.state.deletionQueue).map(async (imageId) => {
        await this.delete(imageId, this.getRefs());
      })
    );
  }

  async delete(imageId: string, refs: ImageEditRefs) {
    try {
      await fetch(`/api/images/${imageId}`, {
        method: 'DELETE',
        body: JSON.stringify(refs)
      }).then((res) => res.json());

      this.removeImage(imageId);
      this.setActiveImageToFirst();
    } catch (error) {
      console.error('Failed to delete image:', error);
    } finally {
      this.removeFromPendingConfirmation(imageId);
      this.removeFromDeletionQueue(imageId);
      this.resetImageState(imageId);
    }
  }

  // ═══════════════════════
  // 8. DOWNLOADS
  // ═══════════════════════

  async downloadImage(
    image: GetImageAPI = this.state.activeImage!,
    flash: Writable<App.PageData['flash']>
  ) {
    if (!image) return;
    let downloadUrl = '';

    if (image.cdn.toLowerCase() === 'cloudinary') {
      downloadUrl = this.getURLfromImage({ image, raw: true });
    } else {
      throw new Error('Unsupported CDN');
    }

    try {
      const response = await fetch(downloadUrl);
      const contentType = response.headers.get('content-type');
      const extension = contentType ? `.${contentType.split('/')[1]}` : '';
      const filename = `${image.publicId.split('/').pop()}${extension}`;

      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = downloadUrl;
      link.target = '_blank';
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      flash.set({
        type: 'success',
        message: `Downloaded ${filename}`,
        options: { removeOnNavigate: false }
      });
    } catch (err) {
      flash.set({
        type: 'error',
        message: `Failed to download image: ${err}`
      });
    }
  }

  // ═══════════════════════
  // 9. METADATA HANDLING
  // ═══════════════════════

  toCoordinates(metadata: any): { latitude?: string; longitude?: string } {
    try {
      const coordinates = new Coordinates(
        `${metadata.GPSLatitude.replace(' deg', '°')} ${metadata.GPSLongitude.replace(' deg', '°')}`
      );
      return {
        latitude: coordinates.getLatitude().toString(),
        longitude: coordinates.getLongitude().toString()
      };
    } catch (error) {
      return { latitude: undefined, longitude: undefined };
    }
  }

  toCapturedAt(metadata: Record<string, string>): string {
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

  toCameraModel(metadata: Record<string, string>): string | undefined {
    const make = capitalizeFirstLetter(metadata.Make) ?? '';
    const model = capitalizeFirstLetter(metadata.Model) ?? '';
    const hasCamera = model.includes(make);
    return hasCamera ? model.trim() : `${make} ${model}`.trim() || undefined;
  }

  toCredit(metadata: Record<string, string>): string | undefined {
    const possibleFields = ['CopyrightNotice', 'Credit', 'By-line'];
    for (const field of possibleFields) {
      if (metadata[field]) {
        return metadata[field];
      }
    }
    return undefined;
  }

  // ═══════════════════════
  // 10. PATHS
  // ═══════════════════════

  getUploadURL(cloudname: string): string {
    return `https://api.cloudinary.com/v1_1/${cloudname}/auto/upload`;
  }

  getURLfromImage(opts: {
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

  private getPublicPath(imageToReplace?: GetImageAPI): {
    folder: string;
    public_id: string | null;
  } {
    const refs = this.getUploadRefs(imageToReplace);
    if (refs.resource === 'organisation' && refs.organisation) {
      return {
        folder: `/${refs.organisation.code}`,
        public_id: refs.entity
      };
    } else if (refs.resource === 'project' && refs.project) {
      return {
        folder: `/${refs.organisation!.code}/${refs.project!.code}`,
        public_id: refs.entity
      };
    } else if (refs.resource === 'feature' && refs.project && refs.imageToReplace) {
      return {
        folder: `/${refs.organisation!.code}/${refs.project!.code}`,
        public_id: refs.imageToReplace.publicId.split('/').pop()!
      };
    } else if (refs.resource === 'feature' && refs.project) {
      return {
        folder: `/${refs.organisation!.code}/${refs.project!.code}`,
        public_id: null
      };
    }
    throw new Error('Invalid refs');
  }

  // ═══════════════════════
  // 11. DATA CASTING
  // ═══════════════════════

  private imageFromCloudinaryResponse(response: any): Partial<NewImageAPI> {
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
      metadata: response.image_metadata,
      cameraModel: this.toCameraModel(response.image_metadata),
      capturedAt: this.toCapturedAt(response.image_metadata),
      credit: this.toCredit(response.image_metadata),
      ...this.toCoordinates(response.image_metadata)
    };
  }

  private extendFeatureImage(image: Partial<NewImageAPI>, refs: ImageUploadRefs) {
    if (refs.resource === 'feature') {
      image.featureImage = refs.imageToReplace
        ? {
            featureId: refs.imageToReplace.featureId,
            intent: refs.imageToReplace.intent,
            isPublished: refs.imageToReplace.isPublished
          }
        : ({
            featureId: refs.entity,
            intent: 'undefined',
            isPublished: true
          } as NewFeatureImages);
    }
  }

  private extendHierachicalResource(
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
  // 12. UTILS
  // ═══════════════════════

  private sortImages() {
    this.state.images.sort((a, b) => {
      if (a.isPublished !== b.isPublished) {
        return a.isPublished ? -1 : 1;
      }
      const intentCompare =
        intentOrder.indexOf(a.intent) - intentOrder.indexOf(b.intent);
      if (intentCompare !== 0) {
        return intentCompare;
      }
      return (
        new Date(b.createdAt as string).getTime() -
        new Date(a.createdAt as string).getTime()
      );
    });
  }
}

// ═══════════════════════
// 13. SERVICE SETUP
// ═══════════════════════

const IMAGE_STATE_KEY = Symbol('IMAGE_STATE_KEY');

export const setImageService = (
  queryClient: QueryClient,
  mode: ImageServiceMode = 'gallery',
  refType: ResourceType,
  refId: Id,
  refOrganisation?: OrganisationDB,
  refProject?: ProjectDB
) =>
  setContext(
    IMAGE_STATE_KEY,
    new ImageService(queryClient, mode, refType, refId, refOrganisation, refProject)
  );

export const getImageService = (): ImageService => getContext(IMAGE_STATE_KEY);
