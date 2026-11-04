<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
import { slide } from 'svelte/transition'
// ICONS
import AlertTriangle from 'virtual:icons/tabler/alert-triangle'
import Check from 'virtual:icons/tabler/check'
import Loader from 'virtual:icons/tabler/loader-2'
import ChevronDown from 'virtual:icons/tabler/chevron-down'
// ADAPTER
import { useUserMessagingSettingsModel } from '#lib/adapters/messaging/useUserMessagingSettingsModel.svelte.js'
// BITS COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import TextInputField from '#lib/bits/custom/form/TextInputField.svelte'
// TYPES
import type { MessagingPlatform } from '#lib/messaging/types.js'
let {
  userId,
  canVerify = false,
  embedded = false,
}: { userId?: string; canVerify?: boolean; embedded?: boolean } = $props()
const model = untrack(() => useUserMessagingSettingsModel(userId, canVerify))
const platforms: MessagingPlatform[] = ['whatsapp', 'telegram']
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
        <span class="text-sm font-medium text-muted-foreground"
          >{platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'}</span
        >
        <div
          class="flex h-12 items-center rounded-lg border border-border bg-surface px-4 motion-safe:animate-pulse"
        >
          <span class="h-3 w-2/3 rounded bg-base-content/10"></span>
        </div>
      </div>
    {/each}
  {:else}
    {#each platforms as platform}
      {@const platformName = platform === 'telegram' ? 'Telegram' : 'WhatsApp'}
      {@const identity = model.settings.identities.find(
        row => row.platform === platform,
      )}
      {@const state = model.states[platform]}
      <div class="flex min-w-0 flex-col gap-2">
        <div class="relative min-w-0">
          <!-- Keep our status control outside the native input rectangle used by autofill extensions. -->
          <TextInputField
            id={`${fieldId}-${platform}`}
            label={platformName}
            bind:value={model.inputs[platform]}
            placeholder={platform === 'whatsapp'
              ? 'Phone number'
              : 'Phone number or @username'}
            controlClass="pr-12!"
            inputClass="pr-10"
            inputAttrs={{
              autocomplete: 'off',
              autocapitalize: 'none',
              spellcheck: false,
              maxlength: 100,
              // InputText trims on blur; validate after its final value change.
              onblur: () => queueMicrotask(() => model.blurContact(platform)),
              'aria-describedby': `${fieldId}-${platform}-status`,
              'aria-invalid': state.kind === 'warning' && state.invalid,
            }}
            onValueChange={value => model.updateContact(platform, value)}
          />
          {#if state.kind === 'checking' ||
            state.kind === 'confirmed' ||
            state.kind === 'warning'}
            <button
              type="button"
              class="absolute bottom-0 right-1 flex size-12 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-focus {state.kind ===
              'confirmed'
                ? 'text-success'
                : state.kind === 'warning'
                  ? 'text-warning'
                  : 'text-muted-foreground'}"
              aria-label={`${platformName}: ${state.message}`}
              data-tooltip={state.message}
              disabled={state.kind !== 'warning'}
              onclick={() => model.retry(platform)}
            >
              {#if state.kind === 'checking'}
                <Loader
                  class="size-5 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              {:else if state.kind === 'confirmed'}
                <Check class="size-5" aria-hidden="true" />
              {:else}
                <AlertTriangle class="size-5" aria-hidden="true" />
              {/if}
            </button>
          {/if}
        </div>
        <span id={`${fieldId}-${platform}-status`} role="status" class="sr-only"
          >{state.message}</span
        >
        {#if canVerify && identity && !identity.verifiedAt}
          <p class="text-sm text-muted-foreground">
            Confirm independently that this messaging identity belongs to this person
            before verifying it. A matching name is insufficient.
          </p>
          {#each model.accounts.filter(
            account => account.platform === platform,
          ) as account}
            <Button
              text={`Confirm ownership using ${account.organisation}`}
              style="outline"
              class="h-auto py-2"
              labelClasses="min-w-0 max-w-none whitespace-normal break-words"
              disabled={model.busy || model.isDirty(platform)}
              onClick={() => void model.verify(account.id, platform)}
            />
          {/each}
          {#if !model.accounts.some(account => account.platform === platform)}
            <p class="text-sm text-muted-foreground">
              Connect an organisation's
              {platform === 'telegram' ? 'Telegram' : 'WhatsApp'}
              account to verify this address.
            </p>
          {/if}
        {/if}
      </div>
    {/each}
    {#if hasBothIdentities}
      <div class="flex min-w-0 flex-col gap-2 border-t border-border pt-4">
        <label
          for={`${fieldId}-preference`}
          class="text-sm font-medium text-muted-foreground"
        >
          Preferred messaging platform
        </label>
        <button
          id={`${fieldId}-preference`}
          type="button"
          aria-expanded={preferenceOpen}
          aria-controls={`${fieldId}-preference-options`}
          class="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-primary"
          disabled={model.busy}
          onclick={() => (preferenceOpen = !preferenceOpen)}
        >
          <span>{preferenceLabel}</span>
          <ChevronDown
            aria-hidden="true"
            class={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${preferenceOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {#if preferenceOpen}
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
                class="relative flex cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm hover:bg-surface has-checked:bg-raised has-focus-visible:outline-2 has-focus-visible:outline-primary"
              >
                <input
                  type="radio"
                  name={`${fieldId}-preferred-platform`}
                  value={option.value}
                  checked={preferredPlatform === option.value}
                  disabled={model.busy}
                  class="accent-primary"
                  onchange={() => {
                    preferredPlatform = option.value
                    void model.setPreference(
                      option.value === 'default' ? null : option.value,
                    )
                  }}
                >
                <span>{option.label}</span>
              </label>
            {/each}
          </fieldset>
        {/if}
        <p class="text-xs leading-relaxed text-muted-foreground">
          Choose how organisations should contact you. Existing conversations stay on
          their original platform.
        </p>
      </div>
    {/if}
  {/if}
</section>
