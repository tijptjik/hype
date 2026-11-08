<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { Icon } from '#lib/bits/custom/index.js'
import { cx } from '#lib/bits/utils.js'
// ICONS
import CcIcon from 'virtual:icons/cib/creative-commons'
import CopyrightLineIcon from 'virtual:icons/mingcute/copyright-line'
import CcPdAltIcon from 'virtual:icons/cib/creative-commons-pd-alt'
// TYPES
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
const licenseTitle = $derived(
  showLicenseName
    ? mediaLicense
    : isPublicDomain
      ? m.admin__project_license_condition_public_domain()
      : isAllRightsReserved
        ? m.admin__project_license_condition_all_rights_reserved()
        : mediaLicense,
)
</script>

<article
  class={cx(
    'my-5 min-w-0 rounded-lg border border-foreground/10 bg-foreground/[0.025] p-4',
    className,
  )}
  aria-label={`${mediaLabel} license terms`}
>
  <div class="flex min-w-0 items-start justify-between gap-3">
    <div class="flex min-w-0 items-start gap-2">
      <span class="text-primary mt-0.5 shrink-0" aria-hidden="true">
        <Icon src={attributionIcon} size="md" tone="inherit" />
      </span>
      <h3 class="min-w-0 text-base leading-6 font-semibold [overflow-wrap:anywhere]">
        {licenseTitle}
      </h3>
    </div>
    <span
      class="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs leading-6 font-medium"
    >
      <span aria-hidden="true"><Icon src={mediaIcon} size="xs" tone="inherit" /></span>
      {mediaLabel}
    </span>
  </div>
  {#if conditions.length}
    <ul class="mt-2 space-y-1.5">
      {#each conditions as condition (condition.key)}
        <li class="text-muted-foreground flex items-start gap-2 text-sm leading-5">
          {#if !isPublicDomain && !isAllRightsReserved}
            <span class="mt-0.5 shrink-0" aria-hidden="true"
              ><Icon src={condition.icon} size="sm" tone="inherit" /></span
            >
          {/if}
          <span>{condition.description}</span>
        </li>
      {/each}
    </ul>
  {/if}
  <dl class="border-foreground/10 mt-4 min-w-0 border-t pt-3">
    <dt class="text-muted-foreground text-xs font-medium">{m.field_attribution()}</dt>
    <dd class="mt-1 text-sm leading-5 font-medium [overflow-wrap:anywhere]">
      {attributionLabel ?? '—'}
    </dd>
  </dl>
</article>
