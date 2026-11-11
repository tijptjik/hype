<script lang="ts">
// COMPONENTS
import LocationMatchingDocs from './LocationMatchingDocs.svelte'
import MermaidDiagram from '#lib/bits/custom/mermaidDiagram/MermaidDiagram.svelte'
// DOCS
import {
  addressComposition,
  divisionTaxonomy,
  locationRelationships,
  locationTaxonomy,
} from '#lib/docs/locationModel.js'
let viewportHeight = $state(0)
</script>

<div
  class="min-h-0 min-w-0 flex-1 overflow-y-auto"
  data-docs-scroll
  bind:clientHeight={viewportHeight}
  style:--docs-viewport-height={viewportHeight ? `${viewportHeight}px` : undefined}
>
  <article
    class="text-base-content flex w-full min-w-0 flex-col gap-8 p-4 sm:p-6 lg:p-8"
  >
    <header>
      <p class="text-muted-foreground mb-2 text-sm">Hype docs</p>
      <h1 class="text-3xl font-semibold">The Location model</h1>
      <p class="mt-3 max-w-3xl">
        A Location represents a continuing real-world entity. Its kind describes what it
        is; relationships describe how it connects to other entities. Names, addresses
        and occupants can change without replacing every related identity.
      </p>
      <nav
        aria-label="On this page"
        class="text-primary mt-4 flex flex-wrap gap-x-6 gap-y-2"
      >
        <a class="underline underline-offset-4" href="#taxonomy">Taxonomy</a>
        <a class="underline underline-offset-4" href="#relationships">Relationships</a>
        <a class="underline underline-offset-4" href="#divisions">Divisions</a>
        <a class="underline underline-offset-4" href="#address">Address composition</a>
        <a class="underline underline-offset-4" href="#history">Identity over time</a>
        <a class="underline underline-offset-4" href="#location-matching"
          >Location Matching</a
        >
      </nav>
    </header>

    <section id="taxonomy" class="scroll-mt-6">
      <p class="text-primary mb-2 text-sm font-semibold">Location taxonomy</p>
      <h2 class="text-xl font-semibold">1. Taxonomy: what is this Location?</h2>
      <p class="my-4 max-w-3xl">
        The top-level branch is <code>kind</code>, and its subdivision is
        <code>class</code>. The migration separates stored identity kind and class while
        retaining historical snapshots. The diagram includes service points and address
        classes. A null address class remains the unclassified fallback.
      </p>
      <MermaidDiagram
        source={locationTaxonomy}
        naturalSize
        label="Location kind and class: built, geographic, operational and address"
      />
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-border border-b">
              <th class="p-3">kind</th>
              <th class="p-3">Example class values</th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-border border-b">
              <td class="p-3"><code>built</code></td>
              <td class="p-3 break-words whitespace-normal">
                <code>building_part</code>, <code>structure</code>,
                <code>building</code>, <code>premises</code>, <code>thoroughfare</code>
              </td>
            </tr>
            <tr class="border-border border-b">
              <td class="p-3"><code>geographic</code></td>
              <td class="p-3 break-words whitespace-normal">
                <code>landform</code>, <code>coastal_feature</code>,
                <code>water_feature</code>
              </td>
            </tr>
            <tr class="border-border border-b">
              <td class="p-3"><code>operational</code></td>
              <td class="p-3">
                <code>establishment</code>, <code>service_point</code>
              </td>
            </tr>
            <tr>
              <td class="p-3"><code>address</code></td>
              <td class="p-3 break-words whitespace-normal">No Location classes</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3 class="mt-6 text-lg font-semibold">Built · <code>built</code></h3>
      <p class="my-4 max-w-3xl">
        Physical places and constructed objects, ordered roughly from smaller elements
        to broader places. Size varies; this order does not assert containment. Their
        identity can remain stable when their use, operator or occupant changes.
      </p>
      <dl class="my-4 grid gap-6 md:grid-cols-3">
        <div>
          <dt class="font-semibold"><code>building_part</code></dt>
          <dd class="mt-2">
            <p>
              An identifiable space or part within a building, independent of whoever
              occupies it.
            </p>
            <p class="text-muted-foreground mt-2 text-sm">
              Examples: wing, floor, shop unit, flat, room.
            </p>
          </dd>
        </div>
        <div>
          <dt class="font-semibold"><code>structure</code></dt>
          <dd class="mt-2">
            <p>A constructed physical object that is not treated as a building.</p>
            <p class="text-muted-foreground mt-2 text-sm">
              Examples: bridge, tunnel, pier, retaining wall, freestanding monument.
            </p>
          </dd>
        </div>
        <div>
          <dt class="font-semibold"><code>building</code></dt>
          <dd class="mt-2">
            <p>
              An individual building, distinct from its occupants and from a wider site.
            </p>
            <p class="text-muted-foreground mt-2 text-sm">
              Examples: residential tower, village house, office block, warehouse,
              school building.
            </p>
          </dd>
        </div>
        <div>
          <dt class="font-semibold"><code>premises</code></dt>
          <dd class="mt-2">
            <p>
              A site or complex understood as one place, potentially containing several
              buildings or outdoor spaces.
            </p>
            <p class="text-muted-foreground mt-2 text-sm">
              Examples: housing estate, university campus, hospital campus, industrial
              estate, shopping complex.
            </p>
          </dd>
        </div>
        <div>
          <dt class="font-semibold"><code>thoroughfare</code></dt>
          <dd class="mt-2">
            <p>
              A named or otherwise identifiable route or passage for movement, distinct
              from an address along it.
            </p>
            <p class="text-muted-foreground mt-2 text-sm">
              Examples: road, lane, alley, footpath, pedestrian passage.
            </p>
          </dd>
        </div>
      </dl>
      <h3 class="mt-6 text-lg font-semibold">Geographic · <code>geographic</code></h3>
      <p class="my-4 max-w-3xl">
        Physical geographic features. Their extent and identity are separate from the
        administrative or locality divisions used to describe an area.
      </p>
      <dl class="my-4 grid gap-6 md:grid-cols-3">
        <div>
          <dt class="font-semibold"><code>landform</code></dt>
          <dd class="mt-2">
            <p>
              A feature of the land itself, rather than a built object or an
              administrative boundary.
            </p>
            <p class="text-muted-foreground mt-2 text-sm">
              Examples: hill, mountain, ridge, valley, island.
            </p>
          </dd>
        </div>
        <div>
          <dt class="font-semibold"><code>coastal_feature</code></dt>
          <dd class="mt-2">
            <p>A feature defined by its relationship to the coast.</p>
            <p class="text-muted-foreground mt-2 text-sm">
              Examples: beach, bay, headland, cape, coastal inlet.
            </p>
          </dd>
        </div>
        <div>
          <dt class="font-semibold"><code>water_feature</code></dt>
          <dd class="mt-2">
            <p>An identifiable body or course of water.</p>
            <p class="text-muted-foreground mt-2 text-sm">
              Examples: river, stream, lake, pond, reservoir.
            </p>
          </dd>
        </div>
      </dl>
      <h3 class="mt-6 text-lg font-semibold">Operational · <code>operational</code></h3>
      <p class="my-4 max-w-3xl">
        A continuing activity or service presence at a place. Its identity is separate
        from the physical space or equipment that supports it.
      </p>
      <dl class="my-4 grid gap-6 md:grid-cols-3">
        <div>
          <dt class="font-semibold"><code>establishment</code></dt>
          <dd class="mt-2">
            <p>
              An identifiable business, institution or venue operating at a location. A
              branch is distinct from its brand and its host building.
            </p>
            <p class="text-muted-foreground mt-2 text-sm">
              Examples: bakery, restaurant, clinic, library, bank branch.
            </p>
          </dd>
        </div>
      </dl>
      <h3 class="mt-6 text-lg font-semibold">Service points</h3>
      <p class="my-4 max-w-3xl">
        A <code>service_point</code> is a continuing service presence without a distinct
        establishment, such as a recycling point or collection point. It identifies the
        service at that location; the bin, kiosk or building can have a separate
        physical identity where useful.
      </p>
      <p class="text-muted-foreground mb-4 max-w-3xl text-sm">
        Examples: recycling point, collection point, public drinking-water point,
        battery collection point, clothing donation point.
      </p>
      <h3 class="mt-6 text-lg font-semibold">Address · <code>address</code></h3>
      <p class="my-4 max-w-3xl">
        An address Location identifies an address independently of a known building,
        premises or establishment. It has kind <code>address</code> and no class.
        Structured address components belong to Address revisions, linked through
        <code>locationAddress</code>.
      </p>
      <p class="text-muted-foreground mb-4 max-w-3xl text-sm">
        Examples: 12 Example Road; House 8, Example Village; Example Tower; DD 123 Lot
        456; a measured position on a named route.
      </p>
    </section>

    <section id="relationships" class="scroll-mt-6">
      <h2 class="text-xl font-semibold">2. Relationships: how do Locations connect?</h2>
      <p class="my-4 max-w-3xl">
        These arrows illustrate relationships between individual records. They do not
        define subclasses, require every connection, or imply that a Location has
        exactly one address or parent.
      </p>
      <MermaidDiagram
        source={locationRelationships}
        label="Membership, occupancy and address relationships"
      />
      <dl class="mt-6 grid gap-6 md:grid-cols-3">
        <div>
          <dt class="font-semibold">Membership · part of</dt>
          <dd class="mt-2">
            Connects a child Location to a parent: a room within a floor, a floor within
            a building, or a building within a complex.
          </dd>
        </div>
        <div>
          <dt class="font-semibold">Occupancy · occupies</dt>
          <dd class="mt-2">
            Connects an establishment to the physical space it occupies. A tenancy can
            reference a container, an address revision, or both; unresolved containers
            stay unknown.
          </dd>
        </div>
        <div>
          <dt class="font-semibold">Address · addressed by</dt>
          <dd class="mt-2">
            Connects a Location to a specific address revision. Multiple addresses are
            possible. Matching address text does not prove containment or occupancy.
          </dd>
        </div>
      </dl>
      <p class="text-muted-foreground mt-5 max-w-3xl text-sm">
        Each relationship retains evidence, effective dates and revision history.
        Current, former and unconfirmed describe the relationship, independently of
        whether an establishment is operating or a building still exists.
      </p>
    </section>

    <section id="divisions" class="scroll-mt-6">
      <h2 class="text-xl font-semibold">3. Divisions: geographic context</h2>
      <p class="my-4 max-w-3xl">
        Divisions describe geographic areas and are mirrored from SaanSeoi separately
        from Locations. Each has a stable ID, names, a class, a category and a level
        where applicable. The diagram shows classification, not a containment tree: a
        level does not prove that one division belongs to another.
      </p>
      <MermaidDiagram
        source={divisionTaxonomy}
        label="Division categories, classes and levels"
      />
      <dl class="mt-6 grid gap-6 md:grid-cols-3">
        <div>
          <dt class="font-semibold">Three address groups</dt>
          <dd class="mt-2">
            Address display groups divisions into administrative, locality and landform
            paths. Locality includes both locality and hood categories. City remains a
            source class but is excluded from Hype's address display and locality
            selection.
          </dd>
        </div>
        <div>
          <dt class="font-semibold">Source-backed ancestry</dt>
          <dd class="mt-2">
            Paths follow source hierarchy evidence, not matching names or consecutive
            levels. Fully contained ancestry forms display paths; boundary alternatives
            stay separate. Landforms do not have a numeric hierarchy level.
          </dd>
        </div>
        <div>
          <dt class="font-semibold">Marker and local interpretation</dt>
          <dd class="mt-2">
            Factual administrative and landform memberships follow the marker. An author
            can select one approved locality path across town, rural area or hood,
            village or neighbourhood, and hamlet or microhood levels. Missing levels are
            allowed; the path must exist in the source hierarchy.
          </dd>
        </div>
      </dl>
    </section>

    <section id="address" class="scroll-mt-6">
      <h2 class="text-xl font-semibold">4. Address composition</h2>
      <p class="my-4 max-w-3xl">
        An Address identity retains immutable revisions. Its content combines localized
        address components, optional floor/unit details and geographic references.
        Locally authored drafts use the same shared content contract without claiming a
        published identity or creating a canonical unit inventory record.
      </p>
      <MermaidDiagram
        source={addressComposition}
        label="Address identity, revisions and content composition"
      />
      <p class="my-4 max-w-3xl">
        Premises, cadastral and linear reference are Address content variants, not
        Location classes. The variant belongs to the versioned Address content in
        <code>addressRevision</code>, not to <code>locationAddress</code>. The current
        content contract supports premises components; cadastral and linear reference
        contracts remain to be implemented.
      </p>
      <p class="my-4 max-w-3xl">
        One farm estate is a built Location of class <code>premises</code>. It can link
        to premises, cadastral and linear addresses through separate
        <code>locationAddress</code>
        records. Each link carries priority, status, dates and evidence. A building and
        an address Location can share the same Address identity without duplicating its
        components. The farm business may separately be an operational establishment.
      </p>
      <dl class="my-4 grid gap-4 md:grid-cols-3">
        <div>
          <dt class="font-semibold">Premises</dt>
          <dd class="mt-2">
            Identifies premises through a street and number, village and house number,
            or building name. Floors, units and rooms refine its scope; no street name
            is required.
            <p class="text-muted-foreground mt-2 text-sm">
              Examples: 12 Example Road; House 8, Example Village; Example Tower; Flat
              A, 3/F, Example Tower; Shop 2, G/F, 12 Example Road.
            </p>
          </dd>
        </div>
        <div>
          <dt class="font-semibold">Cadastral</dt>
          <dd class="mt-2">
            Identifies land through a cadastral reference, such as Inland Lot No. 1234
            or DD 123 Lot 456, including sections or subsections where applicable. The
            reference is distinct from the land parcel itself.
            <p class="text-muted-foreground mt-2 text-sm">
              Examples: Inland Lot No. 1234; DD 123 Lot 456; Section A of DD 123 Lot
              456.
            </p>
          </dd>
        </div>
        <div>
          <dt class="font-semibold">Linear reference</dt>
          <dd class="mt-2">
            Identifies a position along a named road, railway or other route using a
            measured offset. Interpretation requires the route, measurement origin,
            units and direction, with a side or lateral offset where needed.
            <p class="text-muted-foreground mt-2 text-sm">
              Examples: a road chainage reference, a railway kilometre reference, a
              trail distance reference. Each needs its route and measurement origin to
              identify a position.
            </p>
          </dd>
        </div>
      </dl>
      <p class="my-4 max-w-3xl">
        A Location can have multiple address references, such as both a premises address
        and a lot address. Coordinates, grid references and encoded location codes such
        as Plus Codes are positioning methods, not Address content variants. Positioning
        remains separate from addressing and can accompany any Address content variant.
      </p>
      <dl class="mt-6 grid gap-6 md:grid-cols-3">
        <div>
          <dt class="font-semibold">Scope is independent</dt>
          <dd class="mt-2">
            Scope identifies the address's specificity: unknown, premises, phase,
            building, section, floor, unit or unit portion. It is separate from Location
            kind and from which components happen to be present.
          </dd>
        </div>
        <div>
          <dt class="font-semibold">Seven display blocks</dt>
          <dd class="mt-2">
            Hype presents unit, building, premises, street, administrative, locality and
            landform blocks. The premises block includes block and phase expressions;
            the street block combines the building number and street name. Formatting
            and component order follow the selected language.
          </dd>
        </div>
        <div>
          <dt class="font-semibold">Components are not entities</dt>
          <dd class="mt-2">
            A floor or unit expression does not automatically create a building part. A
            premises name does not establish membership, and an address does not prove
            occupancy. Those connections use the explicit Location relationships above.
          </dd>
        </div>
      </dl>
      <p class="text-muted-foreground mt-5 max-w-3xl text-sm">
        Unit translations require unit content. Geographic references may be absent; a
        written street or locality name is not proof of a canonical ID. Authored
        locality choices are validated against source paths, while factual geography
        remains marker-derived.
      </p>
    </section>

    <section id="history" class="scroll-mt-6">
      <h2 class="text-xl font-semibold">5. Identity over time</h2>
      <p class="mt-4 max-w-3xl">
        When a bakery moves, its establishment identity can continue. Its former shop
        space remains a building part, available for another occupant. We retain the
        former occupancy and record the new one instead of turning the old space into
        the new business.
      </p>
      <p class="mt-3 max-w-3xl">
        Replacement, merge, split and reconfiguration transitions record changes between
        identities. They distinguish real-world changes from corrections to our records.
        A successor tenant is not a duplicate of its predecessor.
      </p>
    </section>
    <LocationMatchingDocs />
  </article>
</div>
