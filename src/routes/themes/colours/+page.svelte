<script lang="ts">
// COMPONENTS
import { Button } from '$lib/bits/core'
import ArrowUpRight from 'virtual:icons/proicons/arrow-export'
import Check from 'virtual:icons/proicons/checkmark'
import Clock from 'virtual:icons/proicons/clock'
import MapPin from 'virtual:icons/proicons/location'

type ColourSwatch = {
  name: string
  value: string
  use: string
}

const originalColours: ColourSwatch[] = [
  { name: 'Blueberry blue', value: '#0A3F60', use: 'Primary identity' },
  { name: 'Frosting blue', value: '#7EBCBD', use: 'Soft surfaces' },
  { name: 'Peachy orange', value: '#FF714D', use: 'Warm action' },
]

const newColours: ColourSwatch[] = [
  { name: 'Blueberry blue', value: '#0B4F72', use: 'Primary text and actions' },
  { name: 'Frosting teal', value: '#2F7F86', use: 'Secondary surfaces and detail' },
  { name: 'Peachy coral', value: '#C94C35', use: 'Tertiary action and emphasis' },
]

const oldPrimary = originalColours[0].value
const oldSecondary = originalColours[2].value
const oldTertiary = originalColours[1].value
</script>

<svelte:head>
  <title>Milque colours · Hype</title>
  <meta
    name="description"
    content="Compare the original Breadline palette with the revised Milque application palette."
  >
</svelte:head>

<main data-theme="breadline-light" class="min-h-screen bg-canvas text-base-content">
  <div class="mx-auto max-w-[1440px] px-5 py-6 sm:px-10 lg:px-14">
    <header
      class="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6"
    >
      <a
        href="/themes"
        class="flex items-center gap-3 text-sm font-semibold tracking-[0.16em]"
      >
        <span
          class="grid size-9 place-items-center rounded-xl bg-primary text-primary-content"
          >H</span
        >
        HYPE <span class="font-normal text-muted-foreground">/ MILQUE COLOURS</span>
      </a>
      <a
        href="/themes"
        class="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
      >
        Theme studio <ArrowUpRight class="size-4" />
      </a>
    </header>

    <section class="grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
      <div>
        <p
          class="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-secondary"
        >
          Breadline · Milque
        </p>
        <h1
          class="max-w-3xl text-4xl font-medium leading-[1.08] tracking-[-0.045em] sm:text-6xl"
        >
          From a colour sheet<br>
          <span class="text-muted-foreground">to a place to return to.</span>
        </h1>
        <p class="mt-6 max-w-2xl text-sm leading-7 text-muted-foreground">
          The original palette had a lovely bakery vocabulary. Milque gives each colour
          a clearer job, stronger contrast, and enough restraint for maps, panels,
          menus, and forms to share one voice.
        </p>
      </div>
      <div class="rounded-3xl border border-border bg-panel p-5">
        <p
          class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          Current direction
        </p>
        <div class="mt-4 flex items-center gap-3">
          <span class="size-3 rounded-full bg-primary"></span>
          <span class="font-medium">Blueberry-led Milque</span>
        </div>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          Navy carries structure, toasted coral calls for attention, and frosting teal
          keeps the interface light.
        </p>
      </div>
    </section>

    <section aria-labelledby="palette-heading">
      <div class="mb-4 flex items-end justify-between gap-4">
        <div>
          <p
            class="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
          >
            01 / Palette evolution
          </p>
          <h2 id="palette-heading" class="mt-2 text-2xl font-medium tracking-tight">
            The same ingredients, better roles.
          </h2>
        </div>
        <span class="hidden text-xs text-muted-foreground sm:block"
          >Original → Milque</span
        >
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-3xl border border-border bg-panel p-5 sm:p-6">
          <div class="mb-5 flex items-center justify-between">
            <h3 class="font-medium">Original Breadline</h3>
            <span
              class="rounded-full bg-surface px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground"
              >Reference</span
            >
          </div>
          <div class="space-y-2">
            {#each originalColours as colour}
              <div
                class="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 rounded-xl border border-border p-2"
              >
                <div class="flex min-w-0 items-center gap-3">
                  <span
                    class="size-11 shrink-0 rounded-lg border border-black/10"
                    style={`background:${colour.value}`}
                  ></span>
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium">{colour.name}</p>
                    <p class="text-xs text-muted-foreground">{colour.use}</p>
                  </div>
                </div>
                <code class="text-right text-xs text-muted-foreground"
                  >{colour.value}</code
                >
              </div>
            {/each}
          </div>
        </div>

        <div
          class="rounded-3xl border border-primary/35 bg-panel p-5 shadow-lg shadow-primary/5 sm:p-6"
        >
          <div class="mb-5 flex items-center justify-between">
            <h3 class="font-medium">Milque application</h3>
            <span
              class="rounded-full bg-primary px-3 py-1 text-[10px] uppercase tracking-wider text-primary-content"
              >Revised</span
            >
          </div>
          <div class="space-y-2">
            {#each newColours as colour}
              <div
                class="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 rounded-xl border border-border p-2"
              >
                <div class="flex min-w-0 items-center gap-3">
                  <span
                    class="size-11 shrink-0 rounded-lg border border-black/10"
                    style={`background:${colour.value}`}
                  ></span>
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium">{colour.name}</p>
                    <p class="text-xs text-muted-foreground">{colour.use}</p>
                  </div>
                </div>
                <code class="text-right text-xs text-muted-foreground"
                  >{colour.value}</code
                >
              </div>
            {/each}
          </div>
        </div>
      </div>
    </section>

    <section class="mt-10" aria-labelledby="components-heading">
      <div class="mb-4">
        <p
          class="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          02 / Component comparison
        </p>
        <h2 id="components-heading" class="mt-2 text-2xl font-medium tracking-tight">
          Branding in context.
        </h2>
      </div>

      <div class="grid gap-4 xl:grid-cols-3">
        <article class="overflow-hidden rounded-3xl border border-border bg-panel">
          <div class="border-b border-border px-5 py-4">
            <h3 class="font-medium">Action hierarchy</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              Warmth becomes a deliberate signal.
            </p>
          </div>
          <div class="grid gap-5 p-5">
            <div>
              <p
                class="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                Original
              </p>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded-xl px-4 py-2 text-xs font-medium text-white"
                  style={`background:${oldPrimary}`}
                >
                  Open map
                </button>
                <button
                  type="button"
                  class="rounded-xl px-4 py-2 text-xs font-medium text-white"
                  style={`background:${oldSecondary}`}
                >
                  Save place
                </button>
              </div>
            </div>
            <div class="border-t border-border pt-5">
              <p
                class="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                Milque
              </p>
              <div class="flex flex-wrap gap-2">
                <Button
                  text="Open map"
                  color="primary"
                  size="sm"
                  iconComponent={ArrowUpRight}
                />
                <Button
                  text="Save place"
                  color="accent"
                  size="sm"
                  iconComponent={Check}
                />
              </div>
            </div>
          </div>
        </article>

        <article class="overflow-hidden rounded-3xl border border-border bg-panel">
          <div class="border-b border-border px-5 py-4">
            <h3 class="font-medium">A place card</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              Frosting teal now carries quiet surfaces.
            </p>
          </div>
          <div class="p-5">
            <div
              class="overflow-hidden rounded-2xl border border-black/10"
              style={`background:${oldTertiary}`}
            >
              <div class="p-4 text-sm font-medium text-[#0A3F60]">
                Original route stop
              </div>
              <div class="bg-white/70 px-4 py-3 text-xs text-[#0A3F60]">
                7-Eleven · Tsim Sha Tsui
              </div>
            </div>
            <div class="my-4 flex justify-center text-muted-foreground">↓</div>
            <div
              class="overflow-hidden rounded-2xl border border-border bg-secondary text-secondary-content"
            >
              <div class="p-4 text-sm font-medium">Milque route stop</div>
              <div class="bg-panel/80 px-4 py-3 text-xs text-base-content">
                7-Eleven · Tsim Sha Tsui
              </div>
            </div>
          </div>
        </article>

        <article class="overflow-hidden rounded-3xl border border-border bg-panel">
          <div class="border-b border-border px-5 py-4">
            <h3 class="font-medium">Application chrome</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              The palette survives dense navigation.
            </p>
          </div>
          <div class="p-5">
            <div class="rounded-2xl border border-border bg-surface p-4">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2 text-sm font-medium">
                  <span class="size-2 rounded-full bg-secondary"></span>
                  Evening collection
                </div>
                <span
                  class="rounded-full bg-tertiary px-2.5 py-1 text-[10px] font-medium text-tertiary-content"
                  >Open</span
                >
              </div>
              <div class="mt-5 flex items-center gap-3 text-xs text-muted-foreground">
                <Clock class="size-4 text-primary" />
                Tonight, 19:00 <span>·</span>
                <MapPin class="size-4 text-primary" />
                Central
              </div>
              <div class="mt-4 h-2 overflow-hidden rounded-full bg-panel">
                <div class="h-full w-2/3 rounded-full bg-secondary"></div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <footer class="mt-10 border-t border-border pt-5 text-xs text-muted-foreground">
      Milque keeps the original blueberry, frosting, and bakery warmth while assigning
      each token a readable application role.
    </footer>
  </div>
</main>
