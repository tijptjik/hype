<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
import { contentFormKey } from '#lib/i18n/contentRecords.js'
// ADAPTERS
import { useTaskReviewDetails } from '#lib/adapters/tasks/useTaskReviewDetails.svelte.js'
// COMPONENTS
import * as TaskPrimitive from './index'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import { shortLocaleLabel } from '#lib/bits/custom/localeControls/localeControls.js'
import FormI18nInlineRow from '#lib/bits/patterns/forms/formI18nSection/components/FormI18nInlineRow.svelte'
import { fieldLabelStyles } from '#lib/bits/custom/form/fieldTypography.styles.js'
// TYPES
import type { TaskEditorProps } from '../task.types'

let {
  task,
  type,
  loading = false,
  assignableLayers = [],
  canReassignLayer = false,
  isLayerBusy = false,
  onReassignLayer,
  localeState: controlledLocaleState,
}: TaskEditorProps & { type?: string; loading?: boolean } = $props()
const model = useTaskReviewDetails(
  () => task,
  () => type,
  () => loading,
  () => controlledLocaleState,
)

/** Preserves report text and marks empty values.
 * @param value Submitted text.
 * @returns Display text.
 */
function normalizeDisplayValue(value: string | null | undefined): string {
  if (typeof value !== 'string') return '-'
  return value.trim().length > 0 ? value : '-'
}
</script>

<div class="min-h-[200px] shrink-0" data-task-review-details>
  {#if task?.identityTransferred && !model.isReviewed}
    <div class="border-border grid gap-2 border-b p-6 text-sm">
      <p>
        This task was reassigned in a reviewed merge or split. Its original evidence and
        contributor are retained.
      </p>
      <p>
        Review any photo proposals first. Completing or rejecting this contribution does
        not publish or archive the destination Feature.
      </p>
    </div>
  {/if}

  {#if model.isReportedMissing}
    <div class="grid min-w-0 gap-8 p-6 @min-[48rem]/task:grid-cols-2">
      <section class="min-w-0">
        <h3 class={fieldLabelStyles}>{m.noisy_lime_tuna_charm()}</h3>
        <p class="mt-4 text-base leading-relaxed break-words whitespace-pre-wrap">
          {#if loading && !task?.message}
            <Skeleton class="h-6 w-3/4" />
          {:else}
            {normalizeDisplayValue(task?.message)}
          {/if}
        </p>
      </section>
      <section class="border-border bg-foreground/[0.03] min-w-0 rounded-xl border p-6">
        <h3 class={fieldLabelStyles}>{m.house_watery_jaguar_edit()}</h3>
        <p class="mt-4 text-3xl font-semibold tabular-nums">{model.reportDistance}</p>
        <dl class="border-border/50 mt-5 grid gap-3 border-t pt-4 text-sm">
          <div
            class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-4"
          >
            <dt class="text-foreground/60">{m.bland_tasty_lizard_rest()}</dt>
            <dd class="m-0 text-right font-medium tabular-nums">{model.reportDate}</dd>
          </div>
          <div
            class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-4"
          >
            <dt class="text-foreground/60">{m.weary_bad_dog_revive()}</dt>
            <dd class="m-0 text-right font-medium tabular-nums">{model.captureDate}</dd>
          </div>
        </dl>
      </section>
    </div>
  {:else}
    <div
      class="@min-[48rem]/task:[&>section+section]:border-border/50 grid min-w-0 gap-y-6 py-8 @min-[48rem]/task:grid-cols-3 @min-[48rem]/task:[&>section+section]:border-l"
    >
      <section class="min-w-0 px-6">
        <h3 class={fieldLabelStyles}>{m.feature__title()}</h3>
        <div class="mt-4">
          {#if loading && !model.preview}
            <Skeleton class="h-6 w-3/4" />
          {:else}
            {#each model.shownLocales as locale (locale)}
              <FormI18nInlineRow
                value={model.preview?.i18n?.[contentFormKey(locale)]?.title || '-'}
                prefix={model.localeState.expanded ? shortLocaleLabel(locale) : ''}
                label={m.feature__title()}
                editable={false}
                showVerification={false}
                attrs={{}}
                issues={undefined}
                required={false}
                onStart={() => {}}
                onCancel={() => {}}
                onClear={() => {}}
              />
            {/each}
          {/if}
        </div>
      </section>
      <section class="min-w-0 px-6">
        <h3 class={fieldLabelStyles}>{m.feature__description()}</h3>
        <div class="mt-4">
          {#if loading && !model.preview}
            <Skeleton class="h-6 w-3/4" />
          {:else}
            {#each model.shownLocales as locale (locale)}
              <FormI18nInlineRow
                value={model.preview?.i18n?.[contentFormKey(locale)]?.description ||
                  '-'}
                prefix={model.localeState.expanded ? shortLocaleLabel(locale) : ''}
                label={m.feature__description()}
                multiline
                editable={false}
                showVerification={false}
                attrs={{}}
                issues={undefined}
                required={false}
                onStart={() => {}}
                onCancel={() => {}}
                onClear={() => {}}
              />
            {/each}
          {/if}
        </div>
      </section>
      <section class="min-w-0 px-6">
        <TaskPrimitive.TaskLayer
          {loading}
          title={m.resource__layer_singular()}
          currentLayerId={model.effectiveLayerId}
          options={assignableLayers}
          isBusy={isLayerBusy}
          disabled={model.isReviewed || !canReassignLayer}
          onLayerChange={onReassignLayer}
          class="border-0 bg-transparent py-0"
        />
        <div class="mt-6">
          <h3 class={fieldLabelStyles}>{m.feature__address()}</h3>
          <p class="mt-4 text-base leading-relaxed break-words whitespace-pre-wrap">
            {#if loading && !model.preview}
              <Skeleton class="h-6 w-3/4" />
            {:else}
              {model.featureAddress}
            {/if}
          </p>
        </div>
      </section>
    </div>
  {/if}
  {#if model.isNewFeature && model.featureFields.length > 0}
    <TaskPrimitive.TaskFields
      title={m.admin__forms_common_fields()}
      items={model.featureFields}
    />
  {/if}
</div>
