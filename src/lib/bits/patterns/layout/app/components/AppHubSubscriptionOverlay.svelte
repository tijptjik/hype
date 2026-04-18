<script lang="ts">
// BITS
import { HubPolicyDialog, HubSubscriptionOverlay } from '$lib/bits'
import { cx } from '$lib/bits/utils'
// TYPES
import type { HubSubscriptionOverlayProps } from '$lib/bits/patterns/bars'
import type { HubPolicyDialogProps } from '$lib/bits/patterns/policies'

type AppHubSubscriptionOverlayProps = {
  isVisible?: boolean
  offsetX?: number
  class?: string
  subscriptionOverlayProps: HubSubscriptionOverlayProps
  privacyPolicyDialogProps: HubPolicyDialogProps
  termsOfServiceDialogProps: HubPolicyDialogProps
}

let {
  isVisible = false,
  offsetX = 0,
  class: className = '',
  subscriptionOverlayProps,
  privacyPolicyDialogProps,
  termsOfServiceDialogProps,
}: AppHubSubscriptionOverlayProps = $props()

let isPrivacyPolicyOpen = $state(false)
let isTermsOfServiceOpen = $state(false)
</script>

{#if isVisible}
  <div
    class={cx(
      'pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-4 py-6 transition-transform duration-260 ease-[ease] md:px-6',
      className,
    )}
    style={`transform: translateX(${offsetX}px);`}
  >
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--color-accent)_10%,transparent),color-mix(in_oklab,var(--color-base-400)_52%,transparent)_58%,color-mix(in_oklab,var(--color-base-400)_78%,transparent))]"
    ></div>

    <div class="pointer-events-auto relative w-full">
      <HubSubscriptionOverlay
        {...subscriptionOverlayProps}
        onPrivacyClick={() => {
          isPrivacyPolicyOpen = true
        }}
        onTermsClick={() => {
          isTermsOfServiceOpen = true
        }}
      />
    </div>
  </div>

  <HubPolicyDialog
    {...privacyPolicyDialogProps}
    bind:open={isPrivacyPolicyOpen}
    hideTrigger={true}
  />
  <HubPolicyDialog
    {...termsOfServiceDialogProps}
    bind:open={isTermsOfServiceOpen}
    hideTrigger={true}
  />
{/if}
