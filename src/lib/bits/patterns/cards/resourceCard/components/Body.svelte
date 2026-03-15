<script lang="ts">
import type { ResourceCardBodyProps } from '../resourceCard.types'

let {
  code = null,
  name = null,
  class: className = '',
}: ResourceCardBodyProps = $props()
</script>

<div class={`bits-form__parent-resource-item-copy ${className}`}>
  <p class="bits-form__parent-resource-item-code">{name ? code || '-' : '-'}</p>
  <p class="bits-form__parent-resource-item-name">{name || code || '-'}</p>
</div>
