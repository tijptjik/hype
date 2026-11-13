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
  scopeType: 'hub' | 'organisation' | 'project' | 'layer'
  override?: FeatureNameRule
  onChange: (rule: FeatureNameRule | undefined) => void
  disabled?: boolean
  expanded?: boolean
  editorId: string
  triggerId: string
  onConfigure: () => void
} = $props()
const parent = $derived(
  scopeType === 'layer'
    ? m.feature_model_scope_project()
    : scopeType === 'project'
      ? m.feature_model_scope_organisation()
      : scopeType === 'organisation'
        ? m.feature_model_scope_hub()
        : m.feature_model_scope_application(),
)
</script>
<section
  class="grid min-w-0 gap-2"
  aria-label={m.feature_model_naming_policy()}
  data-naming-summary
>
  <h3 class="text-muted-foreground text-xs font-medium">
    {m.feature_model_naming_rules()}
  </h3>
  {#if override}
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm">
        {#if override.registry}
          {m.display_templates_pinned({ version: String(override.registry.version) })}
        {:else if override.conditions.length}
          {m.feature_model_custom_rules()}
          <span class="text-muted-foreground"
            >{m.feature_model_condition_count({
              count: String(override.conditions.length),
            })}</span
          >
        {:else}
          {m.feature_model_changed_base()}
        {/if}
      </p>
      {#if !disabled}
        <button
          type="button"
          disabled={disabled || expanded}
          aria-label={m.feature_model_reset_default({ scope: parent })}
          onclick={() => onChange(undefined)}
          class="text-muted-foreground hover:text-foreground focus-visible:outline-primary rounded px-2 py-1 text-xs underline underline-offset-2 focus-visible:outline-2 disabled:opacity-40"
        >
          {m.forms__reset()}
        </button>
      {/if}
    </div>
  {:else}
    <p class="text-sm">{m.feature_model_using_default({ scope: parent })}</p>
  {/if}
  {#if !disabled}
    <button
      id={triggerId}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-controls={editorId}
      onclick={onConfigure}
      class="border-border hover:bg-muted focus-visible:outline-primary w-full rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-2"
    >
      {expanded
        ? m.feature_model_editor_open()
        : override
          ? m.feature_model_configure_naming()
          : m.feature_model_define_rules()}
    </button>
  {/if}
</section>
