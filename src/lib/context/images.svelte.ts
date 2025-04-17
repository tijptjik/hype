// SVELTE
import { getContext, setContext } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import { error } from '@sveltejs/kit';
// UTILS
import Coordinates from 'coordinate-parser';
import { capitalizeFirstLetter } from '$lib';
// TYPES
import type { Writable } from 'svelte/store';
// import type { QueryClient } from '@tanstack/svelte-query';
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
  NewFeatureImages,
  ImageUploadState
} from '$lib/types';
import { HierarchicalResource } from '$lib/types';
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

export const intentOrder = [
  'undefined',
  'canonical',
  'closeUp',
  'context',
  'general',
  'evidence'
] as const;

export type ImageServiceMode = 'standalone' | 'gallery';
type ImageServiceState = {
  mode: ImageServiceMode;
  refType: ResourceType | null;
  refId: Id | null;
  refOrganisation: OrganisationDB | null;
  refProject: ProjectDB | null;
  uploadQueue: ImageUpload[];
  loadStatus: Record<string, LoadStatus>;
  activeId: string | null;
  images: (GetImageAPI & { preview?: string })[];
  pendingConfirmation: SvelteSet<string>;
  deletionQueue: SvelteSet<string>;
  rejected: File[];
  thumbnailLoadStatus: Record<string, LoadStatus>;
};

type ImageServiceOptions = {
  mode: ImageServiceMode;
  isAdminMode: boolean;
  refType: ResourceType;
  refId: Id;
  refOrganisation?: OrganisationDB;
  refProject?: ProjectDB;
  image?: GetImageAPI;
};

// ═══════════════════════
// 2. SERVICE
// ═══════════════════════

export class ImageService {
  //   queryClient: QueryClient;
  isAdminMode: boolean = false;

  constructor(
    // queryClient: QueryClient,
    mode: ImageServiceMode = 'gallery',
    isAdminMode: boolean = false,
    refType: ResourceType,
    refId: Id,
    refOrganisation?: OrganisationDB,
    refProject?: ProjectDB,
    image?: GetImageAPI
  ) {
    this.setContext({
      mode,
      isAdminMode,
      refType,
      refId,
      refOrganisation,
      refProject,
      image
    });
  }

  async setContext(options: ImageServiceOptions) {
    // this.queryClient = queryClient;
    this.state.mode = options.mode;
    this.isAdminMode = options.isAdminMode;
    this.state.refType = options.refType;
    this.state.refId = options.refId || null;
    this.state.refOrganisation = options.refOrganisation || null;
    this.state.refProject = options.refProject || null;

    if (options.mode === 'standalone' && options.image) {
      this.setImages([options.image]);
      console.log('SETTING FROM SETCONTEXT', options.image.id);
      this.setLoadStatus(options.image.id, 'loading');
    } else if (options.mode === 'standalone' && !options.image) {
      this.setImages([]);
    } else if (options.mode === 'gallery') {
      await this.refreshImages();
    }
    this.setActiveImageToFirst();
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

    // Images related to the active resource (e.g. organisation, project, feature)
    images: [] as GetImageAPI[],
    // The ID of the active image
    activeId: null as string | null,
    // Load state of each image
    loadStatus: {} as Record<string, LoadStatus>,
    // LoadStatus of Thumbnail
    thumbnailLoadStatus: {} as Record<string, LoadStatus>,

    // CRUD :: DELETE

    // Ask user to confirm deletion of these images
    pendingConfirmation: new SvelteSet<string>(),
    // Queue of images to be deleted
    deletionQueue: new SvelteSet<string>()
  });

  // ═══════════════════════
  // 3.B DERIVED STATES
  // ═══════════════════════

  // New derived state for activeImage
  activeImage = $derived(
    this.state.images.find((image) => this.state.activeId === image.id)
  );

  activePreview = $derived(
    this.state.uploadQueue.find((upload) => upload.status !== 'invalidated')
  );

  imagesQueryKey = $derived(['images', this.state.refType, this.state.refId]);

  isImagesLoading = $derived(
    this.state.images.length > 0 &&
      this.state.images.every((image) => this.state.loadStatus[image.id] === 'loading')
  );

  isReplacementStatus(imageId: string, status: UploadStatus) {
    return this.state.uploadQueue.some(
      (upload) => upload.imageToReplace?.id === imageId && upload.status === status
    );
  }

  determineViewerState = () => {
    console.log('[ImageService] Determining viewer state');
    console.log('[ImageService] Active image:', this.activeImage?.id);
    console.log('[ImageService] Load statuses:', this.state.loadStatus);
    console.log('[ImageService] Upload queue:', this.state.uploadQueue);

    if (
      this.activeImage &&
      this.isReplacementStatus(this.activeImage.id, 'uploading')
    ) {
      console.log('[ImageService] State: previewReplacement - Image being replaced');
      return 'previewReplacement';
    } else if (
      this.activeImage &&
      this.isReplacementStatus(this.activeImage.id, 'uploaded') &&
      this.getLoadStatus(this.activeImage.id) !== 'loaded'
    ) {
      console.log(
        '[ImageService] State: transition - Replacement uploaded, waiting for load'
      );
      return 'transition';
    } else if (
      this.activeImage &&
      this.getLoadStatus(this.activeImage.id) === 'loading'
    ) {
      console.log('[ImageService] State: loading - Image loading');
      return 'loading';
    } else if (
      this.activeImage &&
      this.getLoadStatus(this.activeImage.id) === 'loaded'
    ) {
      console.log('[ImageService] State: loaded - Image loaded');
      return 'loaded';
    } else if (this.activePreview) {
      console.log('[ImageService] State: previewUploading - New image uploading');
      return 'previewUploading';
    } else {
      console.log('[ImageService] State: empty - No image or preview');
      return 'empty';
    }
  };

  viewerState = $derived.by(this.determineViewerState);

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

  getUploadQueue() {
    return this.state.uploadQueue;
  }

  setUploadQueue(uploadQueue: ImageUpload[]) {
    this.state.uploadQueue = uploadQueue;
  }

  addToUploadQueue(files: File[], imageToReplace?: GetImageAPI) {
    this.state.uploadQueue.push(
      ...files.map(
        (file) =>
          ({
            file,
            status: 'uploading',
            retries: 0,
            imageToReplace,
            preview: URL.createObjectURL(file)
          }) as ImageUpload
      )
    );
    files.forEach((file) => {
      const replacingImage = this.state.images.find(
        (image) => image.id === imageToReplace?.id
      );
      if (replacingImage) {
        replacingImage.preview = URL.createObjectURL(file);
        console.log(
          '[ImageService] Added to upload queue:',
          file.name,
          this.state.images
        );
      }
    });
  }

  addToRejected(files: File[]) {
    this.state.rejected.push(...files);
  }

  removeFromUploadQueue(file: File) {
    this.setUploadQueue(this.state.uploadQueue.filter((item) => item.file !== file));
  }

  setUploadStatus(fileObject: ImageUpload, status: UploadStatus) {
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

  pendingConfirmationHas(imageId: string) {
    return this.state.pendingConfirmation.has(imageId);
  }

  addToPendingConfirmation(imageId: string) {
    this.state.pendingConfirmation.add(imageId);
  }

  removeFromPendingConfirmation(imageId: string) {
    this.state.pendingConfirmation.delete(imageId);
  }

  resetPendingConfirmation() {
    this.state.pendingConfirmation = new SvelteSet<string>();
  }

  addToDeletionQueue(imageId: string) {
    this.state.deletionQueue.add(imageId);
  }

  deletionQueueHas(imageId: string) {
    return this.state.deletionQueue.has(imageId);
  }

  removeFromDeletionQueue(imageId: string) {
    this.state.deletionQueue.delete(imageId);
  }

  // IMAGE LOAD STATE

  getImages() {
    return this.state.images;
  }

  getImage(imageId: string) {
    return this.state.images.find((img) => img.id === imageId);
  }

  setImages(images: (GetImageAPI & { preview: string })[]) {
    this.state.images = images;
    this.sortImages();
  }

  setLoadStatus(imageId: string, status: LoadStatus) {
    // Guard against redundant updates
    if (this.state.loadStatus[imageId] === status) {
      console.log(
        '[ImageService] Skipping redundant status update for',
        imageId,
        status
      );
      return;
    }

    console.log('[ImageService] Setting load status for', imageId, 'to', status);
    console.log('[ImageService] Previous status:', this.state.loadStatus[imageId]);
    console.log('[ImageService] Current upload queue:', this.state.uploadQueue);

    if (status === 'loaded') {
      console.log(
        '[ImageService] Image',
        imageId,
        'marked as loaded, checking for replacement uploads'
      );

      // Only invalidate the upload queue if we're not in a replacement process
      // or if the replacement has been completed
      const replacementUpload = this.state.uploadQueue.find(
        (upload) => upload.imageToReplace?.id === imageId
      );

      if (replacementUpload?.status === 'uploaded') {
        console.log(
          '[ImageService] Invalidating completed replacement upload for',
          imageId
        );

        this.state.uploadQueue = this.state.uploadQueue
          .map((upload) => {
            if (upload.imageToReplace?.id === imageId) {
              URL.revokeObjectURL(upload.preview);
              return { ...upload, status: 'invalidated' as UploadStatus };
            }
            return upload;
          })
          .filter((upload) => upload.status !== 'invalidated');
      }
    }

    this.state.loadStatus[imageId] = status;
    console.log('[ImageService] New load statuses:', this.state.loadStatus);
  }

  getLoadStatus(imageId: string) {
    return this.state.loadStatus[imageId];
  }

  getLoadStatuses() {
    return this.state.loadStatus;
  }

  resetLoadStatus(imageId?: string) {
    if (imageId) {
      delete this.state.loadStatus[imageId];
    } else {
      this.state.loadStatus = {};
    }
  }

  setThumbnailLoadStatus(imageId: string, status: LoadStatus) {
    this.state.thumbnailLoadStatus[imageId] = status;
  }

  getThumbnailLoadStatus(imageId: string) {
    return this.state.thumbnailLoadStatus[imageId];
  }

  resetThumbnailLoadStatus(imageId?: string) {
    if (imageId) {
      delete this.state.thumbnailLoadStatus[imageId];
    } else {
      this.state.thumbnailLoadStatus = {};
    }
  }

  removeImage(imageId: string) {
    this.state.images = this.state.images.filter((img) => img.id !== imageId);
  }

  // ACTIVE IMAGE

  // New method to set active status
  setActiveStatus(imageId: string) {
    this.state.activeId = imageId;
  }

  setActiveImage(image: GetImageAPI) {
    if (!image) return;
    this.state.activeId = image.id;
  }

  resetActiveImage() {
    this.state.activeId = null;
  }

  setActiveImageToFirst() {
    if (this.state.images.length) {
      this.setActiveImage(this.state.images[0]);
    } else {
      this.resetActiveImage();
    }
  }

  setForActiveImage(key: keyof GetImageAPI, value: any) {
    if (!this.activeImage) return;
    this.setForImage(this.activeImage.id, key, value);
  }

  toggleForActiveImage(key: keyof GetImageAPI) {
    if (!this.activeImage) return;
    this.setForImage(this.activeImage.id, key, !this.activeImage[key]);
  }

  setForImage(imageId: string, key: keyof GetImageAPI, value: any) {
    const image = this.getImage(imageId);
    if (!image) return;
    image[key] = value as never;
  }

  isImageBeingReplaced(imageId: string): boolean {
    return this.state.uploadQueue.some(
      (upload) => upload.imageToReplace?.id === imageId
    );
  }

  getReplacementUpload(imageId: string): ImageUpload | undefined {
    return this.state.uploadQueue.find(
      (upload) => upload.imageToReplace?.id === imageId
    );
  }

  // ═══════════════════════
  // 4. QUERYING
  // ═══════════════════════

  async refreshImages() {
    this.setImages(
      //   await this.queryClient.fetchQuery({
      // queryKey: this.imagesQueryKey,
      // queryFn: () => this.imagesQueryFn
      //   })
      await this.imagesQueryFn()
    );
  }

  imagesQueryFn = async () => {
    const url = this.buildApiUrl('image');
    return this.fetchOrThrow<(GetImageAPI & { preview: string })[]>(url);
  };

  private async fetchOrThrow<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    return (await response.json()) as T;
  }

  // Helper method to build API URLs with filters
  private buildApiUrl(resource: string): string {
    const path = 'images';
    const params = new URLSearchParams();

    // Add isAdminView filter by default
    params.append('isAdminView', 'true');
    if (this.state.refType === HierarchicalResource.feature) {
      params.append('featureId', this.state.refId as Id);
    }

    return `/api/${path}?${params.toString()}`;
  }

  // ═══════════════════════
  // 4. NAVIGATION
  // ═══════════════════════

  switchToImage(e: MouseEvent, direction: 'prev' | 'next') {
    e.preventDefault();
    if (!this.state.images.length) return;

    const currentIndex = this.state.images.findIndex(
      (img) => this.state.activeId === img.id
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
      onSuccess?: (savedImage: GetImageAPI) => void;
      onError?: () => void;
    } = {},
    imageToReplace?: GetImageAPI
  ) {
    if (acceptedFiles.length > 1 && imageToReplace) {
      throw new Error('Cannot replace multiple images');
    }

    // Add to upload queue
    this.addToUploadQueue(acceptedFiles, imageToReplace);
    this.addToRejected(fileRejections);

    if (imageToReplace) {
      this.resetLoadStatus(imageToReplace.id);
    }

    await this.processUploadQueue(config);
    this.sortImages();

    // Only set active image to first if we're not replacing
    if (!imageToReplace) {
      this.setActiveImageToFirst();
    }
  }

  private async processUploadQueue(config: {
    onSuccess?: (savedImage: GetImageAPI) => void;
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
              if (config.onSuccess) {
                config.onSuccess(savedImage);
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
    extended?: {
      featureImage?: {
        isPublished: boolean;
        intent: Intent;
      };
    };
  }) {
    const { fileObject, event, extended } = args;
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

      this.extendFeatureImage(imageData, refs, extended);
      this.extendHierachicalResource(imageData, refs);

      const savedImage = await this.upsertImage(
        fileObject,
        imageData as NewImageAPI,
        localFetch
      );

      if (savedImage) {
        // Instead of removing from queue, just update status
        this.setUploadStatus(fileObject, 'uploaded');
        this.setLoadStatus(savedImage.id, 'loading');
        return savedImage;
      }
    } catch (error) {
      console.error('Failed to process image:', error);
      this.setUploadStatus(fileObject, 'error');
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
    const response = await fetch(`/api/images/${fileObject.imageToReplace!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(imageData)
    });

    const { image: updatedImage } = await response.json();

    this.setImages(
      this.state.images.map((img) =>
        img.id === fileObject.imageToReplace!.id ? { ...img, ...updatedImage } : img
      )
    );
    return updatedImage;
  }

  private async createNewImage(
    fileObject: ImageUpload,
    imageData: NewImageAPI,
    fetch: typeof window.fetch
  ) {
    const response = await fetch('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(imageData)
    });

    const savedImage = await response.json();
    this.setImages([savedImage, ...this.state.images]);
    this.setUploadStatus(fileObject, 'uploaded');
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

  retryUpload(fileObject: ImageUploadState) {
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
      this.sortImages();
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
    if (!this.activeImage) return;
    const data = await this.updatePublish();
    if (data?.success) {
      this.toggleForActiveImage('isPublished');
    }
  }

  private async updatePublish() {
    if (!this.activeImage) return;
    try {
      const response = await fetch(`/api/images/${this.activeImage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...this.getRefs(),
          featureImage: {
            isPublished: !this.activeImage.isPublished
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

  handlePreDelete(e: MouseEvent, image: GetImageAPI) {
    e.stopPropagation();
    e.preventDefault();
    this.addToPendingConfirmation(image.id);
  }

  handleCancelDelete(e: MouseEvent, image: GetImageAPI) {
    e.stopPropagation();
    e.preventDefault();
    this.removeFromPendingConfirmation(image.id);
  }

  handleConfirmDelete(e: MouseEvent, image: GetImageAPI) {
    e.stopPropagation();
    e.preventDefault();
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
      this.resetLoadStatus(imageId);
      this.resetThumbnailLoadStatus(imageId);
    }
  }

  // ═══════════════════════
  // 8. DOWNLOADS
  // ═══════════════════════

  async downloadImage(
    e: MouseEvent,
    image: GetImageAPI = this.activeImage!,
    flash: Writable<App.PageData['flash']>
  ) {
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

  private extendFeatureImage(
    image: Partial<NewImageAPI>,
    refs: ImageUploadRefs,
    extended?: {
      featureImage?: {
        isPublished: boolean;
        intent: Intent;
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

  getURLfromImage(opts: {
    image: ImageDB;
    transformation?: string;
    raw?: boolean;
    gravity?: string;
    quality?: string;
    format?: string;
  }): string {
    // Check if image is being replaced
    const replacementUpload = this.state.uploadQueue.find(
      (upload) =>
        upload.imageToReplace?.id === opts.image.id && upload.status !== 'invalidated'
    );

    if (replacementUpload) {
      return replacementUpload.preview;
    }

    return getURLfromImage(opts);
  }

  // Clean up previews when component is destroyed
}

// ═══════════════════════
// 12. UTILS
// ═══════════════════════

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

// ═══════════════════════
// 13. SERVICE SETUP
// ═══════════════════════

const IMAGE_STATE_KEY = Symbol('IMAGE_STATE_KEY');

export const setImageService = (
  mode: ImageServiceMode = 'gallery',
  isAdminMode: boolean = false,
  refType: ResourceType,
  refId: Id,
  refOrganisation?: OrganisationDB,
  refProject?: ProjectDB,
  image?: GetImageAPI
) =>
  setContext(
    IMAGE_STATE_KEY,
    new ImageService(
      mode,
      isAdminMode,
      refType,
      refId,
      refOrganisation,
      refProject,
      image
    )
  );

export const getImageService = (): ImageService => getContext(IMAGE_STATE_KEY);
