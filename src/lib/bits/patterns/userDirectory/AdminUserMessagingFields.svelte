<script lang="ts">
// BITS COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import TextInputField from '#lib/bits/custom/form/TextInputField.svelte'
import Select from '#lib/bits/core/select/Select.svelte'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// PRESENTATION
import { CONTACT_SERVICES } from '#lib/bits/patterns/messaging/serviceRegistry.js'
// CONTACT INPUT
import { parseMessagingContact } from '#lib/messaging/contactInput.js'
// TYPES
import type { AdminMessagingDraft } from '#lib/users/adminMessagingDraft.js'
let {
  value = $bindable(),
  editing,
  disabled = false,
  errors = {},
  phoneNumber = '',
  onChange,
}: {
  value: AdminMessagingDraft
  editing: boolean
  disabled?: boolean
  errors?: Record<string, string>
  phoneNumber?: string
  onChange: (field: string) => void
} = $props()
const id = $props.id()
const parsedPhone = $derived(parseMessagingContact(phoneNumber))
const profilePhone = $derived(
  parsedPhone.kind === 'valid' ? parsedPhone.identity.phoneNumber : null,
)
</script>

<div class="min-w-0 space-y-4">
  {#each CONTACT_SERVICES as service (service.id)}
    {@const contact = parseMessagingContact(value[service.id])}
    <div class="min-w-0 space-y-2">
      <TextInputField
        variant="resource"
        id={`${id}-${service.id}`}
        label={service.label}
        labelIcon={service.icon}
        value={value[service.id]}
        isEditing={editing}
        {disabled}
        placeholder={editing ? service.placeholder : '—'}
        issues={errors[service.id] ? [errors[service.id]] : undefined}
        errorId={`${id}-${service.id}-error`}
        inputAttrs={{
          autocomplete: 'off',
          'aria-invalid': Boolean(errors[service.id]),
          'aria-describedby': errors[service.id]
            ? `${id}-${service.id}-error`
            : undefined,
        }}
        onValueChange={text => {
          value[service.id] = text
          onChange(service.id)
        }}
      >
        {#snippet labelRight()}
          <SimpleTooltip
            triggerProps={{ role: 'button', 'aria-label': `${service.label} status` }}
            contentClass="max-w-80 p-3 text-sm"
          >
            {#snippet trigger()}
              <span class="text-muted-foreground text-xs">Feature forthcoming</span>
            {/snippet}
            {#snippet children()}
              Account confirmation is a forthcoming feature. Service details are saved
              with the profile when you select Save.
            {/snippet}
          </SimpleTooltip>
        {/snippet}
        {#snippet trailing()}
          {#if editing &&
            profilePhone &&
            !(
              contact.kind === 'valid' && contact.identity.phoneNumber === profilePhone
            )}
            <Button
              text="Use phone number"
              size="xs"
              style="soft"
              color="primary"
              {disabled}
              attrs={{ 'aria-label': `Use phone number for ${service.label}` }}
              class="h-6! rounded-md! px-2! shadow-none!"
              labelClasses="text-xs font-normal"
              onClick={() => {
                if (profilePhone) {
                  value[service.id] = profilePhone
                  onChange(service.id)
                }
              }}
            />
          {/if}
        {/snippet}
      </TextInputField>
    </div>
  {/each}
  <div class="border-border space-y-2 border-t pt-4">
    <span class="text-muted-foreground text-sm font-medium"
      >Preferred messaging platform</span
    >
    <Select
      triggerAttrs={{ 'aria-label': 'Preferred messaging platform' }}
      value={value.preferredPlatform ?? 'default'}
      items={[
        { value: 'default', label: 'Use default (WhatsApp)' },
        { value: 'whatsapp', label: 'WhatsApp' },
        { value: 'telegram', label: 'Telegram' },
      ]}
      isEditing={editing}
      disabled={disabled || !editing}
      variant="ghost"
      reserveTriggerSpace
      class="flex!"
      onValueChange={next => {
        value.preferredPlatform =
          next === 'telegram' || next === 'whatsapp' ? next : null
        onChange('preferredPlatform')
      }}
    />
  </div>
</div>
