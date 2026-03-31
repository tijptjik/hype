<script lang="ts">
import type { FormLabelIssuesProps } from '../types'

let { issues, class: className = '' }: FormLabelIssuesProps = $props()

const messages = $derived.by(() => {
  if (!issues) return []
  return issues.map(issue => issue.message).filter(Boolean)
})
</script>

{#if messages.length > 0}
  <div class={`bits-form__error ${className}`}>{messages.join(' ')}</div>
{/if}
