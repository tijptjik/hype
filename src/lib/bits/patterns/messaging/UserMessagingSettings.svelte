<script lang="ts">
// SVELTE
import { tick, untrack } from 'svelte'
import { slide } from 'svelte/transition'
// ICONS
import AlertTriangle from 'virtual:icons/tabler/alert-triangle'
import Check from 'virtual:icons/tabler/check'
import Loader from 'virtual:icons/tabler/loader-2'
import ChevronDown from 'virtual:icons/tabler/chevron-down'
import { CONTACT_SERVICES } from './serviceRegistry'
// ADAPTER
import { useUserMessagingSettingsModel } from '#lib/adapters/messaging/useUserMessagingSettingsModel.svelte.js'
// BITS COMPONENTS
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import TextInputField from '#lib/bits/custom/form/TextInputField.svelte'
import type { MessagingProfileSettings } from '#lib/messaging/contactValidation.js'
// TYPES
import type { MessagingPlatform } from '#lib/messaging/types.js'
let {
  userId,
  canVerify = false,
  embedded = false,
  isEditing = true,
  defaultPhone = '',
  initialSettings,
}: {
  userId?: string
  canVerify?: boolean
  embedded?: boolean
  isEditing?: boolean
  defaultPhone?: string
  initialSettings?: MessagingProfileSettings
} = $props()
const model = untrack(() =>
  useUserMessagingSettingsModel(userId, canVerify, initialSettings),
)
const platforms: MessagingPlatform[] = CONTACT_SERVICES.map(service => service.id)
/** Seed missing service contacts after an explicit profile save.
 * @param phone Saved normalized phone.
 * @returns When missing claims have been saved.
 */
export async function useDefaultPhone(phone: string): Promise<void> {
  await model.useDefaultPhone(phone)
}
const fieldId = $props.id()
const hasBothIdentities = $derived(
  platforms.every(platform =>
    model.settings.identities.some(
      identity =>
        identity.platform === platform &&
        Boolean(identity.phoneNumber || identity.username || identity.nativeId),
    ),
  ),
)
let preferredPlatform = $state('default')
let preferenceOpen = $state(false)
const preferenceOptions = [
  { value: 'default', label: 'Use default (WhatsApp)' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
] as const
const preferenceLabel = $derived(
  preferenceOptions.find(option => option.value === preferredPlatform)?.label ??
    preferenceOptions[0].label,
)

// Restore the saved selection after a failed save as well as after loading preferences.
$effect(() => {
  if (!model.busy) preferredPlatform = model.settings.preferredPlatform ?? 'default'
})
</script>

<section
  class="flex min-w-0 flex-col gap-4 {embedded
    ? ''
    : 'rounded-xl border border-border p-4'}"
  aria-label="Messaging preferences"
  aria-busy={model.loading}
>
  {#if !embedded}
    <h3 class="text-lg font-semibold">Messaging preferences</h3>
  {/if}
  {#if model.error}
    <p role="alert" class="text-sm">{model.error}</p>
  {/if}
  {#if model.loading}
    <span role="status" class="sr-only">Loading messaging preferences</span>
    {#each platforms as platform}
      <div aria-hidden="true" class="flex min-w-0 flex-col gap-2">
        <span class="text-muted-foreground text-sm font-medium"
          >{platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'}</span
        >
        <div
          class="border-border bg-surface flex h-12 items-center rounded-lg border px-4 motion-safe:animate-pulse"
        >
          <span class="bg-base-content/10 h-3 w-2/3 rounded"></span>
        </div>
      </div>
    {/each}
  {:else}
    {#each platforms as platform}
      {@const service = CONTACT_SERVICES.find(row => row.id === platform)!}
      {@const platformName = service.label}
      {@const ServiceIcon = service.icon}
      {@const identity = model.settings.identities.find(
        row => row.platform === platform,
      )}
      {@const state = model.states[platform]}
      {@const saveFailed =
        state.kind === 'warning' && !state.invalid && model.isDirty(platform)}
      {@const forthcoming =
        !saveFailed &&
        !model.isDirty(platform) &&
        !identity?.verifiedAt &&
        state.kind !== 'checking' &&
        state.kind !== 'confirmed' &&
        !(state.kind === 'warning' && state.invalid)}
      <div class="flex min-w-0 flex-col gap-2">
        <div class="relative min-w-0">
          <!-- Keep status and verification controls in the label row, outside the autofill rectangle. -->
          <TextInputField
            id={`${fieldId}-${platform}`}
            label={platformName}
            labelIcon={ServiceIcon}
            bind:value={model.inputs[platform]}
            {isEditing}
            placeholder={!isEditing ? '—' : defaultPhone || service.placeholder}
            controlClass={!isEditing
              ? 'bg-transparent! border-transparent! shadow-none!'
              : embedded
                ? 'bg-[var(--form-control-edit-fill)]! border-[var(--form-control-border)]!'
                : ''}
            inputAttrs={{
              autocomplete: 'off',
              autocapitalize: 'none',
              spellcheck: false,
              maxlength: 100,
              // InputText trims on blur; validate after its final value change.
              onblur: () => {
                if (isEditing) queueMicrotask(() => model.blurContact(platform))
              },
              'aria-describedby': `${fieldId}-${platform}-status`,
              'aria-invalid': state.kind === 'warning' && state.invalid,
            }}
            onValueChange={value => {
              if (isEditing) model.updateContact(platform, value)
            }}
          >
            {#snippet labelRight()}
              <SimpleTooltip
                triggerProps={{
                  role: 'button',
                  'aria-label': `${platformName} status`,
                }}
                triggerClass="shrink-0"
                contentClass="max-w-80 space-y-3 p-3 text-sm"
              >
                {#snippet trigger()}
                  <span
                    class="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
                  >
                    {#if state.kind === 'checking'}
                      <Loader
                        class="size-3.5 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    {:else if identity?.verifiedAt || state.kind === 'confirmed'}
                      <Check class="text-success size-3.5" aria-hidden="true" />
                    {:else if state.kind === 'warning' && state.invalid}
                      <AlertTriangle class="text-warning size-3.5" aria-hidden="true" />
                    {/if}
                    {state.kind === 'checking'
                      ? 'Checking…'
                      : saveFailed
                        ? 'Save failed'
                        : model.isDirty(platform)
                          ? 'Unsaved'
                          : identity?.verifiedAt
                            ? 'Ownership verified'
                            : state.kind === 'confirmed'
                              ? 'Account found'
                              : state.kind === 'warning' && state.invalid
                                ? 'Check details'
                                : 'Feature forthcoming'}
                  </span>
                {/snippet}
                {#snippet children()}
                  {#if forthcoming}
                    <p>
                      Automatic account confirmation is a forthcoming feature. You can
                      save service details now; confirmation is not available here yet.
                    </p>
                  {:else}
                    <p>{state.message || 'Account ownership has been verified.'}</p>
                    {#if identity?.validation && !model.isDirty(platform)}
                      <p class="text-muted-foreground text-xs">
                        Checked
                        {new Date(identity.validation.checkedAt).toLocaleString()}
                      </p>
                    {/if}
                  {/if}
                {/snippet}
              </SimpleTooltip>
            {/snippet}
          </TextInputField>
        </div>
        <span id={`${fieldId}-${platform}-status`} role="status" class="sr-only"
          >{state.message}</span
        >
        {#if isEditing && saveFailed}
          <button
            type="button"
            class="text-primary self-start text-xs hover:underline"
            onclick={() => model.retry(platform)}
          >
            Retry saving {platformName}
          </button>
        {/if}
        {#if isEditing && defaultPhone && model.inputs[platform] !== defaultPhone}
          <button
            type="button"
            class="text-primary self-start text-xs hover:underline"
            onclick={() => {
              model.updateContact(platform, defaultPhone)
              model.blurContact(platform)
            }}
          >
            Use profile phone
          </button>
        {/if}
      </div>
    {/each}
    {#if hasBothIdentities}
      <div class="border-border flex min-w-0 flex-col gap-2 border-t pt-4">
        <label
          for={`${fieldId}-preference`}
          class="text-muted-foreground text-sm font-medium"
        >
          Preferred messaging platform
        </label>
        <button
          id={`${fieldId}-preference`}
          type="button"
          aria-expanded={preferenceOpen}
          aria-controls={`${fieldId}-preference-options`}
          class="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border px-4 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-primary {isEditing
            ? 'border-border bg-surface'
            : 'border-transparent bg-transparent'}"
          disabled={!isEditing || model.busy}
          onclick={() => (preferenceOpen = !preferenceOpen)}
        >
          <span>{preferenceLabel}</span>
          <ChevronDown
            aria-hidden="true"
            class={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${preferenceOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {#if isEditing && preferenceOpen}
          <fieldset
            id={`${fieldId}-preference-options`}
            aria-label="Preferred messaging platform"
            class="flex min-w-0 flex-col gap-1 overflow-hidden"
            transition:slide={{
              duration:
                typeof matchMedia !== 'undefined' &&
                matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 0
                  : 180,
            }}
            onkeydown={event => {
              if (event.key === 'Escape') {
                preferenceOpen = false
                document.getElementById(`${fieldId}-preference`)?.focus()
              }
            }}
          >
            {#each preferenceOptions as option (option.value)}
              <label
                class="border-border hover:bg-surface has-checked:bg-raised has-focus-visible:outline-primary relative flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm has-focus-visible:outline-2"
              >
                <input
                  type="radio"
                  name={`${fieldId}-preferred-platform`}
                  value={option.value}
                  checked={preferredPlatform === option.value}
                  disabled={model.busy}
                  class="accent-primary"
                  onclick={async () => {
                    const changed = preferredPlatform !== option.value
                    preferredPlatform = option.value
                    preferenceOpen = false
                    if (changed)
                      await model.setPreference(
                        option.value === 'default' ? null : option.value,
                      )
                    await tick()
                    document.getElementById(`${fieldId}-preference`)?.focus()
                  }}
                >
                <span>{option.label}</span>
              </label>
            {/each}
          </fieldset>
        {/if}
      </div>
    {/if}
  {/if}
</section>
