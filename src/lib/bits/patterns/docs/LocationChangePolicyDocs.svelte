<script lang="ts">
// COMPONENTS
import MermaidDiagram from '#lib/bits/custom/mermaidDiagram/MermaidDiagram.svelte'
// DOCS
import {
  featureResolvedValueFlow,
  locationChangeFlow,
} from '#lib/docs/locationChangePolicies.js'
</script>

<section id="location-change-policies" class="scroll-mt-6">
  <h2 class="text-xl font-semibold">7. Location updates</h2>
  <p class="my-4 max-w-3xl">
    <a
      href="https://saanseoi.hk"
      target="_blank"
      rel="noreferrer"
      class="inline-flex items-center gap-2 underline underline-offset-4"
    >
      <span
        aria-hidden="true"
        class="size-5 bg-current [mask:url(/logos/saanseoi.svg)_center/contain_no-repeat]"
      ></span
      >SaanSeoi
    </a>
    supplies upstream evidence. Community curations enrich or correct that evidence
    without rewriting it. Organisation customizations sit above the accepted evidence. A
    field omitted from an overlay inherits the value below it; an explicit clear
    suppresses it. Resolved values are outputs, separate from authored customizations.
  </p>
  <h3 class="mt-6 text-lg font-semibold">How a Feature gets its display values</h3>
  <p class="my-4 max-w-3xl">
    Start with the Feature’s accepted Location values, not the newest available edits.
    Upstream evidence provides the base where available; accepted community curations
    overlay it. Organisation customizations then replace only the fields they define.
    Omitted fields pass through, while explicit clears suppress them. Pending changes do
    not appear until accepted. Internal Locations have only Organisation values; locally
    created community Locations have no upstream evidence to inherit.
  </p>
  <MermaidDiagram
    source={featureResolvedValueFlow}
    label="How a Feature gets its display values"
  />
  <p class="my-4 max-w-3xl">
    The resolved fields supply the address and marker. The selected locale-specific
    template combines resolved Location fields and Feature properties to generate a
    display name; an explicit manual Feature name takes precedence. The template
    registry and sparse-layer storage shown here remain part of the approved target, as
    described in Implementation status below.
  </p>
  <h3 class="mt-6 text-lg font-semibold">Community or Internal</h3>
  <p class="my-4 max-w-3xl">
    The edit destination controls where an edit goes. Community contributes to the
    community curations for the Location. Internal saves an Organisation customization.
    Location visibility is separate: a community Location can have internal
    customizations. Permissioned editors can contribute names, addresses and other
    fields; accepting their contributions is governed by the consuming Organisation’s
    policies.
  </p>
  <p class="my-4 max-w-3xl">
    The approved model has three starting points: an upstream-linked Location inherits
    upstream evidence and community curations; a locally created community Location
    starts with community curations; an internal Location starts with Organisation
    customizations. Internal Locations have no upstream or community layer. Publishing
    an internal Location transfers its values to community curations and removes the
    publishing Organisation’s corresponding customizations in the same transaction.
  </p>
  <h3 class="mt-6 text-lg font-semibold">Policies and acceptance</h3>
  <p class="my-4 max-w-3xl">
    Project policy overrides Organisation defaults. Data policies have no Layer
    override. SaanSeoi and community changes have separate rules; “Same policy for
    community changes” uses the SaanSeoi rules for both sources while preserving the
    separate choices. Acceptance is Organisation-wide: accepting a value updates all its
    consumers in that Organisation and releases the affected customization. Keeping the
    current value retains it as an explicit Organisation customization.
  </p>
  <div class="my-6 overflow-x-auto">
    <table class="w-full text-left text-sm">
      <caption class="mb-3 text-left font-semibold">
        Approved default community policy
      </caption>
      <thead>
        <tr class="border-border border-b">
          <th class="p-3">Group</th>
          <th class="p-3">Fields</th>
          <th class="p-3">Action</th>
        </tr>
      </thead>
      <tbody>
        {#each [
          [
            'Identity',
            'Names, group, brand, format, branch, identifiers and existing taxonomy',
            'Review',
          ],
          ['Address', 'Street address, building, floor and unit', 'Review'],
          ['Map position', 'Marker coordinates', 'Review'],
          ['Relocation', 'Business or venue move', 'Review'],
          ['Communications', 'Phone numbers, websites and socials', 'Accept changes'],
          ['Templates', 'Community display-template assignment', 'Review'],
        ] as row}
          <tr class="border-border border-b">
            {#each row as cell}
              <td class="p-3">{cell}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="my-4 max-w-3xl">
    “Accept when our value is empty” permits missing content to be filled without
    replacing a nonempty value or an explicit suppression. “Accept newly resolved
    addresses” applies to previously unfound or unresolved address evidence. Neither
    exception authorizes a relocation, bypasses missing dependencies, or bypasses a
    separate marker review. Skip retains accepted evidence; review keeps it visible
    until a decision is made.
  </p>
  <h3 class="mt-6 text-lg font-semibold">Separate flow: edits and acceptance</h3>
  <p class="my-4 max-w-3xl">
    Community field locks govern contributions, not display inheritance. All fields
    start open. Only SuperAdmin can change their boolean controls using the lock in the
    Location record toolbar. A locked field must be unlocked before anyone, including
    SuperAdmin, can change its community curation. Map position and address have
    separate controls; localized fields are locked across their languages. A mixed save
    touching any locked field is rejected as a whole. Locks do not block Internal
    customizations, SaanSeoi ingestion, or acceptance of already-published evidence.
  </p>
  <MermaidDiagram
    source={locationChangeFlow}
    label="Edits and acceptance: separate from display resolution"
  />
  <h3 class="mt-6 text-lg font-semibold">Identity and localized names</h3>
  <p class="my-4 max-w-3xl">
    Group is corporate affiliation, independent of storefront branding. Brand is the
    public family, such as AROME. Format is a full marketed name, such as “AROME
    Bakery”. Branch is the outlet designation, such as “Central”. Branch ID is the
    group’s outlet identifier; it is text, so leading zeros remain intact. Branch and
    format are localized community curations and are never inferred by splitting the
    upstream name. Category follows the existing taxonomy.
  </p>
  <p class="my-4 max-w-3xl">
    The approved catalogue gives brands and groups editable names in English,
    Traditional Chinese and Simplified Chinese, plus a logo. Community curations
    reference brandId and groupId; the Location anchor and upstream evidence do not own
    these links. Imported brand objects retain their raw identifiers and localized
    names. Missing catalogue translations initially copy an available name. A linked
    brand uses the curated catalogue values, subject to the same acceptance policy as
    other identity changes.
  </p>
  <h3 class="mt-6 text-lg font-semibold">Display templates</h3>
  <p class="my-4 max-w-3xl">
    Named, versioned, locale-specific templates reference properties and accepted
    Location fields. The default title pairs format, or otherwise brand, with branch; if
    either side is missing it falls back to the provided name. A manual name takes
    precedence. Assignment precedence is system, accepted community Location,
    Organisation, Project, Layer, then explicit record. Location templates cannot depend
    on a consuming Feature’s properties. Changed dependencies regenerate affected
    display values; publishing a template revision can regenerate all its references.
  </p>
  <h3 class="mt-6 text-lg font-semibold">Implementation status</h3>
  <p class="my-4 max-w-3xl">
    The diagram describes the approved target. Source-specific policies, permissioned
    community editing, localized branch/format fields and the global Branch property
    migration are present in the implementation draft. The Branch property is not yet
    automatically bound to Location branch. Reviews still operate on Feature facts and
    position groups. In the accepted Feature history path, Accept and Keep-current now
    synchronize every consumer in the Organisation. Automatic community acceptance by
    any Project also synchronizes its Organisation. Accept releases affected
    customizations; Keep-current stores the retained values explicitly. Sparse local
    layers and publication, the brand/group catalogue, skip controls, and the central
    template registry remain to be integrated. Ordinary Feature Location name/address
    saves still need default community contribution routing; dedicated community
    commands are available. These target behaviors should not yet be relied on in
    production.
  </p>
</section>
