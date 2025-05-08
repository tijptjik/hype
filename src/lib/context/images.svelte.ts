// SVELTE
import { getContext, setContext } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
// SERVICES
import {
  uploadAndProcessImage,
  updateImageIntent,
  updateImageIsPublished,
  deleteImage,
  getImages,
  getURLfromImage,
  sortImages
} from '$lib/services/images.svelte';
// TYPES
import type { Writable } from 'svelte/store';
// import type { QueryClient } from '@tanstack/svelte-query';
import type {
  GetImageAPI,
  Intent,
  ImageUploadState as ImageUpload,
  LoadStatus,
  UploadStatus,
  ImageEditRefs,
  ResourceType,
  Id,
  OrganisationDB,
  ProjectDB,
  ImageUploadRefs,
  Organisation,
  Project,
  ImageUploadState,
  ImageCtxMode,
  ImageCtxState,
  ImageCtxOptions
} from '$lib/types';
/**
 * Image Service
 * ═══════════════════════
 *
 * Table of Contents
 * ────────────────
 * 1. State Management
 *   - States
 *   - Derived
 *   - Accessors
 * 2. Navigation
 * 3. Uploads
 * 4. Patching
 * 5. Deletion
 * 6. Downloads
 * 7. Metadata Handling
 * 8. Paths
 * 9. Data Casting
 * 10. Utils
 * 11. Context Setup
 */

export class ImageService {
  //   queryClient: QueryClient;
  isAdminMode: boolean = false;

  constructor(
    // queryClient: QueryClient,
    mode: ImageCtxMode = 'gallery',
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

  async setContext(options: ImageCtxOptions) {
    this.resetLoadStatus();
    this.resetThumbnailLoadStatus();
    this.resetPendingConfirmation();
    this.resetDeletionQueue();
    this.resetUploadQueue();
    this.resetActiveImage();
    this.resetImages();
    // this.queryClient = queryClient;
    this.state.mode = options.mode;
    this.isAdminMode = options.isAdminMode;
    this.state.refType = options.refType;
    this.state.refId = options.refId || null;
    this.state.refOrganisation = options.refOrganisation || null;
    this.state.refProject = options.refProject || null;

    if (options.mode === 'standalone' && options.image) {
      await this.setImages([options.image as GetImageAPI]);
      this.setLoadStatus(options.image.id, 'loading');
    } else if (options.mode === 'standalone' && !options.image) {
      await this.setImages([]);
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

  state: ImageCtxState = $state({
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
    // Preloaded images
    preloadedImages: new Set<string>(),

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
    this.state.images.filter(
      (image) => this.state.thumbnailLoadStatus[image.id] === 'loading'
    ).length
  );

  isReplacementStatus(imageId: string, status: UploadStatus) {
    return this.state.uploadQueue.some(
      (upload) => upload.imageToReplace?.id === imageId && upload.status === status
    );
  }

  determineViewerState = () => {
    if (
      this.activeImage &&
      this.isReplacementStatus(this.activeImage.id, 'uploading')
    ) {
      return 'previewReplacement';
    } else if (
      this.activeImage &&
      this.isReplacementStatus(this.activeImage.id, 'uploaded') &&
      this.getLoadStatus(this.activeImage.id) !== 'loaded'
    ) {
      return 'transition';
    } else if (
      this.activeImage &&
      this.getLoadStatus(this.activeImage.id) === 'loading'
    ) {
      return 'loading';
    } else if (
      this.activeImage &&
      this.getLoadStatus(this.activeImage.id) === 'loaded'
    ) {
      return 'loaded';
    } else if (this.activePreview) {
      return 'previewUploading';
    } else {
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
    console.log('[ImageService] Adding to rejected:', files);
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

  resetUploadQueue() {
    this.state.uploadQueue = [];
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

  resetDeletionQueue() {
    this.state.deletionQueue = new SvelteSet<string>();
  }

  // IMAGE LOAD STATE

  getImages() {
    return this.state.images;
  }

  getImage(imageId: string) {
    return this.state.images.find((img) => img.id === imageId);
  }

  async setImages(images: (GetImageAPI & { preview?: string })[]) {
    this.state.images = sortImages(images);
    await this.preloadImages();
  }

  setLoadStatus(imageId: string, status: LoadStatus) {
    // Guard against redundant updates
    if (this.state.loadStatus[imageId] === status) {
      return;
    }

    if (status === 'loaded') {
      // Only invalidate the upload queue if we're not in a replacement process
      // or if the replacement has been completed
      const replacementUpload = this.state.uploadQueue.find(
        (upload) => upload.imageToReplace?.id === imageId
      );

      if (replacementUpload?.status === 'uploaded') {
        this.state.uploadQueue = this.state.uploadQueue
          .map((upload) => {
            if (upload.imageToReplace?.id === imageId) {
              URL.revokeObjectURL(upload.preview ?? '');
              return { ...upload, status: 'invalidated' as UploadStatus };
            }
            return upload;
          })
          .filter((upload) => upload.status !== 'invalidated');
      }
    }

    this.state.loadStatus[imageId] = status;
    // console.log('[ImageService] New load statuses:', this.state.loadStatus);
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

  setActiveImage(image: GetImageAPI) {
    if (!image) return;
    this.state.activeId = image.id;
  }

  resetActiveImage() {
    this.state.activeId = null;
  }

  resetImages() {
    this.state.activeId = null;
    this.state.images = [];
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
    await this.setImages(await this.imagesQueryFn());
    this.state.images.forEach((image) => {
      this.setLoadStatus(image.id, 'loading');
    });
  }

  async imagesQueryFn() {
    return getImages(this.state.refType, this.state.refId, this.isAdminMode);
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
    fileObject: ImageUploadState;
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
      const uploadRefs = this.getUploadRefs(fileObject.imageToReplace);

      const savedImage = await uploadAndProcessImage(
        fileObject.file,
        uploadRefs,
        extended?.featureImage,
        localFetch
      );

      // Handle state updates after successful upload and processing
      if (savedImage) {
        if (uploadRefs.imageToReplace) {
          this.setImages(
            this.state.images.map((img) =>
              img.id === uploadRefs.imageToReplace!.id ? { ...img, ...savedImage } : img
            )
          );
        } else {
          this.setImages([savedImage, ...this.state.images]);
        }
        this.setUploadStatus(fileObject, 'uploaded');
        this.setLoadStatus(savedImage.id, 'loading');
        return savedImage;
      }
    } catch (error) {
      console.error('Failed to process image (ImageService.upload):', error);
      this.setUploadStatus(fileObject, 'error');
      throw error; // Re-throw to allow calling code to handle
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
          await updateImageIntent(currentCanonical.id, 'undefined', this.getRefs());
          this.setForImage(currentCanonical.id, 'intent', 'undefined');
        }
      }

      // Update the intent of the image
      await updateImageIntent(imageId, newIntent, this.getRefs());
      this.setForImage(imageId, 'intent', newIntent);
      this.sortImages();
    } catch (error) {
      console.error('Failed to update intent:', error);
    }
  }

  async handlePublishToggle() {
    if (!this.activeImage) return;

    const data = await updateImageIsPublished(
      this.activeImage.id,
      !this.activeImage.isPublished,
      this.getRefs()
    );
    if (data?.success) {
      this.toggleForActiveImage('isPublished');
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
      // Call the service function for the API call
      await deleteImage(imageId, refs);

      // State updates remain in the class method
      this.removeImage(imageId);
      this.setActiveImageToFirst(); // Ensure this is desired after any deletion
    } catch (error) {
      console.error('Failed to delete image (ImageService.delete context):', error);
      // Potentially re-throw or handle error state in UI
    } finally {
      // These state updates should always run
      this.removeFromPendingConfirmation(imageId);
      this.removeFromDeletionQueue(imageId);
      this.resetLoadStatus(imageId);
      this.resetThumbnailLoadStatus(imageId);
    }
  }

  // Add a preloader utility
  preloadImage = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = src;
    });
  };

  async preloadImages() {
    const imagesToPreload = this.state.images
      .map((image) => getURLfromImage({ image }))
      .filter((url) => !this.state.preloadedImages.has(url));

    // Preload all images concurrently
    await Promise.all(
      imagesToPreload.map(async (url) => {
        try {
          await this.preloadImage(url);
          this.state.preloadedImages.add(url);
        } catch (error) {
          console.error('Failed to preload image:', url, error);
        }
      })
    );
  }

  // Helper to check if an image is preloaded
  isImagePreloaded(image: GetImageAPI): boolean {
    const url = getURLfromImage({ image });
    return this.state.preloadedImages.has(url);
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
  // 9. DATA CASTING
  // ═══════════════════════

  private sortImages() {
    this.state.images = sortImages(this.state.images);
  }
}

// ═══════════════════════
// 11. SERVICE SETUP
// ═══════════════════════

const IMAGE_STATE_KEY = Symbol('IMAGE_STATE_KEY');

export const setImageContext = (
  mode: ImageCtxMode = 'gallery',
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

export const getImageContext = (): ImageService => getContext(IMAGE_STATE_KEY);
