<script lang="ts">
import type { FormLabelIssuesProps } from '../types'

let { issues, class: className = '' }: FormLabelIssuesProps = $props()

const messages = $derived.by(() => {
  if (!issues) return []
  if (Array.isArray(issues)) return issues.filter(Boolean)
  return [issues]
})
</script>

{#if messages.length > 0}
  <div class={`bits-form__error ${className}`}>{messages.join(' ')}</div>
{/if}
