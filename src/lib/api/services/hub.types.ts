// TYPES

/* ----------------- */
// HUB
/* -------- */

export type HubSubscriptionPlacement = {
  hubPanel: boolean
  topBar: boolean
  menu: boolean
}

export type HubUserStateFlags = {
  subscriptionPromptDismissed?: boolean
  subscriptionMember?: boolean
  hasAgreedToTerms?: boolean
}
