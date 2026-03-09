// SVELTE
import { setContext, getContext } from 'svelte'
// ENUMS
import { FeatureCardMode } from '$lib/enums'
// TYPES
import type { UploadedPhoto } from '$lib/db/zod/schema/image.types'

export class CardCtx {
  state = $state({
    mode: FeatureCardMode.Display,
  })
  userData = $state({
    missingReason: '',
    photos: [] as UploadedPhoto[],
    attribution: '',
  })
  validationError = $state('')
  isSubmitting = $state(false)

  setMode(mode: FeatureCardMode) {
    this.state.mode = mode
  }

  getMode() {
    return this.state.mode
  }

  isDisplayMode = $derived(this.state.mode === FeatureCardMode.Display)
  isNewMode = $derived(this.state.mode === FeatureCardMode.New)
  isMissingMode = $derived(this.state.mode === FeatureCardMode.Missing)
  isAddPhotoMode = $derived(this.state.mode === FeatureCardMode.AddPhoto)
  isSubmissionSuccessMode = $derived(
    this.state.mode === FeatureCardMode.SubmissionSuccess,
  )

  setMissingReason(reason: string) {
    this.userData.missingReason = reason
  }

  getMissingReason() {
    return this.userData.missingReason
  }

  setError(error: string) {
    this.validationError = error
  }

  getError() {
    return this.validationError
  }

  resetError() {
    this.validationError = ''
  }

  setAttribution(attribution: string) {
    this.userData.attribution = attribution
  }

  getAttribution() {
    return this.userData.attribution
  }
}

export const FEATURE_CARD_CONTEXT_KEY = Symbol('featureCardContext')

export const setCardCtx = () => setContext(FEATURE_CARD_CONTEXT_KEY, new CardCtx())

export const getCardCtx = (): CardCtx => {
  const ctx = getContext<CardCtx | undefined>(FEATURE_CARD_CONTEXT_KEY)
  if (!ctx) {
    throw new Error(
      'CardCtx context is missing. Ensure setCardCtx() is called before using getCardCtx().',
    )
  }
  return ctx
}
