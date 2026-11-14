<script lang="ts">
// COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import ReconciliationProgress from './ReconciliationProgress.svelte'
// ICONS
import LinkIcon from 'virtual:icons/proicons/link'
import LocationIcon from 'virtual:icons/proicons/location'
import BackIcon from 'virtual:icons/proicons/arrow-left'
let {
  matched,
  drafts = 0,
  skipped,
  total,
  unavailable,
  disabled,
  canMark,
  canLink,
  canPrevious,
  onskip,
  onprevious,
  onmark,
  onlink,
  onunavailable,
  onmatched,
}: {
  skipped: number
  matched: number
  drafts?: number
  total: number
  unavailable: number
  disabled: boolean
  canMark: boolean
  canLink: boolean
  canPrevious: boolean
  onskip: () => void
  onprevious: () => void
  onmark: () => void
  onlink: () => void
  onunavailable: () => void
  onmatched: () => void
} = $props()
</script>
<div class="flex items-center gap-2">
  <ReconciliationProgress
    {matched}
    {drafts}
    {skipped}
    {total}
    {unavailable}
    onclick={onunavailable}
    {onmatched}
  />

  {#if canPrevious}
    <Button
      text="Previous"
      iconComponent={BackIcon}
      hideLabel
      {disabled}
      onClick={onprevious}
    />
  {/if}
  <Button text="Skip for now" {disabled} onClick={onskip} />
  <Button
    text="Location unavailable"
    color="info"
    iconComponent={LocationIcon}
    disabled={disabled || !canMark}
    onClick={onmark}
  />
  <Button
    text="Link Location"
    color="success"
    iconComponent={LinkIcon}
    disabled={disabled || !canLink}
    onClick={onlink}
  />
</div>
