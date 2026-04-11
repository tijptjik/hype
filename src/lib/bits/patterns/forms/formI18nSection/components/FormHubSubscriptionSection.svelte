<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import { Switch } from '$lib/bits/custom'
import {
  SectionHeader,
  SectionHeaderPrimitive,
  SelectField,
  TextArea,
  TextInput,
} from '$lib/bits/custom/form'
import {
  getGenAiState,
  toUniqueIssueMessages,
  toggleGenAiField,
} from '$lib/client/services/form'
import { HubSubscriptionService } from '$lib/enums'
import type { FormIssueLike, HubSubscriptionPlacement, LocaleKey } from '$lib/types'
import FormSection from './FormSection.svelte'

type IssueField = {
  as: (type: 'hidden', value: string) => Record<string, unknown>
  issues: () => FormIssueLike[] | undefined
}

type TextField = {
  as: (type: 'text') => Record<string, unknown>
  issues: () => FormIssueLike[] | undefined
}

type TextAreaField = {
  as: (type: 'textarea') => Record<string, unknown>
  issues: () => FormIssueLike[] | undefined
}

type SelectFieldAdapter = {
  as: (type: 'select') => Record<string, unknown>
  issues: () => FormIssueLike[] | undefined
}

type HubSubscriptionForm = {
  fields: {
    data: {
      isSubscriptionAvailable: IssueField
      subscriptionService: SelectFieldAdapter
      subscriptionId: TextField
      subscriptionSessionCookie: TextAreaField
      i18n: Record<
        LocaleKey,
        {
          subscriptionBenefits: TextAreaField
          subscriptionBenefitsGen: IssueField
        }
      >
      subscriptionPlacement: {
        hubPanel: IssueField
        topBar: IssueField
        menu: IssueField
      }
    }
  }
}

let {
  form,
  isEditing = false,
  isSubscriptionAvailable = false,
  subscriptionService = HubSubscriptionService.substack,
  subscriptionId = '',
  subscriptionSessionCookie = '',
  subscriptionBenefitsByLocale,
  subscriptionPlacement,
  onAvailabilityChange,
  onServiceChange,
  onSubscriptionIdChange,
  onSubscriptionSessionCookieChange,
  onSubscriptionBenefitsChange,
  onPlacementChange,
}: {
  form: HubSubscriptionForm
  isEditing?: boolean
  isSubscriptionAvailable?: boolean
  subscriptionService?: HubSubscriptionService
  subscriptionId?: string
  subscriptionSessionCookie?: string
  subscriptionBenefitsByLocale: Record<LocaleKey, string>
  subscriptionPlacement: HubSubscriptionPlacement
  onAvailabilityChange?: (nextValue: boolean) => void
  onServiceChange?: (nextValue: HubSubscriptionService) => void
  onSubscriptionIdChange?: (nextValue: string) => void
  onSubscriptionSessionCookieChange?: (nextValue: string) => void
  onSubscriptionBenefitsChange?: (localeKey: LocaleKey, nextValue: string) => void
  onPlacementChange?: (key: keyof HubSubscriptionPlacement, nextValue: boolean) => void
} = $props()

const serviceItems = [
  {
    value: HubSubscriptionService.substack,
    label: 'Substack',
  },
]

const supportedLocaleKeys: LocaleKey[] = ['en', 'zhHans', 'zhHant']

const subscriptionIdInputAttrs = $derived(form.fields.data.subscriptionId.as('text'))
const subscriptionSessionCookieTextareaAttrs = $derived(
  form.fields.data.subscriptionSessionCookie.as('textarea'),
)
const subscriptionServiceAttrs = $derived(
  form.fields.data.subscriptionService.as('select'),
)
const isSubscriptionFieldEditing = $derived(isEditing && isSubscriptionAvailable)
const shouldMirrorSubscriptionService = $derived(!isSubscriptionFieldEditing)
const shouldMirrorSubscriptionId = $derived(!isSubscriptionFieldEditing)
const shouldMirrorSubscriptionSessionCookie = $derived(!isSubscriptionFieldEditing)
const subscriptionServiceHiddenAttrs = $derived({
  name: (subscriptionServiceAttrs as { name?: string }).name ?? '',
  value: subscriptionService,
} satisfies { name: string; value: string })
const subscriptionIdVisibleAttrs = $derived(
  shouldMirrorSubscriptionId
    ? ({
        ...(subscriptionIdInputAttrs as Record<string, unknown>),
        id: undefined,
        name: '',
      } as Record<string, unknown>)
    : (subscriptionIdInputAttrs as Record<string, unknown>),
)
const subscriptionSessionCookieVisibleAttrs = $derived(
  shouldMirrorSubscriptionSessionCookie
    ? ({
        ...(subscriptionSessionCookieTextareaAttrs as Record<string, unknown>),
        id: undefined,
        name: '',
      } as Record<string, unknown>)
    : (subscriptionSessionCookieTextareaAttrs as Record<string, unknown>),
)
const availabilityInputAttrs = $derived(
  form.fields.data.isSubscriptionAvailable.as(
    'hidden',
    isSubscriptionAvailable ? 'true' : 'false',
  ),
)
const subscriptionIdHiddenAttrs = $derived({
  name: (subscriptionIdInputAttrs as { name?: string }).name ?? '',
  value: subscriptionId,
} satisfies { name: string; value: string })
const subscriptionSessionCookieHiddenAttrs = $derived({
  name: (subscriptionSessionCookieTextareaAttrs as { name?: string }).name ?? '',
  value: subscriptionSessionCookie,
} satisfies { name: string; value: string })
const subscriptionIdIssues = $derived(form.fields.data.subscriptionId.issues() ?? [])
const subscriptionSessionCookieIssues = $derived(
  form.fields.data.subscriptionSessionCookie.issues() ?? [],
)
const subscriptionBenefitsFieldModels = $derived(
  supportedLocaleKeys.map(localeKey => {
    const field = form.fields.data.i18n[localeKey].subscriptionBenefits
    const genField = form.fields.data.i18n[localeKey].subscriptionBenefitsGen
    const textareaAttrs = field.as('textarea') as Record<string, unknown>
    const shouldMirror = !isSubscriptionFieldEditing
    const genValue = getGenAiState(form as never, localeKey, 'subscriptionBenefits')

    return {
      localeKey,
      label:
        localeKey === 'en'
          ? 'Subscription Benefits (EN)'
          : localeKey === 'zhHans'
            ? 'Subscription Benefits (ZH-HANS)'
            : 'Subscription Benefits (ZH-HANT)',
      value: subscriptionBenefitsByLocale[localeKey] ?? '',
      genValue,
      genAttrs: genField.as('hidden', genValue ? 'true' : 'false'),
      issues: field.issues() ?? [],
      textareaAttrs: shouldMirror
        ? ({
            ...textareaAttrs,
            id: undefined,
            name: '',
          } as Record<string, unknown>)
        : textareaAttrs,
      hiddenAttrs: {
        name: (textareaAttrs as { name?: string }).name ?? '',
        value: subscriptionBenefitsByLocale[localeKey] ?? '',
      } satisfies { name: string; value: string },
    }
  }),
)
const subscriptionServiceIssues = $derived(
  form.fields.data.subscriptionService.issues() ?? [],
)
const hubPanelInputAttrs = $derived(
  form.fields.data.subscriptionPlacement.hubPanel.as(
    'hidden',
    subscriptionPlacement.hubPanel ? 'true' : 'false',
  ),
)
const topBarInputAttrs = $derived(
  form.fields.data.subscriptionPlacement.topBar.as(
    'hidden',
    subscriptionPlacement.topBar ? 'true' : 'false',
  ),
)
const menuInputAttrs = $derived(
  form.fields.data.subscriptionPlacement.menu.as(
    'hidden',
    subscriptionPlacement.menu ? 'true' : 'false',
  ),
)
const sectionIssues = $derived.by(() =>
  toUniqueIssueMessages([
    ...subscriptionServiceIssues,
    ...subscriptionIdIssues,
    ...subscriptionSessionCookieIssues,
    ...subscriptionBenefitsFieldModels.flatMap(field => field.issues),
  ]),
)
const sectionBodyClass = $derived(
  [
    'grid gap-4 transition-opacity',
    !isSubscriptionAvailable ? 'pointer-events-none opacity-45' : '',
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

<section class="bits-form__section">
  <div class="hidden" aria-hidden="true">
    <input {...(availabilityInputAttrs as Record<string, unknown>)}>
    {#if shouldMirrorSubscriptionService}
      <input {...(subscriptionServiceHiddenAttrs as Record<string, unknown>)}>
    {/if}
    {#if shouldMirrorSubscriptionId}
      <input {...(subscriptionIdHiddenAttrs as Record<string, unknown>)}>
    {/if}
    {#if shouldMirrorSubscriptionSessionCookie}
      <input {...(subscriptionSessionCookieHiddenAttrs as Record<string, unknown>)}>
    {/if}
    {#if !isSubscriptionFieldEditing}
      {#each subscriptionBenefitsFieldModels as field (field.localeKey)}
        <input {...(field.genAttrs as Record<string, unknown>)}>
        <input {...(field.hiddenAttrs as Record<string, unknown>)}>
      {/each}
    {:else}
      {#each subscriptionBenefitsFieldModels as field (field.localeKey)}
        <input {...(field.genAttrs as Record<string, unknown>)}>
      {/each}
    {/if}
    <input {...(hubPanelInputAttrs as Record<string, unknown>)}>
    <input {...(topBarInputAttrs as Record<string, unknown>)}>
    <input {...(menuInputAttrs as Record<string, unknown>)}>
  </div>

  <SectionHeader
    title="Subscription"
    description="Configure newsletter promotion for this hub."
  >
    {#snippet right()}
      <Switch
        checked={isSubscriptionAvailable}
        disabled={!isEditing}
        onCheckedChange={nextValue => onAvailabilityChange?.(Boolean(nextValue))}
      />
    {/snippet}
  </SectionHeader>
  <SectionHeaderPrimitive.Issues issues={sectionIssues} />

  <FormSection>
    <div class={sectionBodyClass}>
      <SelectField
        label="Service"
        value={subscriptionService}
        items={serviceItems}
        name={shouldMirrorSubscriptionService
          ? ''
          : ((subscriptionServiceAttrs as { name?: string }).name ?? '')}
        isEditing={isSubscriptionFieldEditing}
        disabled={!isSubscriptionAvailable}
        issues={subscriptionServiceIssues}
        onValueChange={value => onServiceChange?.(value as HubSubscriptionService)}
      />

      <TextInput
        label="Publication ID"
        value={subscriptionId}
        placeholder={m.admin__hub_subscription_id_placeholder()}
        isEditing={isSubscriptionFieldEditing}
        disabled={!isSubscriptionAvailable}
        issues={subscriptionIdIssues}
        inputAttrs={subscriptionIdVisibleAttrs}
        onValueChange={nextValue => onSubscriptionIdChange?.(nextValue)}
      />

      <TextArea
        label="Substack Session Cookie"
        value={subscriptionSessionCookie}
        placeholder="Paste the cookie header. Only the first cookie pair will be stored."
        rows={4}
        isEditing={isSubscriptionFieldEditing}
        disabled={!isSubscriptionAvailable}
        issues={subscriptionSessionCookieIssues}
        textareaAttrs={subscriptionSessionCookieVisibleAttrs}
        onValueChange={nextValue => onSubscriptionSessionCookieChange?.(nextValue)}
      />

      {#each subscriptionBenefitsFieldModels as field (field.localeKey)}
        <TextArea
          label={field.label}
          value={field.value}
          placeholder="Describe what subscribers get."
          rows={4}
          locale={field.localeKey}
          isTranslated={true}
          isEditing={isSubscriptionFieldEditing}
          isGenAI={field.genValue}
          onToggleGenAI={() =>
            toggleGenAiField(form as never, field.localeKey, 'subscriptionBenefits')}
          disabled={!isSubscriptionAvailable}
          issues={field.issues}
          textareaAttrs={field.textareaAttrs}
          onValueChange={nextValue =>
            onSubscriptionBenefitsChange?.(field.localeKey, nextValue)}
        />
      {/each}

      <div>
        <p
          class="text-xs font-semibold uppercase tracking-[0.2em] text-base-content/60 pb-4"
        >
          Placement
        </p>

        <div class="grid grid-cols-2 justify-items-start items-start gap-4">
          <Switch
            checked={subscriptionPlacement.topBar}
            disabled={!isEditing || !isSubscriptionAvailable}
            rightText="Top Bar"
            onCheckedChange={nextValue =>
              onPlacementChange?.('topBar', Boolean(nextValue))}
          />

          <Switch
            checked={subscriptionPlacement.hubPanel}
            disabled={!isEditing || !isSubscriptionAvailable}
            rightText="Hub Panel"
            onCheckedChange={nextValue =>
              onPlacementChange?.('hubPanel', Boolean(nextValue))}
          />

          <Switch
            checked={subscriptionPlacement.menu}
            disabled={!isEditing || !isSubscriptionAvailable}
            rightText="Menu"
            onCheckedChange={nextValue => onPlacementChange?.('menu', Boolean(nextValue))}
          />
        </div>
      </div>
    </div>
  </FormSection>
</section>
