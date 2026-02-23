<script lang="ts">
import { Card } from '$lib/bits/custom'
import type { OrganisationCardMediaProps } from '../organisationCard.types'

let {
  image = null,
  alt = null,
  class: className = '',
}: OrganisationCardMediaProps = $props()
</script>

<Card.Avatar
  name={alt}
  {image}
  class={`bits-form__hub-orgs-item-media ${className}`}
  imageClass="bits-form__hub-orgs-item-image"
  fallbackClass="bits-form__hub-orgs-item-image bits-form__hub-orgs-item-image--empty"
/>
