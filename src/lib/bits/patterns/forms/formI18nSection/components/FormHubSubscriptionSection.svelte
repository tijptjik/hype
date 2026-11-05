<script lang="ts" generics="T extends DescriptorData">
// I18N
import { getLocaleKey } from '#lib/i18n.js'
import { contentFormKey } from '#lib/i18n/contentRecords.js'
import { getContentLocaleRecord } from '#lib/content-locales/catalogue.js'
// COMPONENTS
import { Switch } from '#lib/bits/custom/index.js'
import {
  SectionHeader,
  SectionHeaderPrimitive,
  SelectField,
} from '#lib/bits/custom/form/index.js'
import FormInlineField from './FormInlineField.svelte'
import FeatureProfileEditor from '../../featureLocation/FeatureProfileEditor.svelte'
import FormI18nDescriptorFields from './FormI18nDescriptorFields.svelte'
// SERVICES
import { toUniqueIssueMessages } from '#lib/client/services/form.js'
import { HubSubscriptionService } from '#lib/enums.js'
// STYLES
import { fieldLabelStyles } from '#lib/bits/custom/form/fieldTypography.styles'
// TYPES
import type { FormDataUpdaterForm } from '#lib/client/services/form.types.js'
import type { HubSubscriptionPlacement } from '#lib/api/services/hub.types.js'
import type { DescriptorData } from './formI18nDescriptorFields.types.js'
import type { ProfileLocaleState } from '../../featureLocation/profileLocales.js'
import type { ProfileProviderResult } from '../../featureLocation/profileTranslation.js'

type TextField = {
  as: (type: 'text') => Record<string, unknown>
  set: (value: string) => unknown
  issues: () => import('$app/server').RemoteFormIssue[] | undefined
}
type HiddenField = { as: (type: 'hidden', value: string) => Record<string, unknown> }
type HubSubscriptionForm<Data extends DescriptorData> = FormDataUpdaterForm<Data> & {
  fields: {
    data: {
      isSubscriptionAvailable: HiddenField
      subscriptionService: {
        as: (type: 'select') => Record<string, unknown>
        issues: TextField['issues']
      }
      subscriptionId: TextField
      subscriptionSessionCookie: TextField
      i18n: Record<string, object>
      subscriptionPlacement: Record<keyof HubSubscriptionPlacement, HiddenField>
    }
  }
}
let {
  form,
  localeState,
  recordKey,
  resetVersion = 0,
  isEditing = false,
  isSubscriptionAvailable = false,
  subscriptionService = HubSubscriptionService.substack,
  subscriptionPlacement,
  translate,
  onChange = () => {},
  onAvailabilityChange,
  onServiceChange,
  onPlacementChange,
}: {
  form: HubSubscriptionForm<T>
  localeState: ProfileLocaleState
  recordKey: string
  resetVersion?: number
  isEditing?: boolean
  isSubscriptionAvailable?: boolean
  subscriptionService?: HubSubscriptionService
  subscriptionPlacement: HubSubscriptionPlacement
  translate: (
    source: string,
    target: string,
    text: string,
  ) => Promise<ProfileProviderResult>
  onChange?: () => void
  onAvailabilityChange?: (nextValue: boolean) => void
  onServiceChange?: (nextValue: HubSubscriptionService) => void
  onPlacementChange?: (key: keyof HubSubscriptionPlacement, nextValue: boolean) => void
} = $props()
const serviceItems = [{ value: HubSubscriptionService.substack, label: 'Substack' }]
const id = $props.id()
const serviceAttrs = $derived(form.fields.data.subscriptionService.as('select'))
const canEdit = $derived(isEditing && isSubscriptionAvailable)
const values = $derived(form.fields.value().data?.i18n ?? {})
const sectionIssues = $derived(
  toUniqueIssueMessages([
    ...(form.fields.data.subscriptionService.issues() ?? []),
    ...(form.fields.data.subscriptionId.issues() ?? []),
    ...(form.fields.data.subscriptionSessionCookie.issues() ?? []),
  ]),
)
const placements = [
  { key: 'topBar' as const, label: 'Top Bar' },
  { key: 'hubPanel' as const, label: 'Hub Panel' },
  { key: 'menu' as const, label: 'Menu' },
]

/** Stage only the translated benefit and its machine provenance.
 * @param _field The subscription benefit field.
 * @param locale Canonical target locale.
 * @param text Successfully translated content.
 * @returns Nothing; updates the existing remote form and its validation.
 */
function applyTranslation(
  _field: 'subscriptionBenefits',
  locale: string,
  text: string,
): void {
  const current = form.fields.value()
  if (!current.data) return
  const key = contentFormKey(locale)
  form.fields.set({
    ...current,
    data: {
      ...current.data,
      i18n: {
        ...current.data.i18n,
        [key]: {
          ...current.data.i18n?.[key],
          subscriptionBenefits: text,
          subscriptionBenefitsGen: true,
        },
      },
    },
  })
  onChange()
}
</script>

<section class="bits-form__section" data-hub-subscription>
  <div class="hidden" aria-hidden="true">
    <input
      {...form.fields.data.isSubscriptionAvailable.as(
        'hidden',
        isSubscriptionAvailable ? 'true' : 'false',
      )}
    >
    {#if !canEdit}
      <input
        type="hidden"
        name={String(serviceAttrs.name ?? '')}
        value={subscriptionService}
      >
    {/if}
    {#each placements as placement (placement.key)}
      <input
        {...form.fields.data.subscriptionPlacement[placement.key].as(
          'hidden',
          subscriptionPlacement[placement.key] ? 'true' : 'false',
        )}
      >
    {/each}
  </div>
  <SectionHeader
    title="Subscription"
    description="Configure newsletter promotion for this hub."
  >
    {#snippet right()}
      <Switch
        checked={isSubscriptionAvailable}
        disabled={!isEditing}
        onCheckedChange={value => onAvailabilityChange?.(Boolean(value))}
      />
    {/snippet}
  </SectionHeader>
  <SectionHeaderPrimitive.Issues issues={sectionIssues} />

  <div
    class="grid min-w-0 gap-6 px-6 pt-6 md:grid-cols-3"
    class:opacity-45={!isSubscriptionAvailable}
    inert={!isSubscriptionAvailable}
  >
    <!-- Configuration, translated benefits and placement share equal-width columns. -->
    <div class="min-w-0 space-y-6" data-subscription-configuration>
      <section class="min-w-0">
        <h3 class={`flex min-h-7 items-center ${fieldLabelStyles}`}>Service</h3>
        <div class="mt-3">
          {#if canEdit}
            <SelectField
              label="Service"
              value={subscriptionService}
              items={serviceItems}
              name={String(serviceAttrs.name ?? '')}
              isEditing={canEdit}
              class="[&_.bits-form\_\_label]:hidden"
              issues={form.fields.data.subscriptionService.issues()}
              triggerClass="h-[42px]! rounded-md! border-border/30! bg-transparent! pl-[11px]! hover:border-border/60! hover:bg-muted/50! [&_.bits-form\_\_select-label]:pl-0!"
              onValueChange={value =>
                onServiceChange?.(value as HubSubscriptionService)}
            />
          {:else}
            <p class="min-h-[42px] px-3 py-[9px] text-[15px] leading-[22px]">
              {serviceItems.find(item => item.value === subscriptionService)?.label ??
                '—'}
            </p>
          {/if}
        </div>
      </section>
      <FormInlineField
        label="Publication ID"
        control={form.fields.data.subscriptionId}
        isEditing={canEdit}
        {onChange}
      />
      <FormInlineField
        label="Substack Session Cookie"
        control={form.fields.data.subscriptionSessionCookie}
        isEditing={canEdit}
        multiline
        {onChange}
      />
    </div>
    <div
      class="md:border-border/50 min-w-0 md:border-l md:pl-6 [&>[data-feature-profile-editor]]:px-0"
      data-subscription-benefits
    >
      <FeatureProfileEditor
        {localeState}
        onLocaleStateChange={() => {}}
        {values}
        {recordKey}
        contextKey={`${recordKey}:${resetVersion}:${canEdit}`}
        isEditing={canEdit}
        showToolbar={false}
        fieldConfigs={[{ key: 'subscriptionBenefits', label: 'Subscription Benefits' }]}
        {translate}
        onTranslated={applyTranslation}
      >
        {#snippet children(field, locale, onEditStart, prefix)}
          {@const key = contentFormKey(locale)}
          <FormI18nDescriptorFields
            {form}
            fields={form.fields.data.i18n[key]}
            locale={key}
            isEditing={canEdit}
            inline
            {onEditStart}
            isRequiredInPreflight={() => false}
            fieldConfigs={[
              {
                key: field,
                label: prefix,
                kind: 'textarea',
                ariaLabel: `Subscription Benefits · ${getContentLocaleRecord(locale, getLocaleKey()).name}`,
              },
            ]}
          />
        {/snippet}
      </FeatureProfileEditor>
    </div>
    <section
      class="md:border-border/50 min-w-0 md:border-l md:pl-6"
      data-subscription-placement-column
    >
      <h3 class={`mb-3 flex min-h-7 items-center ${fieldLabelStyles}`}>Placement</h3>
      <div
        class="divide-border/20 border-border bg-foreground/4 flex min-w-0 flex-col divide-y rounded-xl border px-5"
        data-subscription-placement
      >
        {#each placements as placement (placement.key)}
          <div class="flex items-center justify-between gap-3 py-4">
            <label
              for={`${id}-${placement.key}`}
              class="min-w-0 flex-1 text-sm font-medium"
              >{placement.label}</label
            >
            <Switch
              id={`${id}-${placement.key}`}
              checked={subscriptionPlacement[placement.key]}
              disabled={!canEdit}
              onCheckedChange={value =>
                onPlacementChange?.(placement.key, Boolean(value))}
            />
          </div>
        {/each}
      </div>
    </section>
  </div>
</section>
