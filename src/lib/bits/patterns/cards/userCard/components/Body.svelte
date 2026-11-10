<script lang="ts">
// BITS COMPONENTS
import { Card } from '#lib/bits/custom/index.js'
// TYPES
import type { UserCardBodyProps } from '../userCard.types'

let {
  name = null,
  wrapTitle = false,
  username = null,
  displayUsername = null,
  attribution = null,
  class: className = '',
}: UserCardBodyProps = $props()
</script>

<Card.Body
  code={attribution}
  {wrapTitle}
  title={name || '-'}
  class={`bits-form__user-card-body ${className} pr-0`}
>
  {#snippet tags()}
    {#if username}
      <a
        href={`/admin/users/${encodeURIComponent(username)}`}
        class="text-muted-foreground hover:text-primary focus-visible:outline-primary max-w-full min-w-0 text-sm break-words whitespace-normal hover:underline focus-visible:outline"
        >@{displayUsername || username}</a
      >
    {/if}
  {/snippet}
</Card.Body>
