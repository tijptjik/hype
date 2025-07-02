// SVELTE
import { getContext, setContext } from 'svelte';
import { SvelteSet, SvelteMap } from 'svelte/reactivity';
// I18N
import { m } from '$lib/i18n';
// SERVICES
import {
  uploadAndProcessImage,
  updateImageIntent,
  updateImageIsPublished,
  deleteImage,
  getURLfromImage,
  sortImages
} from '$lib/client/services/image';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// ENUMS
import { ResourcePath } from '$lib/enums';
// TYPES
import type { Writable } from 'svelte/store';
// import type { QueryClient } from '@tanstack/svelte-query';
import type { ImageContextResource, ImageContextResourceExtended } from '$lib/enums';
import type {
  Image,
  Intent,
  ImageUpload,
  LoadStatus,
  UploadStatus,
  ImageEditCtx,
  Id,
  OrganisationDB,
  ProjectDB,
  ImageUploadCtx,
  ImageCtxConstructorOptions,
  ImageContextConfig,
  Feature,
  ImageDBBasic
} from '$lib/types';

// ═══════════════════════
// TYPES :: ImageCtx
// ═══════════════════════

// ═══════════════════════
// TABLE OF CONTENTS :: ImageCtx Class
// ═══════════════════════
//
// 1. CONSTRUCTOR & SETUP
//    - constructor
//    - setContext
//
// 2. REACTIVE STATE
//    - state (Main reactive state object)import { navigateOnAdmin } from '$lib/navigation';

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
// 3.8 STATE MANAGEMENT :: UPLOAD STATUS
//    - setUploadStatus
//    - getUploadStatus
//    - resetUploadStatus
//
// 3.9 STATE MANAGEMENT :: THUMBNAIL LOAD STATUS
//    - setThumbnailLoadStatus
//    - getThumbnailLoadStatus
//    - resetThumbnailLoadStatus
//
// 3.10 STATE MANAGEMENT :: ACTIVE IMAGE
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
// 3.11 STATE MANAGEMENT :: ACTIVE PREVIEW
//    - setActivePreview
//    - resetActivePreview
//
// 3.12 STATE MANAGEMENT :: MODE
//    - setMode
//    - getMode
//    - isFullscreen

// 4. Data Fetching & Refreshing
//    - refreshImages
//    - imagesQueryFn
//    - extendedImagesQueryFn
//    - fetchSingleImage
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
  isAdminMode: boolean = false;
  appCtx = getAppCtx();

  // Add context tracking to prevent race conditions
  private currentContextId: string | null = null;

  // ═══════════════════════
  // 1. CONSTRUCTOR & SETUP
  // ═══════════════════════
  constructor(options: ImageCtxConstructorOptions = {}) {
    const {
      isAdminMode = false,
      context = null,
      image = null,
      images = null,
      highlightedIds = []
    } = options;

    this.isAdminMode = isAdminMode;

    this.setContext({ context, image, images, highlightedIds });
  }

  async setContext(options: {
    context?: ImageContextConfig | null;
    image?: Image | ImageDBBasic | null;
    images?: Image[] | ImageDBBasic[] | null;
    highlightedIds?: Id[];
  }) {
    const {
      context = this.state.context,
      image = null,
      images = null,
      highlightedIds = this.state.highlightedIds
    } = options;

    // Check if this is actually a context change to avoid unnecessary resets
    const isContextChange =
      this.state.context?.ctxType !== context?.ctxType ||
      this.state.context?.ctxId !== context?.ctxId ||
      this.state.context?.ctxTypeSecondary !== context?.ctxTypeSecondary ||
      this.state.context?.ctxIdSecondary !== context?.ctxIdSecondary;

    // Generate context ID based on actual context, not timing
    const newContextId = context ? `${context.ctxType}-${context.ctxId}` : null;
    this.currentContextId = newContextId;

    if (isContextChange) {
      this.resetUploadStatus();
      this.resetPendingConfirmation();
      this.resetDeletionQueue();
      this.resetUploadQueue();
      this.resetImages();
      this.resetActivePreview();
      this.resetActiveImage();

      // Mark this as a context change for PhotoFrame transition logic
      this.state.lastChangeType = 'context';
    }

    this.state.context = context;
    this.state.highlightedIds = highlightedIds;

    // For context changes, ignore the provided image and always use first from new context
    const effectiveImage = isContextChange ? null : image;

    // Helper function to set active image and loading status
    const setActiveImageWithLoading = (targetImage: Image | null) => {
      if (targetImage) {
        this.setActiveImage(targetImage);
        this.setLoadStatus(targetImage.id, 'loading');
      }
      // Use first available image - but do this after images are set
      // setActiveImageToFirst will be called after setImages() completes
    };

    // Handle image loading based on what's provided
    if (images && images.length > 0) {
      // Use pre-loaded images array
      const validImages = images.filter((img): img is Image => img != null);
      await this.setImages(validImages as Image[]);
      setActiveImageWithLoading(effectiveImage as Image | null);
      // If no specific image provided, set to first available
      if (!effectiveImage) {
        this.setActiveImageToFirst();
      }
    } else if (effectiveImage) {
      // Single image provided
      await this.setImages([effectiveImage as Image]);
      setActiveImageWithLoading(effectiveImage as Image | null);
    } else if (context) {
      // Fetch images from API based on context
      await this.refreshImages();
      // Validate context hasn't changed during async refreshImages
      if (this.currentContextId === newContextId) {
        setActiveImageWithLoading(effectiveImage);
        // If no specific image provided, set to first available
        if (!effectiveImage) {
          this.setActiveImageToFirst();
        }
      }
    } else {
      // No images to load
      await this.setImages([]);
      this.resetActiveImage();
    }
  }

  // ═══════════════════════
  // 2. REACTIVE STATE
  // ═══════════════════════
  state = $state({
    // Context configuration
    context: null as ImageContextConfig | null,
    isFetchingImages: false, // Track when we're fetching images from API

    // The IDs of the images to be highlighted
    highlightedIds: [] as Id[],

    // CRUD :: CREATE
    uploadQueue: [] as ImageUpload[],
    rejected: [] as File[],

    // CRUD :: READ
    images: new SvelteMap<Id, Image>(),
    activeImage: null as Image | null,
    targetImage: null as Image | null, // Image we're transitioning to
    isTransitioning: false, // Whether we're smoothly transitioning between images
    activePreview: null as ImageUpload | null,

    // Change tracking for PhotoFrame transition logic
    lastChangeType: null as 'index' | 'target' | 'context' | null,

    // Status tracking
    loadStatus: new SvelteMap<Id, LoadStatus>(),
    uploadStatus: new SvelteMap<Id, UploadStatus>(),
    thumbnailLoadStatus: new SvelteMap<Id, LoadStatus>(),
    preloadedImages: new SvelteSet<string>(),

    // Error tracking
    errorMessages: new SvelteMap<Id, { message: string; timestamp: number }>(),

    // CRUD :: DELETE
    pendingConfirmation: new SvelteSet<Id>(),
    deletionQueue: new SvelteSet<Id>(),

    // MODES
    isFullscreen: false
  });

  // ═══════════════════════
  // 2,1 DERIVED STATES
  // ═══════════════════════

  imagesQueryKey = $derived([
    'images',
    this.state.context?.ctxType,
    this.state.context?.ctxId
  ]);

  isImagesLoading = $derived.by(() => {
    const images = Array.from(this.state.images.values());

    // Don't show loading overlay during smooth transitions
    if (this.state.isTransitioning) {
      return 0;
    }

    // Check main image load status (since mode is now handled by PhotoFrame)
    const loadingImages = images.filter(
      (image: Image) => this.state.loadStatus.get(image.id) === 'loading'
    );

    return loadingImages.length;
  });

  determineViewerState = () => {
    // PRIORITY 0: Check if we're fetching images from API (early loading state)
    if (this.state.isFetchingImages) {
      return 'loading';
    }

    // PRIORITY 1: Check if active image is currently being replaced (uploading)
    if (
      this.state.activeImage &&
      this.isReplacementStatus(this.state.activeImage.id, 'uploading')
    ) {
      return 'previewReplacement';
    }

    // PRIORITY 2: Check if active image is being replaced with uploaded content
    if (
      this.state.activeImage &&
      this.isReplacementStatus(this.state.activeImage.id, 'uploaded') &&
      this.getLoadStatus(this.state.activeImage.id) !== 'loaded'
    ) {
      return 'transition';
    }

    // PRIORITY 3: Check if there's an active preview (fresh upload) that's still uploading
    if (this.state.activePreview && this.state.activePreview.status === 'uploading') {
      return 'previewUploading';
    }

    // PRIORITY 4: Check load status of active image
    if (this.state.activeImage) {
      const loadStatus = this.getLoadStatus(this.state.activeImage.id);
      if (loadStatus === 'loading') {
        return 'loading';
      } else if (loadStatus === 'error') {
        return 'error';
      } else if (loadStatus === 'loaded') {
        return 'loaded';
      }
      // If no load status is set, default to loading
      return 'loading';
    }

    // PRIORITY 5: Check if there's an active preview (fresh upload) that's uploaded but no active image yet
    if (this.state.activePreview) {
      return 'previewUploading';
    }

    // Default to empty state
    return 'empty';
  };

  viewerState = $derived.by(() => {
    return this.determineViewerState();
  });

  // ═══════════════════════
  // 3. STATE MANAGEMENT
  // ═══════════════════════

  // ═══════════════════════
  // 3.1 STATE MANAGEMENT :: CONTEXT
  // ═══════════════════════
  setCtx(ctx: ImageEditCtx) {
    this.state.context = {
      ctxType: ctx.ctxType,
      ctxId: ctx.ctxId
    };
  }

  getCtx(): ImageEditCtx {
    if (!this.state.context?.ctxType || !this.state.context?.ctxId) {
      throw new Error('No context type or ID available');
    }
    return {
      ctxType: this.state.context.ctxType,
      ctxId: this.state.context.ctxId
    };
  }

  // ═══════════════════════
  // 3.3 STATE MANAGEMENT :: UPLOAD
  // ═══════════════════════
  getUploadCtx(imageToReplace?: Image): ImageUploadCtx {
    if (!this.state.context?.ctxType || !this.state.context?.ctxId) {
      throw new Error('No context available for upload');
    }
    return {
      ctxType: this.state.context.ctxType,
      ctxId: this.state.context.ctxId,
      organisation: this.state.context.organisation as OrganisationDB,
      project: this.state.context.project as ProjectDB,
      ...(imageToReplace !== undefined ? { imageToReplace } : {})
    };
  }

  getUploadQueue() {
    return this.state.uploadQueue;
  }

  setUploadQueue(uploadQueue: ImageUpload[]) {
    this.state.uploadQueue = uploadQueue;
    // Update active preview
    this.updateActivePreview();
  }

  resetUploadQueue() {
    this.state.uploadQueue = [];
    this.resetActivePreview();
  }

  addToUploadQueue(files: File[], imageToReplace?: Image) {
    const newUploads = files.map(
      (file) =>
        ({
          file,
          status: 'uploading',
          retries: 0,
          imageToReplace,
          preview: URL.createObjectURL(file)
        }) as ImageUpload
    );

    this.state.uploadQueue.push(...newUploads);

    // Update preview URLs for replacing images
    files.forEach((file) => {
      if (imageToReplace && this.state.images.has(imageToReplace.id)) {
        const existingImage = this.state.images.get(imageToReplace.id)! as any;
        existingImage.preview = URL.createObjectURL(file);
      }
    });

    this.updateActivePreview();
  }

  removeFromUploadQueue(file: File) {
    this.setUploadQueue(this.state.uploadQueue.filter((item) => item.file !== file));
  }

  addToRejected(files: File[]) {
    this.state.rejected.push(...files);
  }

  setUploadStatus(fileObject: ImageUpload, status: UploadStatus) {
    const upload = this.state.uploadQueue.find(
      (item) => item.file.name === fileObject.file.name
    );
    if (upload) {
      upload.status = status;
      this.updateActivePreview();
    }
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
  addToPendingConfirmation(imageId: Id) {
    this.state.pendingConfirmation.add(imageId);
  }

  removeFromPendingConfirmation(imageId: Id) {
    this.state.pendingConfirmation.delete(imageId);
  }

  resetPendingConfirmation() {
    this.state.pendingConfirmation = new SvelteSet<Id>();
  }

  pendingConfirmationHas(imageId: Id) {
    return this.state.pendingConfirmation.has(imageId);
  }

  // ═══════════════════════
  // 3.5 STATE MANAGEMENT :: DELETION
  // ═══════════════════════
  resetDeletionQueue() {
    this.state.deletionQueue = new SvelteSet<Id>();
  }

  addToDeletionQueue(imageId: Id) {
    this.state.deletionQueue.add(imageId);
  }

  removeFromDeletionQueue(imageId: Id) {
    this.state.deletionQueue.delete(imageId);
  }

  deletionQueueHas(imageId: Id) {
    return this.state.deletionQueue.has(imageId);
  }

  // ═══════════════════════
  // 3.6 STATE MANAGEMENT :: IMAGES
  // ═══════════════════════
  getImage(imageId: Id): Image | undefined {
    return this.state.images.get(imageId);
  }

  getImages(): Image[] {
    return Array.from(this.state.images.values());
  }

  async setImages(images: (Image & { preview?: string })[]) {
    // Filter out null/undefined images and sort
    const validImages = images.filter(
      (image): image is Image & { preview?: string } =>
        image != null && image.id != null
    );

    if (validImages.length === 0) {
      this.state.images.clear();
      return;
    }

    const sortedImages = sortImages(validImages);

    // Simple approach: just update the images and let PhotoFrame handle transitions
    this.state.images.clear();
    sortedImages.forEach((image) => {
      this.state.images.set(image.id, image as Image);
    });

    await this.preloadImages();
  }

  resetImages() {
    this.state.images.clear();
    // Don't reset activeImage here - let it be explicitly managed
  }

  removeImage(imageId: Id) {
    this.state.images.delete(imageId);
  }

  setForImage(imageId: Id, key: keyof Image, value: any) {
    const image = this.getImage(imageId);
    if (!image) return;

    // Create a new object to trigger reactivity
    const updatedImage = { ...image, [key]: value };
    this.state.images.set(imageId, updatedImage as Image);

    // Also update activeImage if it's the same image
    if (this.state.activeImage?.id === imageId) {
      this.state.activeImage = updatedImage as Image;
    }
  }

  // ═══════════════════════
  // 3.7 STATE MANAGEMENT :: LOAD STATUS
  // ═══════════════════════
  getLoadStatus(imageId: Id): LoadStatus | undefined {
    return this.state.loadStatus.get(imageId);
  }

  setLoadStatus(imageId: Id, status: LoadStatus) {
    // Guard against redundant updates
    if (this.state.loadStatus.get(imageId) === status) {
      return;
    }

    // Clean up upload queue when image loads successfully, but with a small delay
    // to prevent preview from disappearing before final image is ready to display
    if (status === 'loaded') {
      const replacementUpload = this.state.uploadQueue.find(
        (upload) => upload.imageToReplace?.id === imageId
      );

      const freshUpload = this.state.uploadQueue.find(
        (upload) => !upload.imageToReplace && upload.status === 'uploaded'
      );

      if (replacementUpload?.status === 'uploaded' || freshUpload) {
        const uploadType = replacementUpload ? 'replacement' : 'fresh';

        // Small delay to ensure the final image is ready to display before cleaning up preview
        const delay = 50;

        setTimeout(() => {
          this.state.uploadQueue = this.state.uploadQueue
            .map((upload) => {
              if (
                upload.imageToReplace?.id === imageId &&
                upload.status === 'uploaded'
              ) {
                URL.revokeObjectURL(upload.preview ?? '');
                return { ...upload, status: 'invalidated' as UploadStatus };
              }
              if (!upload.imageToReplace && upload.status === 'uploaded') {
                URL.revokeObjectURL(upload.preview ?? '');
                return { ...upload, status: 'invalidated' as UploadStatus };
              }
              return upload;
            })
            .filter((upload) => upload.status !== 'invalidated');

          this.updateActivePreview();

          // Only reset change type after upload cleanup, not during context changes
          // Context changes should preserve their lastChangeType until explicitly reset
          if (this.state.lastChangeType !== 'context') {
            this.state.lastChangeType = null;
          }
        }, delay);
      }
    }

    this.state.loadStatus.set(imageId, status);
  }

  getLoadStatuses() {
    return this.state.loadStatus;
  }

  resetLoadStatus(imageId?: Id) {
    if (imageId) {
      this.state.loadStatus.delete(imageId);
    } else {
      this.state.loadStatus.clear();
    }
  }

  // ═══════════════════════
  // 3.8 STATE MANAGEMENT :: UPLOAD STATUS
  // ═══════════════════════
  setUploadStatusById(imageId: Id, status: UploadStatus) {
    this.state.uploadStatus.set(imageId, status);
  }

  getUploadStatus(imageId: Id): UploadStatus | undefined {
    return this.state.uploadStatus.get(imageId);
  }

  resetUploadStatus(imageId?: Id) {
    if (imageId) {
      this.state.uploadStatus.delete(imageId);
    } else {
      this.state.uploadStatus.clear();
    }
  }

  // ═══════════════════════
  // 3.9 STATE MANAGEMENT :: THUMBNAIL LOAD STATUS
  // ═══════════════════════
  setThumbnailLoadStatus(imageId: Id, status: LoadStatus) {
    this.state.thumbnailLoadStatus.set(imageId, status);
  }

  getThumbnailLoadStatus(imageId: Id): LoadStatus | undefined {
    return this.state.thumbnailLoadStatus.get(imageId);
  }
  // TODO Ensure that this is called as part of the refreshImages and setContext
  resetThumbnailLoadStatus(imageId?: Id) {
    if (imageId) {
      this.state.thumbnailLoadStatus.delete(imageId);
    } else {
      this.state.thumbnailLoadStatus.clear();
    }
  }

  // ═══════════════════════
  // 3.7 STATE MANAGEMENT :: ERROR MESSAGES
  // ═══════════════════════
  setErrorMessage(imageId: Id, message: string) {
    this.state.errorMessages.set(imageId, {
      message,
      timestamp: Date.now()
    });

    // Auto-clear after 5 seconds
    setTimeout(() => {
      this.clearErrorMessage(imageId);
    }, 5000);
  }

  getErrorMessage(imageId: Id): { message: string; timestamp: number } | undefined {
    return this.state.errorMessages.get(imageId);
  }

  clearErrorMessage(imageId: Id) {
    this.state.errorMessages.delete(imageId);
  }

  hasErrorMessage(imageId: Id): boolean {
    return this.state.errorMessages.has(imageId);
  }

  // ═══════════════════════
  // 3.9 STATE MANAGEMENT :: ACTIVE IMAGE
  // ═══════════════════════

  get activeImage(): Image | null {
    return this.state.activeImage;
  }

  setActiveImage(image: Image | null) {
    this.state.activeImage = image;
    // If lastChangeType is null, it means this is likely a context change
    if (this.state.lastChangeType === null) {
      this.state.lastChangeType = 'context';
    }
  }

  setActiveImageWithLoading(image: Image | null) {
    if (image) {
      this.setActiveImage(image);
      this.setLoadStatus(image.id, 'loading');
    } else {
      this.resetActiveImage();
    }
  }

  resetActiveImage() {
    this.state.activeImage = null;
  }

  // Smooth transition methods
  setTargetImage(image: Image | null) {
    this.state.targetImage = image;
  }

  resetTargetImage() {
    this.state.targetImage = null;
  }

  // Preload an image without switching to it
  async preloadImageForTransition(targetImage: Image): Promise<boolean> {
    // If the image is already loaded, return immediately
    if (this.getLoadStatus(targetImage.id) === 'loaded') {
      return true;
    }

    // Set loading status to trigger preloading
    this.setLoadStatus(targetImage.id, 'loading');

    // Return a promise that resolves when the image is loaded
    return new Promise((resolve) => {
      const checkLoaded = () => {
        if (this.getLoadStatus(targetImage.id) === 'loaded') {
          resolve(true);
        } else {
          // Check again in a short interval
          setTimeout(checkLoaded, 50);
        }
      };
      checkLoaded();
    });
  }

  // Smoothly switch to a new image (preload then switch)
  async switchToImageSmooth(targetImage: Image) {
    // If we're already transitioning to this image, do nothing
    if (this.state.targetImage?.id === targetImage.id) {
      return;
    }

    // Set transition state to prevent loading overlay
    this.state.isTransitioning = true;
    this.setTargetImage(targetImage);

    // Preload the image first
    await this.preloadImageForTransition(targetImage);

    // Now switch to the image
    this.setActiveImage(targetImage);
    this.resetTargetImage();
    this.state.isTransitioning = false;
  }

  setActiveImageToFirst() {
    const images = this.getImages();
    if (images.length > 0) {
      this.setActiveImageWithLoading(images[0] as Image);
    } else {
      this.resetActiveImage();
    }
  }

  setForActiveImage(key: keyof Image, value: any) {
    if (!this.state.activeImage) return;
    this.setForImage(this.state.activeImage.id, key, value);
  }

  toggleForActiveImage(key: keyof Image) {
    if (!this.state.activeImage) return;
    this.setForImage(
      this.state.activeImage.id,
      key,
      !(this.state.activeImage as any)[key]
    );
  }

  getReplacementUpload(imageId: Id): ImageUpload | undefined {
    return this.state.uploadQueue.find(
      (upload) => upload.imageToReplace?.id === imageId
    );
  }

  isImageHighlighted(imageId: Id): boolean {
    return this.state.highlightedIds.includes(imageId);
  }

  getImageIsPublished(imageId: Id): boolean {
    return (this.getImage(imageId) as Image)?.isPublished ?? false;
  }

  isImageBeingReplaced(imageId: Id): boolean {
    return this.state.uploadQueue.some(
      (upload) => upload.imageToReplace?.id === imageId
    );
  }

  // ═══════════════════════
  // 3.10 STATE MANAGEMENT :: ACTIVE PREVIEW
  // ═══════════════════════

  get activePreview(): ImageUpload | null {
    return this.state.activePreview;
  }

  setActivePreview(upload: ImageUpload | null) {
    this.state.activePreview = upload;
  }

  resetActivePreview() {
    this.state.activePreview = null;
  }

  private updateActivePreview() {
    const activeUpload = this.state.uploadQueue.find(
      (upload) => upload.status !== 'invalidated'
    );
    this.setActivePreview(activeUpload || null);
  }

  // ═══════════════════════
  // 3.12 STATE MANAGEMENT :: MODE
  // ═══════════════════════
  setMode(mode: 'fullscreen' | 'normal') {
    if (mode === 'fullscreen') {
      this.state.isFullscreen = true;
    } else {
      this.state.isFullscreen = false;
    }
  }

  getMode(): 'fullscreen' | 'normal' {
    return this.state.isFullscreen ? 'fullscreen' : 'normal';
  }

  isFullscreen: boolean = $derived(this.state.isFullscreen);

  // ═══════════════════════
  // 4. Data Fetching & Refreshing
  // ═══════════════════════

  private async fetchImagesFromCache(
    ctxType: ImageContextResource | ImageContextResourceExtended,
    ctxId: Id,
    includeSingleImage = true
  ): Promise<Image[]> {
    // Try to get images from AppCtx cache first
    if (ctxType === 'feature') {
      const feature = this.appCtx.cache.feature.get(ctxId) as Feature | undefined;

      if (feature) {
        // If we have feature.images array, use it
        if (feature.images && feature.images.length > 0) {
          return feature.images as Image[];
        }

        // If feature.images is undefined/null, this is likely a FeatureFromCollection
        // Fall back to API to get the full images array
        if (feature.images === undefined || feature.images === null) {
          return this.fetchImagesFromAPI(ctxType, ctxId, includeSingleImage);
        }

        // If we have feature.image but empty images array, use the single image
        if (feature.image && includeSingleImage) {
          return [feature.image as Image];
        }
      }
    }

    // For projects, organisations, layers, etc., we could extend this logic
    // For now, if we don't have a cache hit, fall back to API
    return this.fetchImagesFromAPI(ctxType, ctxId, includeSingleImage);
  }

  private async fetchImagesFromAPI(
    ctxType: ImageContextResource | ImageContextResourceExtended,
    ctxId: Id,
    includeSingleImage = true
  ): Promise<Image[]> {
    const resourcePath = ResourcePath[ctxType];
    if (!resourcePath) {
      throw new Error(`Unknown context type: ${ctxType}`);
    }

    // Build API URL
    let url = `/api/${resourcePath}/${ctxId}`;

    // Add byId=true for organisations, projects, and hubs
    if (['organisation', 'project', 'hub'].includes(ctxType)) {
      url += '?byId=true';
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch images: ${response.statusText}`);
    }

    const data = await response.json();

    let result: any[] = [];

    // Cache the feature response for reuse
    if (ctxType === 'feature') {
      this.appCtx.setFeatureById(data as Feature);
    }

    if (includeSingleImage && data.image) {
      // For standalone mode, prioritize the canonical image first
      result = [data.image];

      // Add other images that aren't the canonical one
      if (data.images) {
        const otherImages = data.images.filter((img: any) => img.id !== data.image.id);
        result = [...result, ...otherImages];
      }
    } else {
      // For collection mode, just return the images array
      result = data.images || [];
    }

    return result;
  }

  async refreshImages() {
    if (!this.state.context) {
      return;
    }

    // Capture current context ID to validate later
    const contextIdAtStart = this.currentContextId;
    // Set fetching state to show loading immediately
    this.state.isFetchingImages = true;

    // Get the images for the primary resource
    const images = await this.imagesQueryFn();

    // Validate context hasn't changed during async operation
    if (this.currentContextId !== contextIdAtStart) {
      this.state.isFetchingImages = false;
      return;
    }

    // Filter out null/undefined images before processing
    const validImages = images.filter(
      (image): image is Image => image != null && image.id != null
    );
    const imageIds = validImages.map((image: Image) => image.id);

    // Get the images for the secondary resource
    if (this.state.context.ctxTypeSecondary) {
      const extendedImages = await this.extendedImagesQueryFn();

      // Validate context again after second async operation
      if (this.currentContextId !== contextIdAtStart) {
        this.state.isFetchingImages = false;
        return;
      }

      // Filter out null/undefined extended images too
      const validExtendedImages = extendedImages.filter(
        (image): image is Image => image != null && image.id != null
      );

      // Typically there will be an overlap of images between the primary and secondary resources, so we only add the images that are not already in the primary resource,
      // A scenario where this is not true is when the secondary resource is a task and the images have been rejected (i.e. deleted from the primary resource). We would still want to show the rejected images in the task viewer. To give context for the decision.
      validExtendedImages.forEach((image: Image) => {
        if (!imageIds.includes(image.id)) {
          validImages.push(image);
        }
      });
    }

    // Final context validation before applying results
    if (this.currentContextId !== contextIdAtStart) {
      this.state.isFetchingImages = false;
      return;
    }

    await this.setImages(validImages);

    // Set active image with loading state immediately to maintain loading display
    if (validImages.length > 0 && !this.state.activeImage) {
      this.setActiveImageToFirst();
    }

    // Don't set loading status here - let Picture.svelte handle it via onLoad callbacks
    // This prevents premature transitions before images are actually ready

    // Set appropriate loading status based on mode
    validImages.forEach((image: Image) => {
      const currentThumbnailStatus = this.getThumbnailLoadStatus(image.id);
      if (currentThumbnailStatus !== 'loaded') {
        this.setThumbnailLoadStatus(image.id, 'loading');
      }
    });

    // Clear fetching state after successful completion
    this.state.isFetchingImages = false;
  }

  async imagesQueryFn() {
    if (!this.state.context?.ctxType || !this.state.context?.ctxId) {
      throw new Error('No context type or ID provided');
    }

    const result = await this.fetchImagesFromCache(
      this.state.context.ctxType,
      this.state.context.ctxId,
      true
    );

    return result;
  }

  async extendedImagesQueryFn() {
    if (!this.state.context?.ctxTypeSecondary || !this.state.context?.ctxIdSecondary) {
      throw new Error('No secondary context type or ID provided');
    }

    return this.fetchImagesFromCache(
      this.state.context.ctxTypeSecondary,
      this.state.context.ctxIdSecondary,
      false
    );
  }

  async fetchSingleImage() {
    if (!this.state.context) return;

    try {
      // First try to get images array
      const images = await this.imagesQueryFn();
      if (images && images.length > 0) {
        // Filter out null/undefined images
        const validImages = images.filter(
          (img): img is Image => img != null && img.id != null
        );

        if (validImages.length > 0) {
          await this.setImages(validImages);
          this.setActiveImage(validImages[0]);
          // Don't set loading status - let Picture.svelte handle it via onLoad
          return;
        }
      }

      // If no images in array, try to get single image from .image property
      // This would require a separate API call or different service method
      // For now, just set empty state
      await this.setImages([]);
      this.resetActiveImage();
    } catch (error) {
      console.error('Failed to fetch single image:', error);
      await this.setImages([]);
      this.resetActiveImage();
    }
  }

  // ═══════════════════════
  // 5. UI Navigation
  // ═══════════════════════
  switchToImage(e: MouseEvent, direction: 'prev' | 'next') {
    e.preventDefault();
    if (direction === 'next') {
      this.next();
    } else {
      this.prev();
    }
  }

  // ═══════════════════════
  // 5.1 UI Navigation :: Index-based navigation
  // ═══════════════════════

  next(): Image | null {
    const images = this.getImages();
    if (images.length === 0) return null;

    const currentActiveImage = this.state.activeImage;
    if (!currentActiveImage) {
      this.setActiveImageToFirst();
      return images[0] || null;
    }

    const currentIndex = images.findIndex((img) => img.id === currentActiveImage.id);
    if (currentIndex === -1) {
      this.setActiveImageToFirst();
      return images[0] || null;
    }

    const newIndex = (currentIndex + 1) % images.length;
    const newImage = images[newIndex];
    if (newImage) {
      this.setActiveImage(newImage);
      // Signal this was an index-based change for PhotoFrame transition logic
      this.state.lastChangeType = 'index';
    }
    return newImage;
  }

  prev(): Image | null {
    const images = this.getImages();
    if (images.length === 0) return null;

    const currentActiveImage = this.state.activeImage;
    if (!currentActiveImage) {
      this.setActiveImageToFirst();
      return images[0] || null;
    }

    const currentIndex = images.findIndex((img) => img.id === currentActiveImage.id);
    if (currentIndex === -1) {
      this.setActiveImageToFirst();
      return images[0] || null;
    }

    const newIndex = (currentIndex - 1 + images.length) % images.length;
    const newImage = images[newIndex];
    if (newImage) {
      this.setActiveImage(newImage);
      // Signal this was an index-based change for PhotoFrame transition logic
      this.state.lastChangeType = 'index';
    }
    return newImage;
  }

  target(imageId: Id): Image | null {
    const image = this.getImage(imageId);
    if (image) {
      this.setActiveImage(image as Image);
      // Signal this was a target-based change for PhotoFrame transition logic
      this.state.lastChangeType = 'target';
      return image as Image;
    }
    return null;
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
    this.sortImagesInternal(); // Calls the private sortImages method

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
      const uploadCtx = this.getUploadCtx(fileObject.imageToReplace);
      const savedImage = await uploadAndProcessImage(
        fileObject.file,
        uploadCtx,
        extended?.featureImage,
        localFetch
      );

      // Handle state updates after successful upload and processing
      if (savedImage) {
        if (uploadCtx.imageToReplace) {
          // Update existing image in map
          this.state.images.set(savedImage.id, savedImage as Image);
          // Update active image if it was the one being replaced
          if (this.state.activeImage?.id === uploadCtx.imageToReplace.id) {
            // Set change type to enable smooth transition from replacement preview to final image
            this.state.lastChangeType = 'target';
            this.setActiveImage(savedImage);
          }
        } else {
          // Add new image to map
          this.state.images.set(savedImage.id, savedImage as Image);
          // For fresh uploads, always set as active image if no active image exists
          if (!this.state.activeImage) {
            this.setActiveImage(savedImage);
          }
        }
        this.setUploadStatus(fileObject, 'uploaded');
        this.setLoadStatus(savedImage.id, 'loading');
        return savedImage;
      }
    } catch (error) {
      console.error('Failed to process image (ImageCtx.upload):', error);
      this.setUploadStatus(fileObject, 'error');
      // Clean up the failed upload
      this.cleanupFailedUpload(fileObject);
      throw error; // Re-throw to allow calling code to handle
    }
  }

  retryUpload(fileObject: ImageUpload) {
    this.setUploadToRetry(fileObject);
    this.upload({ fileObject });
  }

  // Clean up failed uploads by removing them from queue and resetting preview
  cleanupFailedUpload(fileObject: ImageUpload) {
    // Remove the failed upload from the queue
    this.state.uploadQueue = this.state.uploadQueue.filter(
      (upload) => upload.file !== fileObject.file
    );

    // Revoke the preview URL to free memory
    if (fileObject.preview) {
      URL.revokeObjectURL(fileObject.preview);
    }

    // Update active preview (will set to null if no other uploads)
    this.updateActivePreview();

    // Reset any transition state
    this.state.lastChangeType = 'context'; // This will trigger a clean reset in PhotoFrame
  }

  isReplacementStatus(imageId: Id, status: UploadStatus) {
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
  async handleSetIntent(imageId: Id, newIntent: Intent) {
    try {
      // If trying to set as canonical, first check if another image is already canonical
      if (newIntent === 'canonical') {
        const images = this.getImages();
        const currentCanonical = images.find(
          (img: Image) => img.id !== imageId && img.intent === 'canonical'
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
      this.sortImagesInternal(); // Calls the private sortImages method
    } catch (error) {
      console.error('Failed to update intent:', error);
    }
  }

  async handlePublishToggle() {
    if (!this.state.activeImage) return;

    const updatedImage = await updateImageIsPublished(
      this.state.activeImage.id,
      !this.state.activeImage.isPublished,
      this.getCtx()
    );
    if (updatedImage.id) {
      this.toggleForActiveImage('isPublished');
      // Re-sort images when publish status changes
      this.sortImagesInternal();
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

  async delete(imageId: Id, ctx: ImageEditCtx) {
    try {
      // Call the service function for the API call
      await deleteImage(imageId, ctx);

      // State updates remain in the class method
      this.removeImage(imageId);

      // If we deleted the active image, set a new one
      if (this.state.activeImage?.id === imageId) {
        this.setActiveImageToFirst();
      }
    } catch (error: any) {
      console.error('Failed to delete image (ImageCtx.delete context):', error);

      // Extract error message from the server response
      let errorMessage = 'Failed to delete image';
      if (error?.message) {
        // Parse the error message from deleteImage service
        if (error.message.includes('Cannot delete image. It belongs to a Task')) {
          errorMessage = m.quaint_quaint_fly_zap();
        } else if (error.message.includes('Failed to delete image:')) {
          // Extract the part after "Failed to delete image: "
          errorMessage = error.message.replace('Failed to delete image: ', '');
        }
      }

      // Show error message on the thumbnail for 5 seconds
      this.setErrorMessage(imageId, errorMessage);
    } finally {
      // These state updates should always run
      this.removeFromPendingConfirmation(imageId);
      this.removeFromDeletionQueue(imageId);
      this.resetLoadStatus(imageId);
      this.resetUploadStatus(imageId);
      this.resetThumbnailLoadStatus(imageId);
    }
  }

  // ═══════════════════════
  // 9. Download Functionality
  // ═══════════════════════
  async downloadImage(
    e: MouseEvent,
    image: Image = this.state.activeImage!,
    flash: Writable<any>
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
    const images = this.getImages();
    const imagesToPreload = images
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
  private sortImagesInternal() {
    const images = this.getImages();
    const sortedImages = sortImages(images, this.isAdminMode);

    // Clear and repopulate the map with sorted images
    this.state.images.clear();
    sortedImages.forEach((image) => {
      this.state.images.set(image.id, image as Image);
    });
  }
}

// ═══════════════════════
// SERVICE SETUP
// ═══════════════════════

const IMAGE_STATE_KEY = Symbol('IMAGE_STATE_KEY');

export const setImageCtx = (options: ImageCtxConstructorOptions) =>
  setContext(IMAGE_STATE_KEY, new ImageCtx(options));

export const getImageCtx = (): ImageCtx => getContext(IMAGE_STATE_KEY);
