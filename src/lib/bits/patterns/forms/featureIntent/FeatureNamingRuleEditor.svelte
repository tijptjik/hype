<script lang="ts">
// SVELTE
import { untrack, type Snippet } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Dialog } from 'bits-ui'
// COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import FeatureNamingSettings from './FeatureNamingSettings.svelte'
// TYPES
import type { FeatureNameRule } from '#lib/features/locationPolicy.js'
let {
  id,
  scopeType,
  scopeId,
  featureType,
  inheritedRule,
  override,
  locales,
  disabled = false,
  onAccept,
  onCancel,
}: {
  id: string
  scopeType: 'hub' | 'organisation' | 'project' | 'layer'
  scopeId: string
  featureType?: string
  inheritedRule: FeatureNameRule
  override?: FeatureNameRule
  locales: string[]
  disabled?: boolean
  onAccept: (rule: FeatureNameRule | undefined) => void
  onCancel: () => void
} = $props()
// This component mounts for each edit session; the parent rule stays untouched until Accept.
let draftRule = $state<FeatureNameRule>(
  untrack(() => structuredClone($state.snapshot(override ?? inheritedRule))),
)
let editingTemplate = $state(false)
let isOverriding = $state(untrack(() => override !== undefined))
</script>
{#snippet footer(templateActions: Snippet, creating: boolean)}
  <footer
    class="border-border/50 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-4 py-3 sm:px-5"
  >
    {@render templateActions()}
    {#if disabled}
      <Button text={m.guest__close()} style="ghost" onClick={onCancel} />
    {/if}
    {#if !disabled && !creating}
      <Button
        text={m.feature_model_accept_rule()}
        disabled={editingTemplate}
        onClick={() =>
          onAccept(
            isOverriding ? structuredClone($state.snapshot(draftRule)) : undefined,
          )}
      />
    {/if}
  </footer>
{/snippet}
<Dialog.Root
  open={true}
  onOpenChange={open => {
    if (!open) onCancel()
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm" />
    <Dialog.Content
      {id}
      class="bits-theme border-border bg-panel text-foreground fixed top-1/2 left-1/2 z-[1001] flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border shadow-2xl"
      onInteractOutside={event => event.preventDefault()}
      onCloseAutoFocus={event => event.preventDefault()}
      data-naming-editor
    >
      <header
        class="border-border/50 flex shrink-0 flex-wrap items-start justify-between gap-4 border-b px-4 py-3 sm:px-5"
      >
        <div class="min-w-0">
          <Dialog.Title id={`${id}-title`} class="text-lg font-semibold"
            >{editingTemplate
              ? m.feature_model_create_template()
              : m.feature_model_feature_naming({
                  level: {
                    hub: m.resource__hub_singular(),
                    organisation: m.resource__organisation_singular(),
                    project: m.resource__project_singular(),
                    layer: m.resource__layer_singular(),
                  }[scopeType],
                })}</Dialog.Title
          >
          <Dialog.Description class="text-muted-foreground mt-1 text-xs"
            >{editingTemplate
              ? m.feature_model_create_description()
              : m.feature_model_naming_description()}</Dialog.Description
          >
        </div>
        {#if !editingTemplate}
          <span class="text-muted-foreground shrink-0 pt-1 text-xs"
            >{isOverriding
              ? m.feature_model_custom_rule()
              : m.feature_model_inherited_default()}</span
          >
        {/if}
      </header>
      <FeatureNamingSettings
        {scopeType}
        {scopeId}
        {featureType}
        {locales}
        rule={draftRule}
        {disabled}
        {inheritedRule}
        inheriting={!isOverriding}
        onUseDefault={() => {
          draftRule = structuredClone($state.snapshot(inheritedRule))
          isOverriding = false
        }}
        onChange={rule => {
          draftRule = rule
          isOverriding = true
        }}
        onEditingChange={editing => (editingTemplate = editing)}
        onSaved={rule => onAccept(rule)}
        {footer}
      />
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
