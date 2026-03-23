<script lang="ts">
import { SimpleTooltip } from '$lib/bits/core'
import { Card, Icon } from '$lib/bits/custom'
import CcIcon from 'virtual:icons/cib/creative-commons'
import CopyrightLineIcon from 'virtual:icons/mingcute/copyright-line'
import CcPdAltIcon from 'virtual:icons/cib/creative-commons-pd-alt'
import type { LicenseCardProps } from './licenseCard.types'

let {
  mediaLabel,
  mediaLicense,
  mediaIcon,
  attribution = null,
  conditions,
  showLicenseName = false,
  isPublicDomain = false,
  isAllRightsReserved = false,
  class: className = '',
}: LicenseCardProps = $props()

const attributionLabel = $derived(
  attribution?.trim()?.length ? `${attribution.trim()}` : null,
)
const attributionIcon = $derived.by(() => {
  if (isPublicDomain) return CcPdAltIcon
  if (isAllRightsReserved || showLicenseName) return CopyrightLineIcon
  return CcIcon
})
</script>

<Card.Root class={['bits-license-card', className].filter(Boolean).join(' ')}>
  <SimpleTooltip>
    {#snippet trigger()}
      <Card.Media class="bits-license-card__media" size="md">
        <div class="bits-license-card__media-icon">
          <Icon src={mediaIcon} size="lg" tone="primary" />
        </div>
      </Card.Media>
    {/snippet}
    <span>{mediaLicense}</span>
  </SimpleTooltip>

  <div class="bits-license-card__content">
    <div class="bits-license-card__body" aria-label={`${mediaLabel} license terms`}>
      {#if showLicenseName}
        <p class="bits-license-card__state">{mediaLicense}</p>
      {:else if isPublicDomain}
        <p class="bits-license-card__state">Public Domain</p>
      {:else if isAllRightsReserved}
        <p class="bits-license-card__state">All Rights Reserved</p>
      {:else}
        <div class="bits-license-card__conditions">
          {#each conditions as condition (condition.key)}
            <SimpleTooltip>
              {#snippet trigger()}
                <span class="bits-license-card__condition" aria-label={condition.label}>
                  <Icon src={condition.icon} size="xl" tone="inherit" />
                </span>
              {/snippet}
              <span class="bits-license-card__tooltip-title">{condition.label}</span>
              <span>{condition.description}</span>
            </SimpleTooltip>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  {#if attributionLabel}
    <Card.Actions padding="sm" bg="panel" class="bits-license-card__actions">
      <span class="bits-license-card__attribution">
        <Icon src={attributionIcon} size="lg" tone="inherit" />
        <span class="bits-license-card__attribution-text truncate">
          {attributionLabel}
        </span>
      </span>
    </Card.Actions>
  {/if}
</Card.Root>
