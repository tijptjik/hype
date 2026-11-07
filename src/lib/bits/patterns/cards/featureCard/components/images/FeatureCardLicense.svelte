<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import CcIcon from 'virtual:icons/cib/creative-commons'
import CopyrightIcon from 'virtual:icons/mingcute/copyright-line'
import PublicDomainIcon from 'virtual:icons/cib/creative-commons-pd-alt'
// TYPES
import type { ProjectLicenseRights } from '#lib/db/zod/schema/projectLicense.types.js'

let {
  rights,
  mediaLabel,
  centered = false,
}: { rights: ProjectLicenseRights; mediaLabel?: string; centered?: boolean } = $props()

// Match the official destinations used by the project license editor; custom labels stay unlinked.
const destinations: Record<string, string> = {
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC BY': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'CC BY-NC-SA': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'CC BY-ND': 'https://creativecommons.org/licenses/by-nd/4.0/',
  'CC BY-NC-ND': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  'ODC-By': 'https://opendatacommons.org/licenses/by/1-0/',
  'ODC-ODbL': 'https://opendatacommons.org/licenses/odbl/1-0/',
  PDDL: 'https://opendatacommons.org/licenses/pddl/1-0/',
}
const href = $derived(destinations[rights.license])
const isCreativeCommons = $derived(rights.license.startsWith('CC '))
const LicenseIcon = $derived(
  rights.isPublicDomain ? PublicDomainIcon : isCreativeCommons ? CcIcon : CopyrightIcon,
)
</script>

<div class="space-y-1" class:text-center={centered}>
  <dt class={mediaLabel ? 'text-muted-foreground text-xs' : 'sr-only'}>
    {mediaLabel || m.field_license()}
  </dt>
  <dd class="flex items-center gap-2" class:justify-center={centered}>
    <LicenseIcon class="size-5 shrink-0" aria-hidden="true" />
    {#if href}
      <a
        {href}
        target="_blank"
        rel="noopener noreferrer"
        class="decoration-foreground/30 min-w-0 break-words underline underline-offset-2 hover:decoration-current"
        >{rights.license}</a
      >
    {:else}
      <span class="min-w-0 break-words">{rights.license}</span>
    {/if}
  </dd>
</div>
