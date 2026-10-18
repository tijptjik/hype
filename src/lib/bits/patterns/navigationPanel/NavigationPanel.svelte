<script lang="ts">
// BITS COMPONENTS
import { PanelRoot as Panel } from '#lib/bits/index.js'
import Button from '#lib/bits/core/button/Button.svelte'
// COMPONENTS
import Header from '#lib/bits/patterns/panels/components/common/Header.svelte'
// ROUTING
import { ROUTING_MODES } from '#lib/routing/routing.types.js'
import { developmentOrigin } from '#lib/routing/developmentOrigin.js'
// TYPES
import type { NavigationRouting } from '#lib/client/services/navigationRouting.svelte.js'
import type { usePanelShellModel } from '#lib/adapters/panels/usePanelShellModel.svelte.js'

let {
  shell,
  model,
}: { shell: ReturnType<typeof usePanelShellModel>; model: NavigationRouting } = $props()
const panelProps = $derived(shell.panel)
const journey = $derived(model.state.phase === 'ready' ? model.state.journey : null)

/**
 * Formats duration without implying live arrival-time accuracy.
 * @param seconds - Estimated travel time.
 * @returns A compact, rounded duration.
 */
function duration(seconds: number): string {
  if (seconds < 60) return '<1 min'
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
}

/**
 * Formats graph distances for a compact journey summary.
 * @param metres - Graph distance.
 * @returns A distance in metres or kilometres.
 */
function distance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`
}
</script>

<Panel isOpen={shell.open} preserveContentWidth {...panelProps}>
  <Header {...panelProps} title="Navigation" onClose={() => model.close()} />
  <div class="flex flex-col gap-6 px-6 py-6 pb-24" data-navigation-panel>
    <section aria-label="Transport mode" class="flex flex-col gap-3">
      <div class="grid grid-cols-4 gap-1 rounded-xl bg-base-content/5 p-1">
        {#each ROUTING_MODES as mode}
          <button
            type="button"
            aria-pressed={model.mode === mode.id}
            class="rounded-lg px-1 py-3 text-xs font-medium transition-colors hover:bg-base-content/10 focus-visible:outline-2 focus-visible:outline-primary"
            class:bg-primary={model.mode === mode.id}
            class:text-primary-content={model.mode === mode.id}
            onclick={() => void model.selectMode(mode.id)}
          >
            {mode.label}
          </button>
        {/each}
      </div>
      <p class="text-xs text-base-content/60">
        Bus, MTR and ferry planning coming later.
      </p>
    </section>

    <section
      aria-label="Journey endpoints"
      class="flex flex-col gap-3 border-b border-border pb-5"
    >
      <div class="flex items-center gap-3 text-sm">
        <span
          class="h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
          aria-hidden="true"
        ></span>{developmentOrigin?.label ?? 'Your current location'}
      </div>
      <div class="flex items-start gap-3">
        <span
          class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-primary"
          aria-hidden="true"
        ></span>
        <h3 class="text-base font-medium">
          {model.destination?.title ?? 'Choose a marker and select GET THERE'}
        </h3>
      </div>
    </section>

    {#if model.state.phase === 'locating' ||
      model.state.phase === 'loading' ||
      model.state.phase === 'error'}
      <div aria-live="polite" aria-atomic="true">
        {#if model.state.phase === 'locating' || model.state.phase === 'loading'}
          <div role="status" class="flex items-center gap-3 text-sm">
            <span
              class="loading loading-spinner loading-sm text-primary"
              aria-hidden="true"
            ></span>
            {model.state.phase === 'locating'
              ? 'Finding your current location…'
              : 'Calculating your journey…'}
          </div>
        {:else if model.state.phase === 'error'}
          <div
            role="alert"
            class="flex flex-col gap-4 rounded-xl border border-border bg-base-content/5 p-4"
          >
            <p class="text-sm">{model.state.message}</p>
            <Button text="Try again" onClick={() => void model.retry()} />
          </div>
        {/if}
      </div>
    {/if}

    {#if journey}
      <Button text="View map" onClick={() => model.showMap()} />
      <section
        aria-label="Journey estimate"
        class="grid grid-cols-2 gap-4 rounded-xl border border-border p-4"
      >
        <div>
          <p class="text-xs text-base-content/60">Estimated time</p>
          <p class="mt-1 text-xl font-semibold">{duration(journey.seconds)}</p>
          <p class="mt-1 text-xs text-base-content/60">{distance(journey.metres)}</p>
        </div>
        <div>
          <p class="text-xs text-base-content/60">Estimated cost</p>
          <p class="mt-1 text-lg font-semibold">
            {journey.cost.amount === null ? 'Unavailable' : `HK$${journey.cost.amount}`}
          </p>
          <p class="mt-1 text-xs text-base-content/60">
            {journey.cost.amount === 0
              ? 'No transport fare'
              : journey.hasFerry
                ? 'Ferry fare not estimated'
                : 'Fuel and tolls not estimated'}
          </p>
        </div>
      </section>
      {#if journey.hasFerry}
        <p class="rounded-xl border border-border p-4 text-sm">
          This route includes a ferry connection. Departure times, waiting time and
          fares are not included. Check the service before travelling.
        </p>
      {/if}
      <section aria-label="Journey segments">
        <h3
          class="mb-4 text-xs font-medium uppercase tracking-widest text-base-content/60"
        >
          Journey segments
        </h3>
        <ol class="flex flex-col">
          {#each journey.segments as segment, index}
            <li class="border-b border-border last:border-0">
              <button
                type="button"
                aria-label={`Highlight step ${index + 1}: ${segment.instruction}`}
                class={[
                  'flex w-full gap-3 rounded-lg px-2 py-4 text-left transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary',
                  model.highlightedSegment === index && 'bg-primary/10',
                ]}
                onmouseenter={() => model.highlightSegment(index, 'pointer')}
                onmouseleave={() => model.highlightSegment(null, 'pointer')}
                onfocus={() => model.highlightSegment(index, 'focus')}
                onblur={() => model.highlightSegment(null, 'focus')}
              >
                <span
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-base-content/5 text-xs font-medium"
                  >{index + 1}</span
                >
                <span class="min-w-0">
                  <span class="text-sm leading-relaxed">{segment.instruction}</span>
                  {#if segment.metres > 0 || segment.seconds > 0}
                    <span class="mt-1 block text-xs text-base-content/60">
                      {distance(segment.metres)}
                      · {duration(segment.seconds)}
                    </span>
                  {/if}
                </span>
              </button>
            </li>
          {/each}
        </ol>
      </section>
      <p class="text-xs leading-relaxed text-base-content/50">
        Estimates from OpenStreetMap. No live traffic or elevation data. Always follow
        signs and local access rules.
      </p>
    {/if}
  </div>
</Panel>
