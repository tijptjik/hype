<script lang="ts">
import { curationText } from '#lib/locations/curationIdentity.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// COMPONENTS
import { locationTaxonomy } from '#lib/locations/taxonomy.js'
import { locationTaxonomyLabel } from '#lib/locations/taxonomy.i18n.js'
// VALUE FORMATTING
import { phoneDisplay } from '#lib/utils/phone-property.js'
// ICONS
import BrandIcon from 'virtual:icons/lucide/tag'
// TYPES
import type { LocationResource } from '#lib/locations/resource.js'
let { place, isEditing = false }: { place: LocationResource; isEditing?: boolean } =
  $props()
/** Format retained timestamps in the interface language and Hong Kong timezone.
 * @param value Stored ISO timestamp. @returns Readable date/time without changing its provenance.
 */
function dateLabel(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(
        getLocaleKey() === 'en'
          ? 'en-HK'
          : getLocaleKey() === 'zhHant'
            ? 'zh-Hant-HK'
            : 'zh-Hans-HK',
        { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Hong_Kong' },
      ).format(date)
}
const taxonomy = $derived(place.taxonomy ?? locationTaxonomy(place.kind))
const tag = $derived(
  getLocaleKey() === 'zhHant'
    ? 'zh-hant'
    : getLocaleKey() === 'zhHans'
      ? 'zh-hans'
      : 'en',
)
const ownerName = $derived(
  place.ownerOrganisationNames?.[tag] ||
    place.ownerOrganisationNames?.en ||
    Object.values(place.ownerOrganisationNames ?? {}).find(Boolean) ||
    place.ownerOrganisationId,
)
const correctionName = $derived(
  place.editingOrganisationNames?.[tag] ||
    place.editingOrganisationNames?.en ||
    Object.values(place.editingOrganisationNames ?? {}).find(Boolean) ||
    place.editingOrganisationId,
)
const brandNames = $derived(
  (place.facts?.brands ?? []).map(
    brand =>
      brand.names[tag] || brand.names.en || Object.values(brand.names).find(Boolean),
  ),
)
</script>

<aside class="min-w-0 space-y-6" aria-label={m.location_record_metadata()}>
  <div class="space-y-2">
    <h2 class="text-muted-foreground text-sm font-semibold">
      {m.location_record_metadata()}
    </h2>
    <div class="flex flex-wrap gap-2 text-xs">
      <span class="bg-primary/10 text-primary rounded-full px-3 py-1 font-medium"
        >{place.state === 'unresolved'
          ? m.location_state_unmatched()
          : place.state === 'manual'
            ? m.location_state_private()
            : place.state === 'linked'
              ? m.location_state_matched()
              : m.location_state_redirect()}</span
      >
      <span class="border-border rounded-full border px-3 py-1"
        >{place.sourceAvailability === 'current'
          ? m.location_source_current()
          : place.sourceAvailability === 'missing'
            ? m.location_source_missing()
            : m.location_source_review()}</span
      >
    </div>
  </div>
  {#each [
    { label: 'Branch', value: curationText(place.facts?.branch, tag) },
    { label: 'Format', value: curationText(place.facts?.format, tag) },
    { label: 'Branch ID', value: place.facts?.branchId },
  ] as field}
    {#if field.value}
      <div class="space-y-1">
        <h3 class="text-muted-foreground text-sm">{field.label}</h3>
        <p class="break-words">{field.value}</p>
      </div>
    {/if}
  {/each}
  {#if place.facts}
    {#if !isEditing}
      <div class="space-y-2">
        {#each Object.entries(place.facts.names).filter(
          ([, name]) => name,
        ) as [locale, name]}
          <p lang={locale} class="flex flex-wrap items-baseline gap-x-2">
            <span class="text-muted-foreground text-xs"
              >{locale === 'en'
                ? 'EN'
                : locale === 'zh-hant'
                  ? '繁體'
                  : locale === 'zh-hans'
                    ? '简体'
                    : locale}</span
            ><span class="text-sm">{name}</span>
          </p>
        {/each}
      </div>
    {/if}
    {#if place.facts.phoneNumber.length}
      <div class="space-y-2">
        {#each place.facts.phoneNumber as phone}
          {@const display = phoneDisplay(phone)}
          <div class="flex items-center gap-2 text-sm">
            {#if display.flag}
              <span role="img" aria-label={display.country} class="text-xl leading-none"
                >{display.flag}</span
              >
            {/if}
            {#if display.href}
              <a class="text-primary tabular-nums hover:underline" href={display.href}
                >{display.text}</a
              >
            {:else}
              <span>{display.text}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    {#if brandNames.length}
      <div class="flex items-start gap-2 text-sm">
        <BrandIcon
          class="text-muted-foreground mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        /><span>{brandNames.join(', ')}</span>
      </div>
    {/if}
  {/if}
  <dl class="border-border space-y-4 border-t pt-4">
    {#if !isEditing}
      <div>
        <dt class="text-muted-foreground mb-1 text-xs">
          {locationTaxonomyLabel('kind')}
        </dt>
        <dd class="text-sm">{locationTaxonomyLabel(taxonomy.kind)}</dd>
      </div>
      <div>
        <dt class="text-muted-foreground mb-1 text-xs">
          {locationTaxonomyLabel('class')}
        </dt>
        <dd class="text-sm">
          {taxonomy.class
            ? locationTaxonomyLabel(taxonomy.class)
            : taxonomy.kind === 'address'
              ? '—'
              : locationTaxonomyLabel('unknown')}
        </dd>
      </div>
    {/if}
    <div>
      <dt class="text-muted-foreground mb-1 text-xs">{m.location_record_owner()}</dt>
      <dd class="text-sm">
        {#if place.ownerOrganisationId}
          <a
            href={`/admin/organisations/${place.ownerOrganisationId}`}
            class="text-primary hover:underline"
            data-tooltip={place.ownerOrganisationId}
            >{ownerName}</a
          >
        {:else}
          {m.location_record_shared()}
        {/if}
      </dd>
    </div>
    {#each [
      { label: m.location_record_created(), value: place.metadata?.createdAt },
      { label: m.location_record_updated(), value: place.metadata?.revisionCreatedAt },
    ] as item}
      {#if item.value}
        <div>
          <dt class="text-muted-foreground mb-1 text-xs">{item.label}</dt>
          <dd class="text-sm">
            <time datetime={item.value} data-tooltip={`${item.value} · Asia/Hong_Kong`}
              >{dateLabel(item.value)}</time
            >
          </dd>
        </div>
      {/if}
    {/each}
    {#if place.metadata?.origin}
      <div>
        <dt class="text-muted-foreground mb-1 text-xs">{m.location_record_source()}</dt>
        <dd class="text-sm">
          {place.metadata.origin === 'local'
            ? m.location_record_local_source()
            : 'SaanSeoi'}
        </dd>
      </div>
    {/if}
    {#if place.metadata?.version}
      <div>
        <dt class="text-muted-foreground mb-1 text-xs">
          {m.location_record_baseline_version()}
        </dt>
        <dd class="text-sm">#{place.metadata.version}</dd>
      </div>
    {/if}
    {#if place.organisationRevision && correctionName}
      <div>
        <dt class="text-muted-foreground mb-1 text-xs">
          {m.location_record_corrections_for()}
        </dt>
        <dd class="text-sm">{correctionName}</dd>
      </div>
    {/if}
  </dl>
  <details class="border-border border-t pt-4">
    <summary class="text-muted-foreground cursor-pointer text-sm">
      {m.location_record_identifiers()}
    </summary>
    <dl class="mt-4 space-y-4">
      {#each [
        { label: 'HYPE ID', value: place.id },
        { label: 'SaanSeoi ID', value: place.ssId },
        { label: m.location_record_revision_id(), value: place.revisionId },
        {
          label: m.location_record_correction_revision(),
          value: place.organisationRevision,
          help: m.location_record_correction_revision_help(),
        },
        { label: 'API', value: place.metadata?.apiVersion },
        { label: m.location_record_release(), value: place.metadata?.releaseId },
        { label: m.location_record_snapshot(), value: place.metadata?.snapshotId },
      ] as item}
        {#if item.value}
          <div>
            <dt class="text-muted-foreground mb-1 text-xs" data-tooltip={item.help}>
              {item.label}
            </dt>
            <dd class="font-mono text-xs leading-relaxed break-all">{item.value}</dd>
          </div>
        {/if}
      {/each}
    </dl>
  </details>
</aside>
