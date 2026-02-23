<script lang="ts">
import type { OrganisationCardMediaProps } from '../organisationCard.types'

let {
  image = null,
  alt = null,
  class: className = '',
}: OrganisationCardMediaProps = $props()
</script>

<div class={`bits-form__hub-orgs-item-media ${className}`}>
  {#if image}
    <img
      src={image}
      alt={alt || ''}
      class="bits-form__hub-orgs-item-image"
      loading="lazy"
    >
  {:else}
    <div
      class="bits-form__hub-orgs-item-image bits-form__hub-orgs-item-image--empty"
    ></div>
  {/if}
</div>
