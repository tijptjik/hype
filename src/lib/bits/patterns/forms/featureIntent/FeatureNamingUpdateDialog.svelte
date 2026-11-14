<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Dialog } from 'bits-ui'
import { Button } from '#lib/bits/core/index.js'
// API
import { previewFeatureNamingDefault } from '#lib/api/featureIntents.remote.js'
// TYPES
import type { FeatureIntentScope } from '#lib/db/services/featureIntentPolicy.js'
import type {
  FeatureIntentSettingsPatch,
  FeatureNamingUpdateOptions,
} from '#lib/features/intents.js'
import type { FeatureNamingUpdatePreview } from '#lib/db/services/featureNamingUpdate.js'
let {
  policyScope,
  patch,
  typeIds,
  typeNames = [],
  initialOptions,
  saveOnConfirm = false,
  onChoose,
  onCancel,
}: {
  policyScope: FeatureIntentScope
  patch: FeatureIntentSettingsPatch
  typeIds: string[]
  typeNames?: string[]
  saveOnConfirm?: boolean
  initialOptions?: FeatureNamingUpdateOptions
  onChoose: (token: string, options: FeatureNamingUpdateOptions) => void
  onCancel: () => void
} = $props()
let preview = $state<FeatureNamingUpdatePreview | null>(null)
let failed = $state(false)
let retry = $state(0)
let reviewing = $state(false)
const sameSelection = untrack(
  () =>
    initialOptions?.typeIds.length === typeIds.length &&
    typeIds.every(id => initialOptions?.typeIds.includes(id)),
)
let resetRules = $state(
  untrack(() => (sameSelection ? (initialOptions?.resetRules ?? false) : false)),
)
let resetTitles = $state(
  untrack(() => (sameSelection ? (initialOptions?.resetTitles ?? false) : false)),
)
const options = $derived({ typeIds, resetRules, resetTitles })
const lowerLevels = $derived(
  {
    hub: 'organisations, projects and layers',
    organisation: 'projects and layers',
    project: 'layers',
    layer: '',
  }[policyScope.type],
)
const updates = $derived(preview?.rows.filter(row => row.status === 'update') ?? [])
const excluded = $derived(preview?.rows.filter(row => row.status !== 'update') ?? [])
const reasons = $derived({
  override: 'Keeps its custom title or naming rule',
  descendant: 'Uses a custom rule at a lower level',
  unavailable: 'Not available for this naming change',
  update: 'Will use this template',
})
const excludedGroups = $derived(
  (['override', 'descendant', 'unavailable'] as const)
    .map(status => ({ status, rows: excluded.filter(row => row.status === status) }))
    .filter(group => group.rows.length > 0),
)
$effect(() => {
  retry
  preview = null
  failed = false
  if (!reviewing) return
  let cancelled = false
  const input = {
    scope: policyScope,
    patch: { ...patch, namingUpdateOptions: options },
  }
  // Remote commands track their own pending state; it must not retrigger this request.
  untrack(() => previewFeatureNamingDefault(input))
    .then(value => {
      if (!cancelled) preview = value
    })
    .catch(() => {
      if (!cancelled) failed = true
    })
  return () => {
    cancelled = true
  }
})
</script>
<Dialog.Root
  open
  onOpenChange={open => {
    if (!open) onCancel()
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm" />
    <Dialog.Content
      class="bits-theme border-border bg-panel text-foreground fixed top-1/2 left-1/2 z-[1001] flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border shadow-2xl"
      onInteractOutside={event => event.preventDefault()}
    >
      <header class="border-border/50 shrink-0 border-b px-5 py-4">
        <Dialog.Title class="text-lg font-semibold"
          >{reviewing
            ? resetRules || resetTitles
              ? 'Are you sure?'
              : 'Review name changes'
            : 'Where should this naming rule apply?'}</Dialog.Title
        >
        <Dialog.Description class="text-muted-foreground mt-1 text-sm"
          >{reviewing
            ? saveOnConfirm
              ? 'Check the affected features below. Confirming saves these changes immediately.'
              : 'Check the affected features below. These changes take effect when you save the form.'
            : 'Choose how to handle existing naming rules and custom feature titles for the selected feature types.'}</Dialog.Description
        >
      </header>
      <div class="min-h-0 space-y-5 overflow-y-auto p-5">
        {#if typeNames.length > 1}
          <p class="text-sm">
            These choices apply to all pending naming changes: {typeNames.join(', ')}.
          </p>
        {/if}
        {#if !reviewing}
          <fieldset class="grid gap-3">
            <legend class="mb-3 text-sm font-medium">Naming rules</legend>
            <label class="border-border flex items-start gap-3 rounded-md border p-3"
              ><input
                type="radio"
                name="naming-rules"
                bind:group={resetRules}
                value={false}
                class="mt-1"
              ><span
                ><strong class="text-sm">Only change the default</strong
                ><span class="text-muted-foreground mt-1 block text-sm"
                  >{lowerLevels
                    ? `Applies to all ${lowerLevels} that don’t have a custom value set.`
                    : 'Applies to features that don’t have a custom naming rule.'}</span
                ></span
              ></label
            >
            <label class="border-border flex items-start gap-3 rounded-md border p-3"
              ><input
                type="radio"
                name="naming-rules"
                bind:group={resetRules}
                value={true}
                class="mt-1"
              ><span
                ><strong class="text-sm"
                  >{lowerLevels
                    ? `Apply across all ${lowerLevels}`
                    : 'Apply to all features in this layer'}</strong
                ><span class="text-muted-foreground mt-1 block text-sm"
                  >{lowerLevels
                    ? `Resets custom naming rules in these ${lowerLevels} so they follow this default. Also replaces custom naming rules on their features.`
                    : 'Replaces custom naming rules on features so they follow this default.'}
                  Other feature types are unchanged.</span
                ></span
              ></label
            >
          </fieldset>
          <fieldset class="grid gap-3">
            <legend class="mb-3 text-sm font-medium">Custom titles</legend>
            <p class="text-muted-foreground text-sm">
              A custom title is a name someone entered instead of using the name
              generated by a template.
            </p>
            <label class="border-border flex items-start gap-3 rounded-md border p-3"
              ><input
                type="radio"
                name="naming-titles"
                bind:group={resetTitles}
                value={false}
                class="mt-1"
              ><span
                ><strong class="text-sm">Keep custom titles</strong
                ><span class="text-muted-foreground mt-1 block text-sm"
                  >Keep names that people entered for individual features.</span
                ></span
              ></label
            >
            <label class="border-border flex items-start gap-3 rounded-md border p-3"
              ><input
                type="radio"
                name="naming-titles"
                bind:group={resetTitles}
                value={true}
                class="mt-1"
              ><span
                ><strong class="text-sm"
                  >Reset all custom titles to follow the template</strong
                ><span class="text-muted-foreground mt-1 block text-sm"
                  >Replace custom titles on affected features with generated names.
                  You’ll review the old and new names before confirming. Features
                  protected by a custom naming rule are excluded unless you also reset
                  those rules.</span
                ></span
              ></label
            >
          </fieldset>
        {:else if failed}
          <p role="alert">
            Could not load the name changes. Try again before confirming.
          </p>
          <Button
            text={m.feature_model_retry_preview()}
            style="outline"
            onClick={() => retry++}
          />
        {:else if !preview}
          <p role="status">{m.feature_model_checking_existing()}</p>
        {:else}
          <p>
            {updates.length}
            features will follow this naming rule. {excluded.length} features will keep
            their current names.
          </p>
          {#if resetRules}
            <p class="text-sm">
              Custom rules will be removed from
              {preview.resetScopes?.length ?? 0}
              lower-level settings for the selected feature types.
            </p>
          {/if}
          {#if resetTitles}
            <p class="text-sm font-medium">
              Custom titles on the affected features will be replaced. Review these
              names before you confirm.
            </p>
          {/if}
          {#if updates.length}
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th class="p-2">{m.feature_model_language()}</th>
                    <th class="p-2">{m.feature_model_before()}</th>
                    <th class="p-2">{m.feature_model_after()}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each updates as row (row.id)}
                    {#each row.names as name (name.locale)}
                      <tr class="border-border/50 border-t">
                        <td class="p-2 align-top">{name.locale}</td>
                        <td class="p-2 align-top break-words">{name.before || '—'}</td>
                        <td class="p-2 align-top break-words">{name.after || '—'}</td>
                      </tr>
                    {/each}
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <p class="text-muted-foreground text-sm">
              No existing feature names will change.
            </p>
          {/if}
          {#if excluded.length}
            <details>
              <summary class="cursor-pointer text-sm">
                {m.feature_model_show_excluded({ count: String(excluded.length) })}
              </summary>
              {#each excludedGroups as group (group.status)}
                <div class="mt-4 space-y-2 text-sm">
                  <p class="text-muted-foreground font-medium">
                    {reasons[group.status]}
                    ({group.rows.length})
                  </p>
                  {#if group.status === 'unavailable'}
                    <p class="text-muted-foreground text-xs">
                      These features are retired, have no usable saved version, or could
                      not be matched to a feature type. Their names will stay unchanged.
                    </p>
                  {/if}
                  <ul class="space-y-2">
                    {#each group.rows as row (row.id)}
                      <li>{row.names[0]?.before || row.id}</li>
                    {/each}
                  </ul>
                </div>
              {/each}
            </details>
          {/if}
        {/if}
      </div>
      <footer
        class="border-border/50 flex shrink-0 flex-wrap justify-end gap-2 border-t p-4"
      >
        <Button
          text={reviewing ? 'Back' : m.cancel()}
          style="ghost"
          onClick={() => {
            if (reviewing) reviewing = false
            else onCancel()
          }}
        />
        {#if reviewing}
          <Button
            text={resetRules || resetTitles ? 'Confirm changes' : 'Apply naming rule'}
            disabled={!preview || failed}
            onClick={() => {
              if (preview) onChoose(preview.token, options)
            }}
          />
        {:else}
          <Button text="Review changes" onClick={() => (reviewing = true)} />
        {/if}
      </footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
