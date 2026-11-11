<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { FeatureNameRule } from '#lib/features/locationPolicy.js'
let {
  scopeType,
  override,
  onChange,
  disabled = false,
  expanded = false,
  editorId,
  triggerId,
  onConfigure,
}: {
  scopeType: 'hub' | 'project' | 'layer'
  override?: FeatureNameRule
  onChange: (rule: FeatureNameRule | undefined) => void
  disabled?: boolean
  expanded?: boolean
  editorId: string
  triggerId: string
  onConfigure: () => void
} = $props()
const parent = $derived(
  scopeType === 'layer' ? 'project' : scopeType === 'project' ? 'hub' : 'application',
)
</script>
<section
  class="grid min-w-0 gap-2"
  aria-label="Title naming policy"
  data-naming-summary
>
  <h3 class="text-muted-foreground text-xs font-medium">Naming rules</h3>
  {#if override}
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm">
        {#if override.registry}
          {m.display_templates_pinned({ version: String(override.registry.version) })}
        {:else if override.conditions.length}
          Custom rules
          <span class="text-muted-foreground"
            >· {override.conditions.length}
            {override.conditions.length === 1 ? 'condition' : 'conditions'}</span
          >
        {:else}
          Changed base name
        {/if}
      </p>
      {#if !disabled}
        <button
          type="button"
          disabled={disabled || expanded}
          aria-label={`Reset to ${parent} default`}
          onclick={() => onChange(undefined)}
          class="text-muted-foreground hover:text-foreground focus-visible:outline-primary rounded px-2 py-1 text-xs underline underline-offset-2 focus-visible:outline-2 disabled:opacity-40"
        >
          Reset
        </button>
      {/if}
    </div>
  {:else if disabled}
    <p class="text-sm">Using the {parent === 'hub' ? 'Hub' : parent} default</p>
  {/if}
  {#if !disabled}
    <button
      id={triggerId}
      type="button"
      aria-expanded={expanded}
      aria-controls={editorId}
      onclick={onConfigure}
      class="border-border hover:bg-muted focus-visible:outline-primary w-full rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-2"
    >
      {expanded
        ? 'Go to naming editor'
        : override
          ? 'Configure naming rule'
          : 'Define custom rules'}
    </button>
  {/if}
</section>
