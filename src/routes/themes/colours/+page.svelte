<script lang="ts">
// COMPONENTS
import ArrowUpRight from 'virtual:icons/proicons/arrow-export'
import Check from 'virtual:icons/proicons/checkmark'
import Clock from 'virtual:icons/proicons/clock'
import MapPin from 'virtual:icons/proicons/location'

type ColourSwatch = {
  name: string
  value: string
  use: string
}

type ColourVariant = {
  name: string
  eyebrow: string
  intent: string
  primary: string
  secondary: string
  tertiary: string
  primaryContent: string
  secondaryContent: string
  tertiaryContent: string
  isCurrent?: boolean
}

const originalColours: ColourSwatch[] = [
  { name: 'Blueberry blue', value: '#0A3F60', use: 'Primary identity' },
  { name: 'Frosting blue', value: '#7EBCBD', use: 'Soft surfaces' },
  { name: 'Peachy orange', value: '#FF714D', use: 'Warm action' },
]

const newColours: ColourSwatch[] = [
  { name: 'Peach-forward blue', value: '#155E75', use: 'Primary text and actions' },
  { name: 'Peach-forward teal', value: '#267A7A', use: 'Secondary detail and support' },
  {
    name: 'Peach-forward coral',
    value: '#C0543D',
    use: 'Tertiary action and emphasis',
  },
]

const colourVariants: ColourVariant[] = [
  {
    name: 'Peach-forward',
    eyebrow: 'Current Milque',
    intent:
      'A warmer Milque direction with coral leading the moments that need attention.',
    primary: '#155E75',
    secondary: '#267A7A',
    tertiary: '#C0543D',
    primaryContent: '#FFFFFF',
    secondaryContent: '#FFFFFF',
    tertiaryContent: '#FFFFFF',
    isCurrent: true,
  },
  {
    name: 'Sea-glass bright',
    eyebrow: 'Experiment A',
    intent: 'Teal stays in charge while coral becomes the visible moment of action.',
    primary: '#1A7476',
    secondary: '#B95A45',
    tertiary: '#467A9B',
    primaryContent: '#FFFFFF',
    secondaryContent: '#FFFFFF',
    tertiaryContent: '#FFFFFF',
  },
  {
    name: 'Rye editorial',
    eyebrow: 'Experiment B',
    intent: 'A deeper teal and quieter coral for a more measured, editorial interface.',
    primary: '#2D565A',
    secondary: '#9C4E41',
    tertiary: '#5B6D91',
    primaryContent: '#FFFFFF',
    secondaryContent: '#FFFFFF',
    tertiaryContent: '#FFFFFF',
  },
  {
    name: 'Rye sun-warmed',
    eyebrow: 'Experiment C',
    intent:
      'A brighter sky blue and warm coral bring more daylight to the same Rye structure.',
    primary: '#306B68',
    secondary: '#B9614B',
    tertiary: '#486B85',
    primaryContent: '#FFFFFF',
    secondaryContent: '#FFFFFF',
    tertiaryContent: '#FFFFFF',
  },
]

const oldPrimary = originalColours[0].value
const oldSecondary = originalColours[2].value
const oldTertiary = originalColours[1].value
</script>

<svelte:head>
  <title>Milque colours · Hype</title>
  <meta
    name="description"
    content="Experiment with modern blueberry, frosting, and peach colour directions for Milque."
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
          Three ingredients.<br>
          <span class="text-muted-foreground">More ways to make them sing.</span>
        </h1>
        <p class="mt-6 max-w-2xl text-sm leading-7 text-muted-foreground">
          This is an open colour study for the Milque application. Every direction keeps
          the original blueberry, frosting, and peach vocabulary, then shifts hue and
          saturation to see which one feels most alive on the real interface surfaces.
        </p>
      </div>
      <div class="rounded-3xl border border-border bg-panel p-5">
        <p
          class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          How to read this
        </p>
        <p class="mt-4 text-sm leading-6">
          The page itself uses the live Milque background tokens. Inside each study,
          compare <span class="font-medium text-primary">canvas</span>,
          <span class="font-medium text-primary">panel</span>,
          <span class="font-medium text-primary">surface</span>, and
          <span class="font-medium text-primary">raised</span>
          from outside in.
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
            The source and the current translation.
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

    <section class="mt-12" aria-labelledby="experiments-heading">
      <div class="mb-5 max-w-2xl">
        <p
          class="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          02 / Experimental directions
        </p>
        <h2 id="experiments-heading" class="mt-2 text-2xl font-medium tracking-tight">
          Same palette family, different energy.
        </h2>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">
          Each specimen keeps the application background hierarchy intact. The coloured
          controls are deliberately shown in the raised layer, where primary, secondary,
          and tertiary roles have to earn their place.
        </p>
      </div>

      <div class="grid gap-5 xl:grid-cols-2">
        {#each colourVariants as variant}
          <article
            data-variant={variant.name}
            class={`overflow-hidden rounded-3xl border bg-panel ${
              variant.isCurrent ? 'border-primary/40 shadow-lg shadow-primary/5' : 'border-border'
            }`}
          >
            <div
              class="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-6"
            >
              <div>
                <p
                  class="text-[10px] font-semibold uppercase tracking-[0.18em] text-secondary"
                >
                  {variant.eyebrow}
                </p>
                <h3 class="mt-1 text-xl font-medium tracking-tight">{variant.name}</h3>
                <p class="mt-2 max-w-md text-xs leading-5 text-muted-foreground">
                  {variant.intent}
                </p>
              </div>
              {#if variant.isCurrent}
                <span
                  class="rounded-full bg-primary px-3 py-1 text-[10px] uppercase tracking-wider text-primary-content"
                >
                  In use
                </span>
              {/if}
            </div>

            <div class="grid gap-4 p-5 sm:p-6">
              <div class="grid grid-cols-3 gap-2">
                <div>
                  <div
                    class="h-16 rounded-xl border border-black/10"
                    style={`background:${variant.primary}`}
                  ></div>
                  <p class="mt-2 text-[10px] font-medium uppercase tracking-wider">
                    Blueberry
                  </p>
                  <code class="text-[10px] text-muted-foreground"
                    >{variant.primary}</code
                  >
                </div>
                <div>
                  <div
                    class="h-16 rounded-xl border border-black/10"
                    style={`background:${variant.secondary}`}
                  ></div>
                  <p class="mt-2 text-[10px] font-medium uppercase tracking-wider">
                    Frosting
                  </p>
                  <code class="text-[10px] text-muted-foreground"
                    >{variant.secondary}</code
                  >
                </div>
                <div>
                  <div
                    class="h-16 rounded-xl border border-black/10"
                    style={`background:${variant.tertiary}`}
                  ></div>
                  <p class="mt-2 text-[10px] font-medium uppercase tracking-wider">
                    Peach
                  </p>
                  <code class="text-[10px] text-muted-foreground"
                    >{variant.tertiary}</code
                  >
                </div>
              </div>

              <div class="rounded-2xl border border-border bg-canvas p-3">
                <div class="mb-2 flex items-center justify-between px-1">
                  <p
                    class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Canvas
                  </p>
                  <span class="text-[10px] text-muted-foreground">live token</span>
                </div>
                <div class="rounded-xl border border-border bg-panel p-3">
                  <div class="mb-2 flex items-center justify-between">
                    <p
                      class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Panel
                    </p>
                    <span
                      class="size-2 rounded-full"
                      style={`background:${variant.secondary}`}
                    ></span>
                  </div>
                  <div class="rounded-lg border border-border bg-surface p-3">
                    <div class="mb-2 flex items-center justify-between">
                      <p
                        class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        Surface
                      </p>
                      <span class="text-[10px] text-muted-foreground">collection</span>
                    </div>
                    <div class="rounded-lg border border-border bg-raised p-3">
                      <div class="flex flex-wrap items-center justify-between gap-3">
                        <div class="min-w-0">
                          <p class="text-sm font-medium">Evening collection</p>
                          <p class="mt-1 text-xs text-muted-foreground">
                            Raised row · selected state
                          </p>
                        </div>
                        <div class="flex shrink-0 gap-2">
                          <span
                            class="rounded-lg px-3 py-2 text-[10px] font-semibold"
                            style={`background:${variant.primary};color:${variant.primaryContent}`}
                            >Open</span
                          >
                          <span
                            class="rounded-lg px-3 py-2 text-[10px] font-semibold"
                            style={`background:${variant.tertiary};color:${variant.tertiaryContent}`}
                            >Save</span
                          >
                        </div>
                      </div>
                      <div
                        class="mt-4 flex items-center gap-3 text-xs text-muted-foreground"
                      >
                        <Clock class="size-4" style={`color:${variant.primary}`} />
                        Tonight, 19:00 <span>·</span>
                        <MapPin class="size-4" style={`color:${variant.secondary}`} />
                        Central
                      </div>
                      <div class="mt-4 h-1.5 overflow-hidden rounded-full bg-panel">
                        <div
                          class="h-full w-2/3 rounded-full"
                          style={`background:${variant.secondary}`}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        {/each}
      </div>
    </section>

    <section class="mt-12" aria-labelledby="components-heading">
      <div class="mb-4">
        <p
          class="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          03 / Before and after
        </p>
        <h2 id="components-heading" class="mt-2 text-2xl font-medium tracking-tight">
          Branding in action.
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
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium"
                  style="background:var(--color-primary);color:var(--color-primary-content)"
                >
                  Open map <ArrowUpRight class="size-3.5" />
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium"
                  style="background:var(--color-tertiary);color:var(--color-tertiary-content)"
                >
                  Save place <Check class="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </article>

        <article class="overflow-hidden rounded-3xl border border-border bg-panel">
          <div class="border-b border-border px-5 py-4">
            <h3 class="font-medium">A place card</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              Frosting teal carries quiet surfaces.
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
              <div class="bg-panel px-4 py-3 text-xs text-base-content">
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
      The experiments keep the original three colour families. The next step is to
      choose the direction that best supports Milque's maps, panels, and actions.
    </footer>
  </div>
</main>
