<script lang="ts">
// SVELTE
import { tick } from 'svelte'
// DIALOG
import { Dialog } from 'bits-ui'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import FeatureTitleTemplate from './FeatureTitleTemplate.svelte'
// TYPES
import type { FeatureNameRule } from '#lib/features/locationPolicy.js'

let {
  rule = null,
  scopeId,
  locale,
  fromLocation = false,
  custom = false,
  editable = false,
  required = false,
  onCustomize,
  onRestore,
  onLocation,
}: {
  rule?: FeatureNameRule | null
  scopeId: string
  locale: string
  fromLocation?: boolean
  custom?: boolean
  editable?: boolean
  required?: boolean
  onCustomize: () => void
  onRestore: () => void
  onLocation: () => void
} = $props()
let expanded = $state(false)
const template = $derived(Boolean(rule?.conditions.length || rule?.base === 'feature'))
const automatic = $derived(!custom && (fromLocation || Boolean(rule)))
const actionClass =
  'text-primary decoration-primary/40 focus-visible:outline-primary rounded py-1 underline underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2'

/** Keep the displayed title as an override and immediately enter its inline editor.
 * @param event Click identifying the corresponding language row.
 * @returns Completion once the updated title control has opened.
 */
async function customize(event: MouseEvent): Promise<void> {
  const button = event.currentTarget as HTMLButtonElement
  const field = button.closest('[data-profile-field]')
  onCustomize()
  await tick()
  const row = Array.from(
    field?.querySelectorAll<HTMLElement>('[data-profile-locale]') ?? [],
  ).find(element => element.dataset.profileLocale === locale)
  row?.querySelector<HTMLElement>('[role="button"]')?.click()
}
</script>

<Dialog.Root bind:open={expanded}>
  <div
    class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs"
    data-title-source
  >
    <span class="text-muted-foreground inline-flex min-h-7 items-center">
      {#if custom}
        {m.feature_title_custom()}
      {:else if template}
        {m.feature_title_template()}
        {#if fromLocation}
          · {m.feature_name_derived_help()}
        {/if}
      {:else if fromLocation}
        {m.feature_name_derived_help()}
      {/if}
    </span>
    <div
      class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1"
    >
      {#if template}
        <Dialog.Trigger type="button" class={actionClass}
          >{m.feature_title_view_template()}</Dialog.Trigger
        >
      {/if}
      {#if editable}
        {#if automatic && !required}
          <button
            type="button"
            class={actionClass}
            title={m.feature_title_customize_help()}
            onclick={customize}
          >
            {m.feature_separate_name()}
          </button>
        {:else if custom && (rule || fromLocation)}
          <button type="button" class={actionClass} onclick={onRestore}>
            {template ? m.feature_title_use_template() : m.feature_use_location_name()}
          </button>
        {/if}
        {#if fromLocation}
          <button type="button" class={actionClass} onclick={onLocation}>
            {m.feature_title_go_location()}
          </button>
        {/if}
      {/if}
    </div>
  </div>
  {#if rule}
    <Dialog.Portal>
      <Dialog.Overlay class="bits-dialog__overlay" />
      <Dialog.Content
        class="bits-dialog__content bits-theme max-h-[85dvh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto"
      >
        <Dialog.Title class="bits-dialog__title"
          >{m.feature_title_template()}</Dialog.Title
        >
        <Dialog.Description class="text-muted-foreground mb-4 text-sm"
          >{m.feature_title_template_help()}</Dialog.Description
        >
        <FeatureTitleTemplate {scopeId} {rule} {locale} />
        <Dialog.Close class={`${actionClass} mt-4`}
          >{m.feature_title_close()}</Dialog.Close
        >
      </Dialog.Content>
    </Dialog.Portal>
  {/if}
</Dialog.Root>
