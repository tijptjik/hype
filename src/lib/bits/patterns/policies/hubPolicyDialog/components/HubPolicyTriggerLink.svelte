<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
// TYPES
import type { HubPolicyTriggerLinkProps } from './hubPolicyDialogPrimitives.types'

let { text, class: className = '' }: HubPolicyTriggerLinkProps = $props()
</script>

<button
  type="button"
  class={cx(
    'inline-flex items-center text-sm font-medium text-primary underline underline-offset-4 transition hover:text-primary-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    className,
  )}
>
  {text}
</button>
