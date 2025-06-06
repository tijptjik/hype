// SVELTE
import { setContext, getContext } from 'svelte';
// ENUMS
import { FeatureCardMode } from '$lib/enums';
// TYPES
import type { UploadedPhoto } from '$lib/types';
// I18N
import { m } from '$lib/i18n';

export class FeatureCardContext {
  state = $state({
    mode: FeatureCardMode.Display
  });
  userData = $state({
    missingReason: '',
    photos: [] as UploadedPhoto[],
    attribution: ''
  });
  validationError = $state('');
  isSubmitting = $state(false);

  setMode(mode: FeatureCardMode) {
    this.state.mode = mode;
  }

  getMode() {
    return this.state.mode;
  }

  isDisplayMode = $derived(this.state.mode === FeatureCardMode.Display);
  isNewMode = $derived(this.state.mode === FeatureCardMode.New);
  isMissingMode = $derived(this.state.mode === FeatureCardMode.Missing);
  isAddPhotoMode = $derived(this.state.mode === FeatureCardMode.AddPhoto);

  setMissingReason(reason: string) {
    this.userData.missingReason = reason;
  }

  getMissingReason() {
    return this.userData.missingReason;
  }
  // UTILS
  /**
   * Adds a photo to the feature card context
   */
  addPhoto(photo: UploadedPhoto) {
    if (
      this.getError() === m.validation__at_least_one_image() ||
      this.getError() === m.validation__at_least_one_image_as_evidence()
    ) {
      this.resetError();
    }
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

  setError(error: string) {
    this.validationError = error;
  }

  getError() {
    return this.validationError;
  }

  resetError() {
    this.validationError = '';
  }

  setAttribution(attribution: string) {
    this.userData.attribution = attribution;
  }

  getAttribution() {
    return this.userData.attribution;
  }
}

export const FEATURE_CARD_CONTEXT_KEY = Symbol('featureCardContext');

export const setFeatureCardContext = () =>
  setContext(FEATURE_CARD_CONTEXT_KEY, new FeatureCardContext());

export const getFeatureCardContext = (): FeatureCardContext =>
  getContext(FEATURE_CARD_CONTEXT_KEY);
