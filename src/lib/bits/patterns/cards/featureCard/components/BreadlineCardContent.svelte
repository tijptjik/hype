<script lang="ts">
// COMPONENTS
import FeatureCardContentFields from './content/FeatureCardContentFields.svelte'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// PRESENTATION
import { breadlineBrand } from '#lib/features/breadlinePresentation.js'
import {
  breadlineCardMtr,
  type BreadlineRunPresentation,
} from '#lib/features/breadlineCard.js'
import { presentationProperty } from '#lib/features/presentationProperties.js'
import { stripRichTextToPlainText } from '../featureCard.layout'
// I18N
import { getI18n, getLocale, m } from '#lib/i18n.js'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'

let { feature, run }: { feature: Feature; run?: BreadlineRunPresentation } = $props()
const view = getSurfaceCtx()
const preferences = $derived(view.getUserPreferences())
const brand = $derived(breadlineBrand(feature))
const access = $derived(breadlineCardMtr(feature, getLocale()))
const address = $derived(getI18n(feature, 'displayAddress', preferences, ''))
const description = $derived(
  stripRichTextToPlainText(getI18n(feature, 'description', preferences, '')),
)
const phone = $derived(presentationProperty(feature, 'phoneNumber'))
const fields = $derived(
  access
    ? [
        {
          id: 'breadline-mtr',
          label: m.feature_mtr_access(),
          value: m.feature_mtr_access_value({
            station: access.station,
            exit: access.exit,
            distance: String(access.metres),
          }),
        },
      ]
    : [],
)
</script>

<div data-card-content="breadline" class="pointer-events-auto flex flex-col gap-4 pb-4">
  <div
    class="mx-4 flex items-start gap-3 rounded-xl border-l-4 bg-base-200/60 p-3"
    style:border-color={brand.color}
  >
    <span
      class="grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
      style:background={brand.color}
      aria-hidden="true"
      >{brand.badge}</span
    >
    <div class="min-w-0 flex-1">
      <p class="text-xs font-semibold uppercase tracking-wide opacity-65">
        {brand.name}
      </p>
      {#if address}
        <p class="mt-1 text-sm leading-relaxed">{address}</p>
      {/if}
      {#if phone}
        <a
          class="mt-1 inline-block text-sm underline underline-offset-4"
          href={`tel:${phone.replace(/[^+\d]/g, '')}`}
          >{phone}</a
        >
      {/if}
    </div>
  </div>
  {#if fields.length}
    <FeatureCardContentFields {feature} items={fields} />
  {/if}
  {#if description && description !== '-'}
    <p class="mx-4 text-sm leading-relaxed opacity-80">{description}</p>
  {/if}
  {#if run}
    <div class="mx-4 rounded-xl border border-border p-3">
      <p class="text-xs font-medium opacity-60">{run.dateLabel}</p>
      <div class="mt-2 flex items-baseline justify-between gap-3">
        <p class="font-semibold">{run.pickupWindow}</p>
        <p class="text-sm">{run.amountLabel}</p>
      </div>
      <button
        type="button"
        class="mt-3 w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-content disabled:opacity-50"
        disabled={run.pending}
        onclick={() => run?.onClaim()}
      >
        {run.claimed ? m.breadline_card__unclaim() : m.breadline_card__claim()}
      </button>
    </div>
  {:else}
    <p
      class="mx-4 rounded-xl border border-dashed border-border px-3 py-2 text-xs leading-relaxed opacity-65"
    >
      {m.breadline_card__choose_date()}
    </p>
  {/if}
</div>
