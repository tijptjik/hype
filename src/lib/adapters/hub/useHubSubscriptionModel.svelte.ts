// TYPES
import type { HubSubscriptionOverlayProps } from '$lib/bits/patterns/bars'
import type { HubPanelSubscriptionProps } from '$lib/bits/patterns/panels/hubPanelSubscription'
import type { HubPolicyDialogProps } from '$lib/bits/patterns/policies'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { HubSubscriptionPlacement, HubUserStateFlags } from '$lib/types'

export interface AppMenuSubscriptionItemProps {
  label?: string
  isDisabled?: boolean
  onSelect?: () => void | Promise<void>
}

type HubSubscriptionCopy = {
  title?: string
  panelDescription?: string
  overlayDescription?: string
  hubNameShort?: string
  subscriptionBenefits?: string
  ctaText?: string
  dismissText?: string
  privacyText?: string
  termsText?: string
}

export type HubSubscriptionModelParams = {
  isSubscriptionAvailable: boolean
  subscriptionPlacement: HubSubscriptionPlacement
  hubCode?: string
  userState?: HubUserStateFlags | null
  featureImages?: ImageCtxEnvelope[]
  privacyPolicyTitle?: string
  termsOfServiceTitle?: string
  privacyPolicyMarkdown?: string | null
  termsOfServiceMarkdown?: string | null
  copy?: HubSubscriptionCopy
  isLoading?: boolean
  isDisabled?: boolean
  onSelect?: () => void | Promise<void>
  onJoin?: () => void | Promise<void>
  onDismiss?: () => void | Promise<void>
}

type HubSubscriptionVisibility = {
  showHubPanelSubscription: boolean
  showHubSubscriptionOverlay: boolean
  showAppMenuSubscriptionItem: boolean
}

type UseHubSubscriptionModelResult = {
  getVisibility: () => HubSubscriptionVisibility
  getHubPanelSubscriptionProps: () => HubPanelSubscriptionProps
  getHubSubscriptionOverlayProps: () => HubSubscriptionOverlayProps
  getAppMenuSubscriptionItemProps: () => AppMenuSubscriptionItemProps
  getPrivacyPolicyDialogProps: () => HubPolicyDialogProps
  getTermsOfServiceDialogProps: () => HubPolicyDialogProps
}

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. VISIBILITY
// - getSubscriptionVisibility
//
// 2. ADAPTER
// - useHubSubscriptionModel
// ---

/********************
 *  1. VISIBILITY
 ************/
// +++ Visibility

/**
 * Computes which subscription surfaces should render for the current hub/user state.
 *
 * @param params - Subscription availability, placement flags, and user state.
 * @returns Visibility flags for each frontend subscription surface.
 */
function getSubscriptionVisibility(
  params: Pick<
    HubSubscriptionModelParams,
    'isSubscriptionAvailable' | 'subscriptionPlacement' | 'userState'
  >,
): HubSubscriptionVisibility {
  const userState = params.userState ?? {}

  return {
    showHubPanelSubscription:
      params.isSubscriptionAvailable &&
      params.subscriptionPlacement.hubPanel &&
      !userState.subscriptionMember,
    showHubSubscriptionOverlay:
      params.isSubscriptionAvailable &&
      params.subscriptionPlacement.topBar &&
      !userState.subscriptionPromptDismissed &&
      !userState.subscriptionMember,
    showAppMenuSubscriptionItem:
      params.isSubscriptionAvailable &&
      params.subscriptionPlacement.menu &&
      !userState.subscriptionMember,
  }
}

// ---
/********************
 *  2. ADAPTER
 ************/
// +++ Adapter

/**
 * Maps hub subscription state into prop-driven pattern contracts for app surfaces.
 *
 * @param getParams - Getter returning the latest subscription state, copy, and handlers.
 * @returns Adapter helpers for visibility plus each subscription-related pattern.
 */
export function useHubSubscriptionModel(
  getParams: () => HubSubscriptionModelParams,
): UseHubSubscriptionModelResult {
  return {
    getVisibility: () => {
      const params = getParams()
      return getSubscriptionVisibility(params)
    },
    getHubPanelSubscriptionProps: () => {
      const params = getParams()

      return {
        title: params.copy?.title,
        description: params.copy?.panelDescription,
        ctaText: params.copy?.ctaText,
        isLoading: params.isLoading,
        isDisabled: params.isDisabled,
        privacyText: params.copy?.privacyText,
        termsText: params.copy?.termsText,
        onJoin: params.onJoin,
      }
    },
    getHubSubscriptionOverlayProps: () => {
      const params = getParams()

      return {
        title: params.copy?.title,
        description: params.copy?.overlayDescription,
        hubCode: params.hubCode,
        hubNameShort: params.copy?.hubNameShort,
        subscriptionBenefits: params.copy?.subscriptionBenefits,
        featureImages: params.featureImages,
        ctaText: params.copy?.ctaText,
        dismissText: params.copy?.dismissText,
        isLoading: params.isLoading,
        isDisabled: params.isDisabled,
        privacyText: params.copy?.privacyText,
        termsText: params.copy?.termsText,
        onJoin: params.onJoin,
        onDismiss: params.onDismiss,
      }
    },
    getAppMenuSubscriptionItemProps: () => {
      const params = getParams()

      return {
        label: params.copy?.ctaText,
        isDisabled: params.isDisabled,
        onSelect: params.onSelect,
      }
    },
    getPrivacyPolicyDialogProps: () => {
      const params = getParams()

      return {
        title: params.privacyPolicyTitle ?? 'Privacy policy',
        markdown: params.privacyPolicyMarkdown,
        triggerText: params.copy?.privacyText ?? 'Privacy policy',
      }
    },
    getTermsOfServiceDialogProps: () => {
      const params = getParams()

      return {
        title: params.termsOfServiceTitle ?? 'Terms of service',
        markdown: params.termsOfServiceMarkdown,
        triggerText: params.copy?.termsText ?? 'Terms of service',
      }
    },
  }
}
