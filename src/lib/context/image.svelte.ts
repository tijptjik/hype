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
} from '$lib/client/services/image';
// TYPES
import type { Writable } from 'svelte/store';
// import type { QueryClient } from '@tanstack/svelte-query';
import type { ImageContextResource, ImageContextResourceExtended } from '$lib/enums';
import type {
  Image,
  Intent,
  ImageUploadState as ImageUpload,
  LoadStatus,
  UploadStatus,
  ImageEditCtx,
  Id,
  OrganisationDB,
  ProjectDB,
  ImageUploadCtx,
  ImageUploadState,
  ImageCtxMode,
  ImageCtxState,
  ImageCtxOptions
} from '$lib/types';

// ═══════════════════════
// TABLE OF CONTENTS :: ImageCtx Class
// ═══════════════════════
//
// 1. CONSTRUCTOR & SETUP
//    - constructor
//    - setContext
//
// 2. REACTIVE STATE
//    - state (Main reactive state object)
//
// 2.1 REACTIVE STATE :: DERIVED
//    - activeImage ($derived)
//    - activePreview ($derived)
//    - imagesQueryKey ($derived)
//    - isImagesLoading ($derived)
//    - viewerState ($derived, uses determineViewerState)
//
// 3. STATE MANAGEMENT
//    - determineViewerState
//
// 3.1 STATE MANAGEMENT :: MODE
//    - setMode
//
// 3.2 STATE MANAGEMENT :: CONTEXT
//    - setCtx
//    - getCtx
//
// 3.3 STATE MANAGEMENT :: UPLOAD
//    - getUploadCtx
//    - getUploadQueue
//    - setUploadQueue
//    - resetUploadQueue
//    - addToUploadQueue
//    - removeFromUploadQueue
//    - addToRejected
//    - setUploadStatus
//    - setUploadToRetry
//
// 3.4 STATE MANAGEMENT :: PENDING CONFIRMATION
//    - addToPendingConfirmation
//    - removeFromPendingConfirmation
//    - resetPendingConfirmation
//    - pendingConfirmationHas
//
// 3.5 STATE MANAGEMENT :: DELETION
//    - resetDeletionQueue
//    - addToDeletionQueue
//    - removeFromDeletionQueue
//    - deletionQueueHas
//
// 3.6 STATE MANAGEMENT :: IMAGES
//    - getImage
//    - getImages
//    - setImages
//    - resetImages
//    - removeImage
//    - setForImage
//
// 3.7 STATE MANAGEMENT :: LOAD STATUS
//    - getLoadStatus
//    - setLoadStatus
//    - getLoadStatuses
//    - resetLoadStatus
//
// 3.8 STATE MANAGEMENT :: THUMBNAIL LOAD STATUS
//    - setThumbnailLoadStatus
//    - getThumbnailLoadStatus
//    - resetThumbnailLoadStatus
//
// 3.9 STATE MANAGEMENT :: ACTIVE IMAGE
//    - setActiveImage
//    - resetActiveImage
//    - setActiveImageToFirst
//    - setForActiveImage
//    - toggleForActiveImage
//    - getReplacementUpload
//    - isImageHighlighted
//    - getImageIsPublished
//    - isImageBeingReplaced
//
// 4. Data Fetching & Refreshing
//    - refreshImages
//    - imagesQueryFn
//    - extendedImagesQueryFn
//
// 5. UI Navigation
//    - switchToImage
//
// 6. Upload Handling
//    - handleFilesSelect
//    - processUploadQueue (private)
//    - upload
//    - retryUpload
//    - isReplacementStatus
//
// 7. Image Attribute Updates (Patching)
//    - handleSetIntent
//    - handlePublishToggle
//
// 8. Deletion Handling
//    - handlePreDelete
//    - handleCancelDelete
//    - handleConfirmDelete
//    - processDeletionQueue
//    - delete
//
// 9. Download Functionality
//    - downloadImage
//
// 10. Preloading Utilities
//     - preloadImage
//     - preloadImages
//     - isImagePreloaded
//
// 11. Internal Helper Methods
//     - sortImages (private, for internal array sorting)

export class ImageCtx {
  //   queryClient: QueryClient;
  isAdminMode: boolean = false;

  // ═══════════════════════
  // 1. CONSTRUCTOR & SETUP
  // ═══════════════════════
  constructor(
    // queryClient: QueryClient,
    mode: ImageCtxMode = 'gallery',
    isAdminMode: boolean = false,
    ctxType: ImageContextResource,
    ctxId: Id,
    organisation?: OrganisationDB,
    project?: ProjectDB,
    image?: Image,
    ctxTypeSecondary?: ImageContextResourceExtended,
    ctxIdSecondary?: Id,
    highlightedIds?: Id[]
  ) {
    this.setContext({
      mode,
      isAdminMode,
      ctxType,
      ctxId: ctxId,
      organisation,
      project,
      image,
      ctxTypeSecondary,
      ctxIdSecondary,
      highlightedIds
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
    this.state.ctxType = options.ctxType;
    this.state.ctxId = options.ctxId || null;
    this.state.organisation = options.organisation || null;
    this.state.project = options.project || null;
    this.state.ctxTypeSecondary = options.ctxTypeSecondary || null;
    this.state.ctxIdSecondary = options.ctxIdSecondary || null;
    this.state.highlightedIds = options.highlightedIds || [];

    if (options.mode === 'standalone' && options.image) {
      await this.setImages([options.image as Image]);
      this.setLoadStatus(options.image.id, 'loading');
    } else if (options.mode === 'standalone' && !options.image) {
      await this.setImages([]);
    } else if (options.mode === 'gallery') {
      await this.refreshImages();
    }
    this.setActiveImageToFirst();
  }

  // ═══════════════════════
  // 2. REACTIVE STATE
  // ═══════════════════════
  state: ImageCtxState = $state({
    // Mode of the image service
    mode: 'gallery',
    // The type of resource the image is associated with
    ctxType: null,
    // The ID of the resource the image is associated with
    ctxId: null,
    // The organisation the image is ultimately associated with
    organisation: null,
    // The project the image is ultimately associated with
    project: null,
    // The secondary type of resource the image is associated with (e.g. task)
    ctxTypeSecondary: null,
    // The secondary ID of the resource the image is associated with (e.g. taskId)
    ctxIdSecondary: null,
    // The IDs of the images to be highlighted
    highlightedIds: [] as Id[],

    // CRUD :: CREATE

    // Queue of images to be uploaded
    uploadQueue: [] as ImageUpload[],
    // Rejected images
    rejected: [] as File[],

    // CRUD :: READ

    // Images related to the active resource (e.g. organisation, project, feature)
    images: [] as Image[],
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
  // 2,1 DERIVED STATES
  // ═══════════════════════

  activeImage = $derived(
    this.state.images.find((image) => this.state.activeId === image.id)
  );

  activePreview = $derived(
    this.state.uploadQueue.find((upload) => upload.status !== 'invalidated')
  );

  imagesQueryKey = $derived(['images', this.state.ctxType, this.state.ctxId]);

  isImagesLoading = $derived(
    this.state.images.filter(
      (image) => this.state.thumbnailLoadStatus[image.id] === 'loading'
    ).length
  );

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
      this.getLoadStatus(this.activeImage.id) === 'error'
    ) {
      return 'error';
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
  // 3. STATE MANAGEMENT
  // ═══════════════════════

  // ═══════════════════════
  // 3.1 STATE MANAGEMENT :: MODE
  // ═══════════════════════
  setMode(mode: 'standalone' | 'gallery') {
    this.state.mode = mode;
  }

  // ═══════════════════════
  // 3.2 STATE MANAGEMENT :: CONTEXT
  // ═══════════════════════
  setCtx(ctx: ImageEditCtx) {
    this.state.ctxType = ctx.ctxType;
    this.state.ctxId = ctx.ctxId;
  }

  getCtx(): ImageEditCtx {
    return {
      ctxType: this.state.ctxType as ImageContextResource,
      ctxId: this.state.ctxId as Id
    };
  }

  // ═══════════════════════
  // 3.3 STATE MANAGEMENT :: UPLOAD
  // ═══════════════════════
  getUploadCtx(imageToReplace?: Image): ImageUploadCtx {
    return {
      ctxType: this.state.ctxType as ImageContextResource,
      ctxId: this.state.ctxId as Id,
      organisation: this.state.organisation as OrganisationDB,
      project: this.state.project as ProjectDB,
      ...(imageToReplace !== undefined ? { imageToReplace } : {})
    };
  }

  getUploadQueue() {
    return this.state.uploadQueue;
  }

  setUploadQueue(uploadQueue: ImageUpload[]) {
    this.state.uploadQueue = uploadQueue;
  }

  resetUploadQueue() {
    this.state.uploadQueue = [];
  }

  addToUploadQueue(files: File[], imageToReplace?: Image) {
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
      }
    });
  }

  removeFromUploadQueue(file: File) {
    this.setUploadQueue(this.state.uploadQueue.filter((item) => item.file !== file));
  }

  addToRejected(files: File[]) {
    this.state.rejected.push(...files);
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

  // ═══════════════════════
  // 3.4 STATE MANAGEMENT :: PENDING CONFIRMATION
  // ═══════════════════════
  addToPendingConfirmation(imageId: string) {
    this.state.pendingConfirmation.add(imageId);
  }

  removeFromPendingConfirmation(imageId: string) {
    this.state.pendingConfirmation.delete(imageId);
  }

  resetPendingConfirmation() {
    this.state.pendingConfirmation = new SvelteSet<string>();
  }

  pendingConfirmationHas(imageId: string) {
    return this.state.pendingConfirmation.has(imageId);
  }

  // ═══════════════════════
  // 3.5 STATE MANAGEMENT :: DELETION
  // ═══════════════════════
  resetDeletionQueue() {
    this.state.deletionQueue = new SvelteSet<string>();
  }

  addToDeletionQueue(imageId: string) {
    this.state.deletionQueue.add(imageId);
  }

  removeFromDeletionQueue(imageId: string) {
    this.state.deletionQueue.delete(imageId);
  }

  deletionQueueHas(imageId: string) {
    return this.state.deletionQueue.has(imageId);
  }

  // ═══════════════════════
  // 3.6 STATE MANAGEMENT :: IMAGES
  // ═══════════════════════
  getImage(imageId: string) {
    return this.state.images.find((img) => img.id === imageId);
  }

  getImages() {
    return this.state.images;
  }

  async setImages(images: (Image & { preview?: string })[]) {
    this.state.images = sortImages(images);
    await this.preloadImages();
  }

  resetImages() {
    this.state.activeId = null;
    this.state.images = [];
  }

  removeImage(imageId: string) {
    this.state.images = this.state.images.filter((img) => img.id !== imageId);
  }

  setForImage(imageId: string, key: keyof Image, value: any) {
    const image = this.getImage(imageId);
    if (!image) return;
    image[key] = value as never;
  }

  // ═══════════════════════
  // 3.7 STATE MANAGEMENT :: LOAD STATUS
  // ═══════════════════════
  getLoadStatus(imageId: string) {
    return this.state.loadStatus[imageId];
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

  // ═══════════════════════
  // 3.8 STATE MANAGEMENT :: THUMBNAIL LOAD STATUS
  // ═══════════════════════
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

  // ═══════════════════════
  // 3.9 STATE MANAGEMENT :: ACTIVE IMAGE
  // ═══════════════════════
  setActiveImage(image: Image) {
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

  setForActiveImage(key: keyof Image, value: any) {
    if (!this.activeImage) return;
    this.setForImage(this.activeImage.id, key, value);
  }

  toggleForActiveImage(key: keyof Image) {
    if (!this.activeImage) return;
    this.setForImage(this.activeImage.id, key, !this.activeImage[key]);
  }

  getReplacementUpload(imageId: string): ImageUpload | undefined {
    return this.state.uploadQueue.find(
      (upload) => upload.imageToReplace?.id === imageId
    );
  }

  isImageHighlighted(imageId: string): boolean {
    return this.state.highlightedIds.includes(imageId);
  }

  getImageIsPublished(imageId: string): boolean {
    return (
      this.state.images.find((image) => image.id === imageId)?.isPublished ?? false
    );
  }

  isImageBeingReplaced(imageId: string): boolean {
    return this.state.uploadQueue.some(
      (upload) => upload.imageToReplace?.id === imageId
    );
  }

  // ═══════════════════════
  // 4. Data Fetching & Refreshing
  // ═══════════════════════
  async refreshImages() {
    // Get the images for the primary resource
    const images = await this.imagesQueryFn();
    const imageIds = images.map((image) => image.id);
    // Get the images for the secondary resource
    if (this.state.ctxTypeSecondary) {
      const extendedImages = await this.extendedImagesQueryFn();
      // Typically there will be an overlap of images between the primary and secondary resources, so we only add the images that are not already in the primary resource,
      // A scenario where this is not true is when the secondary resource is a task and the images have been rejected (i.e. deleted from the primary resource). We would still want to show the rejected images in the task viewer. To give context for the decision.
      extendedImages.forEach((image) => {
        if (!imageIds.includes(image.id)) {
          images.push(image);
        }
      });
    }
    await this.setImages(images);
    this.state.images.forEach((image) => {
      this.setLoadStatus(image.id, 'loading');
    });
  }

  async imagesQueryFn() {
    if (!this.state.ctxType || !this.state.ctxId) {
      throw new Error('No context type or ID provided');
    }
    return getImages(this.state.ctxType, this.state.ctxId);
  }

  async extendedImagesQueryFn() {
    if (!this.state.ctxTypeSecondary || !this.state.ctxIdSecondary) {
      throw new Error('No secondary context type or ID provided');
    }
    return getImages(
      this.state.ctxTypeSecondary as ImageContextResourceExtended,
      this.state.ctxIdSecondary as Id
    );
  }

  // ═══════════════════════
  // 5. UI Navigation
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
  // 6. Upload Handling
  // ═══════════════════════
  async handleFilesSelect(
    acceptedFiles: File[],
    fileRejections: File[],
    config: {
      onSuccess?: (savedImage: Image) => void;
      onError?: () => void;
    } = {},
    imageToReplace?: Image
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
    this.sortImages(); // Calls the private sortImages method

    // Only set active image to first if we're not replacing
    if (!imageToReplace) {
      this.setActiveImageToFirst();
    }
  }

  private async processUploadQueue(config: {
    onSuccess?: (savedImage: Image) => void;
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
      const uploadRefs = this.getUploadCtx(fileObject.imageToReplace);
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
      console.error('Failed to process image (ImageCtx.upload):', error);
      this.setUploadStatus(fileObject, 'error');
      throw error; // Re-throw to allow calling code to handle
    }
  }

  retryUpload(fileObject: ImageUploadState) {
    this.setUploadToRetry(fileObject);
    this.upload({ fileObject });
  }

  isReplacementStatus(imageId: string, status: UploadStatus) {
    return this.state.uploadQueue.some(
      (upload) => upload.imageToReplace?.id === imageId && upload.status === status
    );
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
  // 7. Image Attribute Updates (Patching)
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
          await updateImageIntent(currentCanonical.id, 'undefined', this.getCtx());
          this.setForImage(currentCanonical.id, 'intent', 'undefined');
        }
      }

      // Update the intent of the image
      await updateImageIntent(imageId, newIntent, this.getCtx());
      this.setForImage(imageId, 'intent', newIntent);
      this.sortImages(); // Calls the private sortImages method
    } catch (error) {
      console.error('Failed to update intent:', error);
    }
  }

  async handlePublishToggle() {
    if (!this.activeImage) return;

    const updatedImage = await updateImageIsPublished(
      this.activeImage.id,
      !this.activeImage.isPublished,
      this.getCtx()
    );
    if (updatedImage.id) {
      this.toggleForActiveImage('isPublished');
    }
  }

  // ═══════════════════════
  // 8. Deletion Handling
  // ═══════════════════════
  handlePreDelete(e: MouseEvent, image: Image) {
    e.stopPropagation();
    e.preventDefault();
    this.addToPendingConfirmation(image.id);
  }

  handleCancelDelete(e: MouseEvent, image: Image) {
    e.stopPropagation();
    e.preventDefault();
    this.removeFromPendingConfirmation(image.id);
  }

  handleConfirmDelete(e: MouseEvent, image: Image) {
    e.stopPropagation();
    e.preventDefault();
    this.addToDeletionQueue(image.id);
    this.processDeletionQueue();
  }

  async processDeletionQueue() {
    await Promise.all(
      Array.from(this.state.deletionQueue).map(async (imageId) => {
        await this.delete(imageId, this.getCtx());
      })
    );
  }

  async delete(imageId: string, ctx: ImageEditCtx) {
    try {
      // Call the service function for the API call
      await deleteImage(imageId, ctx);

      // State updates remain in the class method
      this.removeImage(imageId);
      this.setActiveImageToFirst(); // Ensure this is desired after any deletion
    } catch (error) {
      console.error('Failed to delete image (ImageCtx.delete context):', error);
      // Potentially re-throw or handle error state in UI
    } finally {
      // These state updates should always run
      this.removeFromPendingConfirmation(imageId);
      this.removeFromDeletionQueue(imageId);
      this.resetLoadStatus(imageId);
      this.resetThumbnailLoadStatus(imageId);
    }
  }

  // ═══════════════════════
  // 9. Download Functionality
  // ═══════════════════════
  async downloadImage(
    e: MouseEvent,
    image: Image = this.activeImage!,
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
  // 10. Preloading Utilities
  // ═══════════════════════
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

  isImagePreloaded(image: Image): boolean {
    const url = getURLfromImage({ image });
    return this.state.preloadedImages.has(url);
  }

  // ═══════════════════════
  // 11. Internal Helper Methods
  // ═══════════════════════
  private sortImages() {
    this.state.images = sortImages(this.state.images);
  }
}

// ═══════════════════════
// SERVICE SETUP
// ═══════════════════════

const IMAGE_STATE_KEY = Symbol('IMAGE_STATE_KEY');

export const setImageContext = (
  mode: ImageCtxMode = 'gallery',
  isAdminMode: boolean = false,
  ctxType: ImageContextResource,
  ctxId: Id,
  organisation?: OrganisationDB,
  project?: ProjectDB,
  image?: Image,
  ctxTypeSecondary?: ImageContextResourceExtended,
  ctxIdSecondary?: Id,
  highlightedIds?: Id[]
) =>
  setContext(
    IMAGE_STATE_KEY,
    new ImageCtx(
      mode,
      isAdminMode,
      ctxType,
      ctxId,
      organisation,
      project,
      image,
      ctxTypeSecondary,
      ctxIdSecondary,
      highlightedIds
    )
  );

export const getImageContext = (): ImageCtx => getContext(IMAGE_STATE_KEY);
