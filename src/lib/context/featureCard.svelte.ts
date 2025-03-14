// SVELTE
import { setContext, getContext } from 'svelte';
// ENUMS
import { FeatureCardMode } from '$lib/types';

// TYPES
type UploadedPhoto = {
  file: File;
  previewUrl: string;
};

export class FeatureCardContext {
  // STATE must be initialized first
  state = $state({
    mode: FeatureCardMode.Display
  });
  userData = $state({
    missingReason: '',
    photos: [] as UploadedPhoto[]
  });
  validationError = $state('');
  isSubmitting = $state(false);

  // UTILS
  /**
   * Adds a photo to the feature card context
   */
  addPhoto(photo: UploadedPhoto) {
    this.userData.photos.push(photo);
  }

  addPhotosFromFiles(files: File[]) {
    files.forEach((file) => {
      this.addPhoto({
        file,
        previewUrl: URL.createObjectURL(file)
      });
    });
  }

  /**
   * Removes a photo from the feature card context
   */
  removePhoto(photo: UploadedPhoto) {
    // Release the object URL to avoid memory leaks
    URL.revokeObjectURL(photo.previewUrl);
    this.userData.photos = this.userData.photos.filter((p) => p !== photo);
  }

  removePhotoAtIndex(index: number) {
    // Release the object URL to avoid memory leaks
    this.removePhoto(this.userData.photos[index]);
  }

  /**
   * Clears all photos from the feature card context
   */
  clearPhotos() {
    this.userData.photos.forEach((photo) => {
      URL.revokeObjectURL(photo.previewUrl);
    });
    this.userData.photos = [];
  }
}

export const FEATURE_CARD_CONTEXT_KEY = Symbol('featureCardContext');

export const setFeatureCardContext = () =>
  setContext(FEATURE_CARD_CONTEXT_KEY, new FeatureCardContext());

export const getFeatureCardContext = (): FeatureCardContext =>
  getContext(FEATURE_CARD_CONTEXT_KEY);
