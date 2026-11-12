<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import FeatureNamingSettings from './FeatureNamingSettings.svelte'
import FeatureIntentHelp from './FeatureIntentHelp.svelte'
// TYPES
import type { FeatureNameRule } from '#lib/features/locationPolicy.js'
let {
  id,
  scopeType,
  scopeId,
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
<section
  {id}
  class="border-border/50 min-w-0 border-t pt-4 lg:col-span-3"
  style:scroll-margin-top="calc(var(--feature-type-toolbar-height, 0px) + 1.5rem)"
  aria-labelledby={`${id}-title`}
  data-naming-editor
>
  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
    <div class="flex items-center gap-1">
      <h3 id={`${id}-title`} tabindex="-1" class="text-base font-semibold outline-none">
        Rule-based feature naming
      </h3>
      <FeatureIntentHelp topic="naming" label="About naming rules" />
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <p class="text-sm">
        {isOverriding ? 'Custom rules' : 'Using inherited default'}
      </p>
      {#if !disabled}
        <button
          type="button"
          aria-label="Reset to inherited default"
          onclick={() => onAccept(undefined)}
          class="text-muted-foreground hover:text-foreground focus-visible:outline-primary rounded px-2 py-1 text-sm underline underline-offset-2 focus-visible:outline-2"
        >
          Reset
        </button>
      {/if}
    </div>
  </div>
  <FeatureNamingSettings
    {scopeType}
    {scopeId}
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
  />
  <footer
    class="border-border/50 mt-3 flex flex-wrap items-center justify-end gap-3 border-t pt-3"
  >
    <div class="flex gap-2">
      <Button text={disabled ? 'Close' : 'Cancel'} style="ghost" onClick={onCancel} />
      {#if !disabled}
        <Button
          text="Accept naming rule"
          disabled={editingTemplate}
          onClick={() =>
            onAccept(
              isOverriding ? structuredClone($state.snapshot(draftRule)) : undefined,
            )}
        />
      {/if}
    </div>
  </footer>
</section>
