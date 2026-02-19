<script lang="ts">
import { SectionHeader } from '$lib/bits/custom/form'
import type { FormI18nHeaderProps } from '../formI18nSection.types'

let {
  title,
  subtitle,
  headerActions,
  flags = [],
  actions = [],
  triggers = [],
  left,
  center,
  right,
}: FormI18nHeaderProps = $props()
</script>

{#if title || subtitle || headerActions || flags.length > 0 || actions.length > 0 || triggers.length > 0 || left || center || right}
  <SectionHeader
    {title}
    description={subtitle}
    {flags}
    {actions}
    {triggers}
    left={left ?? headerActions}
    {center}
    {right}
  />
{/if}
