<script lang="ts">
// COMPONENTS
import MermaidDiagram from '#lib/bits/custom/mermaidDiagram/MermaidDiagram.svelte'
// DOCS
import {
  locationMatchingExamples,
  locationMatchingStages,
} from '#lib/docs/locationMatching.js'
</script>

<section id="location-matching" class="scroll-mt-6">
  <h2 class="text-xl font-semibold">6. Location Matching</h2>
  <p class="my-4 max-w-3xl">
    Start with what the Feature records, then choose the Location identity it should
    match. A Feature can represent a Location, or be an object located at one. Search
    results can supply either the intended identity or a starting point for creating it.
  </p>
  <p class="my-4 max-w-3xl">
    These are worked examples, not installed Feature type definitions. The effective
    catalogue comes from project settings, otherwise hub defaults, otherwise application
    defaults; a layer can restrict that catalogue. Context choices, allowed Location
    kinds and whether an association is required depend on that configuration. The
    example names below are editorial labels, not configuration IDs to copy verbatim.
  </p>
  <nav
    aria-label="Location Matching examples"
    class="text-primary my-4 flex flex-wrap gap-x-6 gap-y-2"
  >
    <a class="underline underline-offset-4" href="#matching-stages">Shared stages</a>
    {#each locationMatchingExamples as example (example.id)}
      <a class="underline underline-offset-4" href={`#matching-${example.id}`}
        >{example.title}</a
      >
    {/each}
  </nav>
  <div id="matching-stages" class="scroll-mt-6">
    <h3 class="mt-6 mb-4 text-lg font-semibold">Options at each stage</h3>
    <MermaidDiagram
      source={locationMatchingStages}
      label="Location Matching: setup, discovery, review and save"
    />
  </div>
  <dl class="my-6 grid gap-6 md:grid-cols-3">
    <div>
      <dt class="font-semibold">Use an existing Location</dt>
      <dd class="mt-2">
        Confirm the same real-world identity and an allowed kind. Retain its identity;
        similar names, nearby pins and identical addresses alone do not prove a match.
      </dd>
    </div>
    <div>
      <dt class="font-semibold">Create here / use a starting point</dt>
      <dd class="mt-2">
        Copy useful address or position evidence into the intended context. Review
        names, floor and unit details, enclosing building parts and any explicit
        operating relationship. Copying data does not establish identity, membership or
        occupancy.
      </dd>
    </div>
    <div>
      <dt class="font-semibold">No match, ambiguity or failure</dt>
      <dd class="mt-2">
        Refine the search, inspect nearby candidates or enter local details. Keep
        unresolved evidence explicit. An optional association can remain unresolved
        where the flow allows it; a required association must be satisfied before
        saving. A failed lookup is not a confirmed absence.
      </dd>
    </div>
  </dl>
  {#each locationMatchingExamples as example (example.id)}
    <section id={`matching-${example.id}`} class="mt-8 scroll-mt-6">
      <h3 class="text-lg font-semibold">{example.title}</h3>
      <p class="my-4 max-w-3xl">{example.description}</p>
      <MermaidDiagram
        source={example.source}
        label={`${example.title}: Location Matching options`}
      />
      <p class="text-muted-foreground mt-4 max-w-3xl text-sm">{example.note}</p>
    </section>
  {/each}
</section>
