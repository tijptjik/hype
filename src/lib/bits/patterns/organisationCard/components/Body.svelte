<script lang="ts">
import type { OrganisationCardBodyProps } from '../organisationCard.types'

let {
  code = null,
  name = null,
  class: className = '',
}: OrganisationCardBodyProps = $props()
</script>

<div class={`bits-form__hub-orgs-item-copy ${className}`}>
  <p class="bits-form__hub-orgs-item-code">{name ? code || '-' : '-'}</p>
  <p class="bits-form__hub-orgs-item-name">{name || code || '-'}</p>
</div>
