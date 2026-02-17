<script lang="ts">
import type { UserCardBodyProps } from '../userCard.types'

let {
  name = null,
  attribution = null,
  class: className = '',
}: UserCardBodyProps = $props()
</script>

<div class={`bits-form__user-card-body ${className}`}>
  <span class="bits-form__user-card-body-attribution">{attribution}</span>
  <span class="bits-form__user-card-body-name">{name || '-'}</span>
</div>
