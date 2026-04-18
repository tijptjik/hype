<!--
  @component
  Prisms panel component that displays hierarchical resources (organisations, projects, and layers)
  with filtering and selection capabilities.
-->
<script lang="ts">
// I18N
import { getI18n, m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// BITS
import { HubPanelSubscription, HubPolicyDialog, PanelRoot as Panel } from '$lib/bits'
import Header from '$lib/components/panels/common/Header.svelte'
// ENUMS
import { Panel as PanelEnum, PanelSide } from '$lib/enums'
// TYPES
import type { HubPolicyDialogProps } from '$lib/bits/patterns/policies'
import type { HubPanelSubscriptionProps } from '$lib/bits/patterns/panels/hubPanelSubscription'
import type { PanelProps } from '$lib/types'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'

// CONTEXT
const appCtx = getAppCtx()

// PROPS
let {
  hub,
  subscriptionProps,
  showSubscription = false,
  privacyPolicyDialogProps,
  termsOfServiceDialogProps,
}: {
  hub: HubOptsExtended
  subscriptionProps?: HubPanelSubscriptionProps
  showSubscription?: boolean
  privacyPolicyDialogProps?: HubPolicyDialogProps
  termsOfServiceDialogProps?: HubPolicyDialogProps
} = $props()
const hubI18n = $derived(
  (hub?.i18n ?? {}) as Record<string, Record<string, string | null | undefined>>,
)

// STATE
// svelte-ignore non_reactive_update
let panelContainer: HTMLDivElement

let panelProps: PanelProps = $derived({
  panelType: PanelEnum.hub,
  position: PanelSide.left,
  scrollable: true,
  inline: appCtx.isAdmin(),
  isNarrow: false,
  isAdmin: false,
  active: {
    resourceType: appCtx.getActiveResourceType(),
    resourceRef: appCtx.getActiveResourceRef(),
    resourceId: appCtx.getActiveResourceId(),
    facet: appCtx.getActiveFacet(),
  },
})

let isPrivacyPolicyOpen = $state(false)
let isTermsOfServiceOpen = $state(false)
</script>

<Panel bind:panelContainer {...panelProps}>
  <Header {...panelProps} title={m.menu_about()} />
  <div
    class="h-calc(100vh-10rem) flex flex-col items-stretch overflow-y-auto overscroll-contain"
  >
    <h2 class="grow-0 p-6 text-lg font-semibold uppercase tracking-widest">
      {getI18n(hubI18n, 'nameShort', appCtx.getUserPreferences(), m.menu_about())}
    </h2>
    <div class="preformatted mb-12">
      <p class="mb-12">
        {@html getI18n(
          hubI18n,
          'description',
          appCtx.getUserPreferences(),
          m.menu_about(),
        )}
      </p>
    </div>
    {#if showSubscription && subscriptionProps}
      <HubPanelSubscription
        {...subscriptionProps}
        onPrivacyClick={() => {
          isPrivacyPolicyOpen = true
        }}
        onTermsClick={() => {
          isTermsOfServiceOpen = true
        }}
      />
    {/if}
  </div>

  {#if privacyPolicyDialogProps}
    <HubPolicyDialog
      {...privacyPolicyDialogProps}
      bind:open={isPrivacyPolicyOpen}
      hideTrigger={true}
    />
  {/if}

  {#if termsOfServiceDialogProps}
    <HubPolicyDialog
      {...termsOfServiceDialogProps}
      bind:open={isTermsOfServiceOpen}
      hideTrigger={true}
    />
  {/if}
</Panel>

<style>
@reference "../../styles/app.css";

:global(.preformatted) {
  white-space: pre-wrap;
}
:global(.preformatted h2) {
  @apply text-lg font-semibold uppercase tracking-widest text-primary;
}
:global(.preformatted h3) {
  @apply pb-0 font-semibold uppercase tracking-widest;
}
:global(.preformatted p) {
  @apply text-base-content/80;
}
:global(.preformatted ul) {
  @apply list-disc pl-4;
}
:global(.preformatted li) {
  @apply mb-2;
}
:global(.preformatted a) {
  @apply inline-block text-primary underline;
  @apply hover:text-primary-content;
  @apply hover:transition-all;
  @apply hover:duration-300;
  @apply border-b-1;
  @apply border-primary;
  border-bottom: 2px;
  border-color: red;
}
:global(.preformatted strong) {
  @apply font-semibold;
}
:global(.preformatted em) {
  @apply italic;
}
:global(.preformatted footer) {
  justify-content: end;
}

:global(.preformatted) {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 1.5rem;
  min-height: 0;
}

:global(.preformatted footer) {
  flex-shrink: 0;
}
:global(.preformatted img) {
  margin: 0 auto;
  width: 100%;
  max-width: 320px;
}
</style>
