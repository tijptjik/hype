// I18N
import { getI18n, m } from '$lib/i18n'
// TYPES
import type { Feature, FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { HubSubscriptionModelParams } from '$lib/adapters/hub/useHubSubscriptionModel.svelte'
import type { HubSubscriptionPlacement, HubUserStateFlags } from '$lib/types'

type HubSubscriptionI18n = Record<string, Record<string, string | null | undefined>>

type HubSubscriptionModelParamsInput = {
  hubI18n: HubSubscriptionI18n
  isSubscriptionConfigured: boolean
  subscriptionPlacement?: Partial<HubSubscriptionPlacement> | null
  userState: HubUserStateFlags
  features: Array<FeatureFromCollection | Feature>
  userPreferences: Parameters<typeof getI18n>[2]
  isLoading: boolean
  onSelect: () => void | Promise<void>
  onJoin: () => void | Promise<void>
  onDismiss: () => void | Promise<void>
}

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. HELPERS
// - toHubUserStateFlags
// - getSubscriptionFeatureImages
//
// 2. FACTORIES
// - createHubSubscriptionModelParams
// ---

/********************
 *  1. HELPERS
 ************/
// +++ Helpers

/**
 * Normalises partial hub user flags into a stable boolean object for UI state.
 *
 * @param value - Partial flags returned from loaders or remote calls.
 * @returns Fully-populated flag set for subscription UI logic.
 */
export function toHubUserStateFlags(
  value: Partial<HubUserStateFlags> | null | undefined,
): HubUserStateFlags {
  return {
    subscriptionPromptDismissed: value?.subscriptionPromptDismissed ?? false,
    subscriptionMember: value?.subscriptionMember ?? false,
    hasAgreedToTerms: value?.hasAgreedToTerms ?? false,
  }
}

/**
 * Selects up to 32 feature images from the features currently visible on the map.
 *
 * @param features - Visible features from app context.
 * @returns Ordered list of image envelopes suitable for decorative subscription use.
 */
export function getSubscriptionFeatureImages(
  features: Array<FeatureFromCollection | Feature>,
): ImageCtxEnvelope[] {
  const images: ImageCtxEnvelope[] = []

  for (const feature of features) {
    const primaryImage = (feature.image as ImageCtxEnvelope | null | undefined) ?? null
    const galleryImages = Array.isArray(feature.images)
      ? (feature.images as ImageCtxEnvelope[])
      : []

    if (primaryImage) {
      images.push(primaryImage)
    }

    for (const image of galleryImages) {
      if (!primaryImage || image.image.id !== primaryImage.image.id) {
        images.push(image)
      }
    }

    if (images.length >= 32) {
      return images.slice(0, 32)
    }
  }

  return images.slice(0, 32)
}

// ---
/********************
 *  2. FACTORIES
 ************/
// +++ Factories

/**
 * Builds the adapter input used by subscription UI surfaces in the app shell.
 *
 * @param input - Hub content, visible features, user preferences, and UI handlers.
 * @returns Stable adapter input for `useHubSubscriptionModel`.
 */
export function createHubSubscriptionModelParams(
  input: HubSubscriptionModelParamsInput,
): HubSubscriptionModelParams {
  const hubName = getI18n(input.hubI18n, 'nameShort', input.userPreferences, 'this hub')

  return {
    isSubscriptionAvailable: input.isSubscriptionConfigured,
    subscriptionPlacement: {
      hubPanel: input.subscriptionPlacement?.hubPanel ?? false,
      topBar: input.subscriptionPlacement?.topBar ?? false,
      menu: input.subscriptionPlacement?.menu ?? true,
    },
    userState: input.userState,
    featureImages: getSubscriptionFeatureImages(input.features),
    privacyPolicyTitle: m.hub__subscription_privacy_policy(),
    termsOfServiceTitle: m.hub__subscription_terms_of_service(),
    privacyPolicyMarkdown: getI18n(
      input.hubI18n,
      'privacyPolicy',
      input.userPreferences,
      '',
      true,
    ),
    termsOfServiceMarkdown: getI18n(
      input.hubI18n,
      'termsOfService',
      input.userPreferences,
      '',
      true,
    ),
    copy: {
      title: m.hub__subscription_title(),
      panelDescription: m.hub__subscription_panel_description({
        hubName,
      }),
      overlayDescription: m.hub__subscription_bar_description({
        hubName,
      }),
      ctaText: m.hub__subscription_cta(),
      dismissText: m.hub__subscription_dismiss(),
      privacyText: m.hub__subscription_privacy_policy(),
      termsText: m.hub__subscription_terms_of_service(),
    },
    isLoading: input.isLoading,
    isDisabled: input.isLoading,
    onSelect: input.onSelect,
    onJoin: input.onJoin,
    onDismiss: input.onDismiss,
  }
}
