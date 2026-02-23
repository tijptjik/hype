<script lang="ts">
import { Switch } from '$lib/bits/custom'
import type { OrganisationCardActionsProps } from '../organisationCard.types'

let {
  isRemoving = false,
  isEditing = true,
  isSubmitting = false,
  canSetCoreInclusive = false,
  isHubExclusive,
  isCoreInclusive,
  onToggleHubExclusive,
  onToggleCoreInclusive,
  onRemove,
  class: className = '',
}: OrganisationCardActionsProps = $props()

const isDisabled = $derived(!isEditing || isSubmitting)
</script>

<div class={className}>
  {#if isRemoving}
    <div class="bits-form__hub-orgs-item-remove">
      <button
        type="button"
        class="bits-form__hub-orgs-remove-btn"
        onclick={() => onRemove()}
        disabled={isDisabled}
      >
        Remove
      </button>
    </div>
  {:else}
    <div class="bits-form__hub-orgs-item-flags">
      <label class="bits-form__hub-orgs-flag">
        <span class="bits-form__hub-orgs-flag-label">Hub Only</span>
        <Switch
          checked={isHubExclusive}
          disabled={isDisabled}
          onCheckedChange={value => onToggleHubExclusive(value === true)}
        />
      </label>

      {#if canSetCoreInclusive}
        <label class="bits-form__hub-orgs-flag">
          <span class="bits-form__hub-orgs-flag-label">Core</span>
          <Switch
            checked={isCoreInclusive}
            disabled={isDisabled}
            onCheckedChange={value => onToggleCoreInclusive(value === true)}
          />
        </label>
      {/if}
    </div>
  {/if}
</div>
