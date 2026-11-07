<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import ByIcon from 'virtual:icons/cib/creative-commons-by'
import SaIcon from 'virtual:icons/cib/creative-commons-sa'
import NcIcon from 'virtual:icons/cib/creative-commons-nc'
import NdIcon from 'virtual:icons/cib/creative-commons-nd'
// TYPES
import type { ProjectLicenseRights } from '#lib/db/zod/schema/projectLicense.types.js'

let { rights, mediaLabel }: { rights?: ProjectLicenseRights; mediaLabel: string } =
  $props()
</script>

{#if rights?.license.startsWith('CC ') &&
  !rights.isPublicDomain &&
  !rights.isAllRightsReserved}
  <span class="text-muted-foreground inline-flex shrink-0 items-center gap-1.5">
    {#if rights.BY}
      <span
        data-tooltip={mediaLabel +
          ': ' +
          m.admin__project_license_condition_by_description()}
        ><ByIcon class="size-5" aria-label="BY" /></span
      >
    {/if}
    {#if rights.SA}
      <span
        data-tooltip={mediaLabel +
          ': ' +
          m.admin__project_license_condition_sa_description()}
        ><SaIcon class="size-5" aria-label="SA" /></span
      >
    {/if}
    {#if rights.NC}
      <span
        data-tooltip={mediaLabel +
          ': ' +
          m.admin__project_license_condition_nc_description()}
        ><NcIcon class="size-5" aria-label="NC" /></span
      >
    {/if}
    {#if rights.ND}
      <span data-tooltip={`${mediaLabel}: ND`}
        ><NdIcon class="size-5" aria-label="ND" /></span
      >
    {/if}
  </span>
{/if}
