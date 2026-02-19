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
// COMPONENTS
import Panel from '$lib/components/layout/Panel.svelte'
import Header from '$lib/components/panels/common/Header.svelte'
// TYPES
import type { PanelProps, Hub } from '$lib/types'

// CONTEXT
const appCtx = getAppCtx()

// PROPS
let { hub } = $props<{ hub: Hub }>()

// STATE
// svelte-ignore non_reactive_update
let panelContainer: HTMLDivElement

let panelProps: PanelProps = $derived({
  panelType: 'hub',
  position: 'left',
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
</script>

<Panel bind:panelContainer {...panelProps}>
  <Header {...panelProps} title={m.menu_about()} />
  <div
    class="h-calc(100vh-10rem) flex flex-col items-stretch overflow-y-auto overscroll-none"
  >
    <h2 class="flex-grow-0 p-6 text-lg font-semibold uppercase tracking-widest">
      {getI18n(hub, 'nameShort', appCtx.getUserPreferences(), m.menu_about())}
    </h2>
    <div class="preformatted mb-12">
      <p class="mb-12">
        {@html getI18n(hub, 'description', appCtx.getUserPreferences(), m.menu_about())}
      </p>
    </div>
  </div>
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
  border-bottom: 2px !important;
  border-color: red !important;
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
