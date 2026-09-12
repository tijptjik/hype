<script lang="ts">
// BITS COMPONENTS
import { Button } from '$lib/bits'
import { ThemePicker } from '$lib/bits/patterns/themePicker'
import { ResourcePanel } from '$lib/bits/patterns/resourcePanel'
// ICONS
import ArrowUpRight from 'virtual:icons/lucide/arrow-up-right'
import Check from 'virtual:icons/lucide/check'
import MapPin from 'virtual:icons/lucide/map-pin'
import Clock from 'virtual:icons/lucide/clock'
import Sun from 'virtual:icons/lucide/sun'
import Moon from 'virtual:icons/lucide/moon'
// THEME
import { THEMES } from '$lib/themes/themes'
// ENUMS
import { Panel } from '$lib/enums'
// TYPES
import type { ThemeId } from '$lib/themes/themes.types'
import type {
  ResourcePanelModel,
  ResourcePanelRow,
} from '$lib/bits/patterns/resourcePanel'

let selected: ThemeId = $state('breadline-light')
let query = $state('')
let enabled = $state(['central', 'wan-chai'])
let notice = $state('All changes here are local to this preview.')
let reserved = $state(false)
let compare = $state(false)
const current = $derived(THEMES.find(theme => theme.id === selected) ?? THEMES[0])
const locations = [
  {
    id: 'central',
    name: 'Central & Sheung Wan',
    breadcrumbs: ['Breadline', 'Evening collections'],
  },
  {
    id: 'wan-chai',
    name: 'Wan Chai',
    breadcrumbs: ['Breadline', 'Evening collections'],
  },
  {
    id: 'kowloon',
    name: 'Kowloon City',
    breadcrumbs: ['Breadline', 'Community kitchens'],
  },
  { id: 'sai-kung', name: 'Sai Kung', breadcrumbs: ['Breadline', 'Weekend routes'] },
]
const rows = $derived(
  locations
    .filter(row => row.name.toLowerCase().includes(query.toLowerCase()))
    .map(
      row =>
        ({
          ...row,
          selected: enabled.includes(row.id),
          active: row.id === 'central',
          enabled: enabled.includes(row.id),
          primaryLabel: `Open ${row.name}`,
          toggleLabel: `Toggle ${row.name}`,
          onPrimary: () => {
            notice = `${row.name} selected`
          },
          onToggle: () => {
            enabled = enabled.includes(row.id)
              ? enabled.filter(id => id !== row.id)
              : [...enabled, row.id]
          },
        }) satisfies ResourcePanelRow,
    ),
)
const panel: ResourcePanelModel = {
  panel: {
    panelType: Panel.admin,
    inline: true,
    isAdmin: true,
    isNarrow: false,
    position: 'left',
    scrollable: false,
  },
  open: true,
  title: 'Your neighbourhood',
  onClose: () => {
    notice = 'This sample panel stays open so you can compare themes.'
  },
  sections: [
    {
      id: 'layer',
      title: 'Collection routes',
      get search() {
        return query
      },
      get rows() {
        return rows
      },
      loading: false,
      error: false,
      viewKey: 'demo',
      defaultOpen: true,
      onSearch: value => {
        query = value
      },
      onReset: () => {
        query = ''
        enabled = []
      },
      onNext: () => {},
      onRetry: () => {},
      onVisible: () => {},
    },
  ],
}
</script>

<svelte:head
  ><title>Theme studio · Hype</title>
  <meta
    name="description"
    content="Compare Nullspace, Nebula, Oblivion, Milque and Rye across real Hype components."
  ></svelte:head
>

<main
  data-theme={selected}
  class="bits-theme min-h-screen bg-canvas text-base-content transition-colors duration-200"
>
  <div class="mx-auto max-w-[1600px] px-5 py-6 sm:px-10 lg:px-14">
    <header class="flex items-center justify-between border-b border-border pb-6">
      <a
        data-sveltekit-reload
        href="/"
        class="flex items-center gap-3 text-sm font-semibold tracking-[0.16em]"
        ><span
          class="grid size-9 place-items-center rounded-xl bg-primary text-primary-content"
          >H</span
        >
        HYPE <span class="font-normal text-muted-foreground">/ THEME STUDIO</span></a
      >
      <a
        data-sveltekit-reload
        href="/admin/styles/button"
        class="hidden items-center gap-2 text-xs text-muted-foreground hover:text-primary sm:flex"
        >Button library <ArrowUpRight class="size-4" /></a
      >
      <a
        data-sveltekit-reload
        href="/themes/colours"
        class="hidden items-center gap-2 text-xs text-muted-foreground hover:text-primary sm:flex"
        >Colour study <ArrowUpRight class="size-4" /></a
      >
    </header>

    <div class="grid gap-10 py-10 lg:grid-cols-[1fr_520px] lg:items-center">
      <div>
        <p class="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
          A different kind of atmosphere
        </p>
        <h1
          class="max-w-xl text-5xl font-medium leading-[1.08] tracking-[-0.045em] sm:text-6xl"
        >
          Good things.<br><span class="text-muted-foreground">In every light.</span>
        </h1>
        <p class="mt-6 max-w-md text-sm leading-7 text-muted-foreground">
          Five palettes, one familiar place. Explore a neighbourhood, plan a collection,
          and find the atmosphere that feels like you.
        </p>
        <div class="mt-6 flex items-center gap-3 text-sm">
          <span class="size-2 rounded-full bg-primary"></span
          ><span class="font-medium">{current.name}</span
          ><span class="text-muted-foreground">{current.family} · {current.mode}</span>
        </div>
      </div>
      <div class="rounded-3xl border border-border bg-panel p-5 sm:p-6">
        <ThemePicker
          value={selected}
          onSelect={theme => { selected = theme; notice = `${THEMES.find(item => item.id === theme)?.name} preview selected` }}
          label="Choose your atmosphere"
        />
        <label
          class="mt-5 flex cursor-pointer items-center justify-between gap-4 border-t border-border pt-4 text-xs text-muted-foreground"
          >Compare all five palettes<input
            type="checkbox"
            bind:checked={compare}
            class="size-4 accent-primary"
          ></label
        >
      </div>
    </div>

    <div
      class="mb-4 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
    >
      <span>01 / In good company</span><span>Interactive composition</span>
    </div>
    <div
      class="overflow-hidden rounded-3xl border border-border bg-panel shadow-xl shadow-base-content/5"
    >
      <div class="flex items-center justify-between border-b border-border px-5 py-4">
        <div class="flex items-center gap-2 text-sm font-medium">
          <span class="size-2 rounded-full bg-success"></span>
          The evening collection
        </div>
        <span class="text-xs text-muted-foreground">Hong Kong · 18:30</span>
      </div>
      <div class="grid lg:grid-cols-[380px_1fr]">
        <aside
          class="h-[430px] overflow-hidden border-b border-border lg:h-[590px] lg:border-b-0 lg:border-r"
        >
          <ResourcePanel model={panel} />
        </aside>
        <div class="p-5 sm:p-7">
          <div
            class="relative mb-6 overflow-hidden rounded-2xl border border-border bg-surface"
          >
            <svg
              viewBox="0 0 760 200"
              class="h-48 w-full"
              aria-label="Illustrated collection route through the neighbourhood"
              role="img"
            >
              <rect width="760" height="200" fill="var(--theme-surface)" />
              <path
                d="M0 120Q120 30 240 110T490 90T760 115V200H0Z"
                fill="var(--theme-secondary)"
                opacity=".13"
              />
              <g fill="none" stroke="var(--theme-border)" stroke-width="14">
                <path
                  d="M-20 40L800 160M110-30L210 240M360-30L300 240M570-30L640 240"
                />
                <path d="M-20 165L800 15" />
              </g>
              <path
                d="M165 90L325 90L610 115"
                stroke="var(--theme-primary)"
                stroke-width="4"
                stroke-dasharray="5 7"
                fill="none"
              />
              <g
                fill="var(--theme-panel)"
                stroke="var(--theme-primary)"
                stroke-width="4"
              >
                <circle cx="165" cy="90" r="10" />
                <circle cx="325" cy="90" r="10" />
                <circle cx="610" cy="115" r="10" />
              </g>
              <g font-size="12" fill="var(--theme-text)" font-family="inherit">
                <text x="120" y="65">Sheung Wan</text>
                <text x="300" y="65">Central</text>
                <text x="575" y="155">Wan Chai</text>
              </g>
            </svg>
            <span
              class="absolute right-3 top-3 rounded-full border border-border bg-panel px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground"
              >Route preview</span
            >
          </div>
          <div class="flex flex-wrap items-start justify-between gap-5">
            <div>
              <span
                class="text-[10px] font-semibold uppercase tracking-[0.16em] text-tertiary"
                >A little effort. A lot of good.</span
              >
              <h2 class="mt-2 text-2xl font-medium tracking-tight">
                Bread worth sharing.
              </h2>
              <p class="mt-2 text-sm text-muted-foreground">
                Three stops. One neighbourhood. Nothing wasted.
              </p>
            </div>
            <span
              class="rounded-full bg-success/12 px-3 py-1.5 text-xs font-medium text-success"
              >Open for volunteers</span
            >
          </div>
          <div
            class="my-6 grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-surface py-4"
          >
            <div class="px-4">
              <p class="text-2xl font-medium">
                24<span class="ml-1 text-sm text-muted-foreground">kg</span>
              </p>
              <p class="mt-1 text-xs text-muted-foreground">Food to share</p>
            </div>
            <div class="px-4">
              <p class="text-2xl font-medium">3</p>
              <p class="mt-1 text-xs text-muted-foreground">Bakery stops</p>
            </div>
            <div class="px-4">
              <p class="text-2xl font-medium">
                45<span class="ml-1 text-sm text-muted-foreground">min</span>
              </p>
              <p class="mt-1 text-xs text-muted-foreground">An evening well spent</p>
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3 text-xs text-muted-foreground">
              <Clock class="size-4" />
              Tonight, 19:00 <span>·</span><MapPin class="size-4" />
              Central
            </div>
            <Button
              text={reserved ? 'You’re on the list' : 'Join this collection'}
              color="primary"
              iconComponent={reserved ? Check : ArrowUpRight}
              onClick={() => { reserved = !reserved; notice = reserved ? 'Your place is reserved in this preview.' : 'Preview reservation removed.' }}
            />
          </div>
        </div>
      </div>
    </div>

    <div class="mt-8 grid gap-4 md:grid-cols-3">
      <section class="rounded-2xl border border-border bg-panel p-5">
        <span class="text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
          >A moment of progress</span
        >
        <div class="mb-3 mt-4 flex justify-between text-sm">
          <span>Tonight’s team</span><span class="text-secondary">7 / 10</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-raised">
          <div class="h-full w-[70%] rounded-full bg-secondary"></div>
        </div>
        <p class="mt-3 text-xs text-muted-foreground">
          Three more pairs of helping hands.
        </p>
      </section>
      <section class="rounded-2xl border border-border bg-panel p-5">
        <span class="text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
          >Made for small decisions</span
        >
        <div class="mt-4 flex flex-wrap gap-2">
          <Button
            text="Save for later"
            color="secondary"
            style="soft"
            onClick={() => notice = 'Collection saved in this preview.'}
          /><Button
            text="View details"
            color="accent"
            style="outline"
            onClick={() => notice = 'Try the routes and search in the sample panel.'}
          />
        </div>
      </section>
      <section class="rounded-2xl border border-border bg-panel p-5">
        <span class="text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
          >Your preview</span
        >
        <p class="mt-4 text-sm leading-6" role="status">{notice}</p>
      </section>
    </div>
    {#if compare}
      <div class="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {#each THEMES as theme}
          <section
            data-theme={theme.id}
            class="bits-theme rounded-2xl border border-border bg-panel p-5 text-base-content"
          >
            <div class="flex justify-between">
              <h2 class="font-semibold">{theme.name}</h2>
              {#if theme.mode === 'dark'}
                <Moon class="size-4 text-muted-foreground" />
              {:else}
                <Sun class="size-4 text-muted-foreground" />
              {/if}
            </div>
            <p class="my-4 text-sm text-muted-foreground">
              There’s always room at the table.
            </p>
            <div class="mb-4 flex gap-2">
              <span class="size-7 rounded-full bg-primary"></span
              ><span class="size-7 rounded-full bg-secondary"></span
              ><span class="size-7 rounded-full bg-tertiary"></span>
            </div>
            <Button
              text="Make a little difference"
              color="primary"
              onClick={() => selected = theme.id}
            />
          </section>
        {/each}
      </div>
    {/if}
    <footer
      class="flex flex-wrap justify-between gap-3 py-8 text-[10px] uppercase tracking-widest text-muted-foreground"
    >
      <span>Nullspace / Nebula / Oblivion / Milque / Rye</span
      ><span>Preview only · No account changes</span>
    </footer>
  </div>
</main>
