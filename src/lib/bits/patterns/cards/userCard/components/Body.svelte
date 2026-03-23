<script lang="ts">
import { Card } from '$lib/bits/custom'
import type { UserCardBodyProps } from '../userCard.types'

let {
  name = null,
  attribution = null,
  class: className = '',
}: UserCardBodyProps = $props()
</script>

<Card.Body
  code={attribution}
  title={name || '-'}
  class={`bits-form__user-card-body ${className} pr-0`}
/>
