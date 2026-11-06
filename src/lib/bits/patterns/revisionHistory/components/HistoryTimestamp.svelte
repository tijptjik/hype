<script lang="ts">
// TYPES
import type { HTMLAttributes } from 'svelte/elements'

let {
  value,
  label,
  exact,
  ...attrs
}: Omit<HTMLAttributes<HTMLTimeElement>, 'children'> & {
  value: string
  label: string
  exact: string
} = $props()
</script>

<time {...attrs} datetime={value} data-tooltip={exact}>{label}</time>
