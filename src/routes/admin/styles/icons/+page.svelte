<script lang="ts">
// BITS COMPONENTS
import { Button } from '#lib/bits/index.js'

// DATA
import { ICON_USAGES, ICON_USAGE_EXPORT, TOTAL_IMPORT_SITES } from './icon-usage'

let copyState = $state<'idle' | 'copied' | 'error'>('idle')

async function copyMapping(): Promise<void> {
  try {
    await navigator.clipboard.writeText(ICON_USAGE_EXPORT)
    copyState = 'copied'
    setTimeout(() => {
      copyState = 'idle'
    }, 2000)
  } catch {
    copyState = 'error'
    setTimeout(() => {
      copyState = 'idle'
    }, 2000)
  }
}
</script>

<main class="h-full overflow-y-auto p-6">
  <section
    class="bits-theme border-base-300 bg-base-100 space-y-6 rounded-xl border p-6"
  >
    <div
      class="border-base-300 flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between"
    >
      <div class="space-y-2">
        <h1 class="text-foreground text-2xl font-semibold">Icon Usage Audit</h1>
        <p class="text-foreground-alt max-w-3xl text-sm">
          This page audits every interface icon currently imported in the app, shows the
          rendered icon, and tracks how many import sites and files use it.
        </p>
        <p class="text-foreground-alt text-xs tracking-[0.2em] uppercase">
          {ICON_USAGES.length}
          unique icons across {TOTAL_IMPORT_SITES} import sites
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <Button text="Copy usage export" color="primary" onClick={copyMapping} />
        <span class="text-foreground-alt text-sm">
          {#if copyState === 'copied'}
            Copied icon usage export
          {:else if copyState === 'error'}
            Clipboard write failed
          {:else}
            Export includes import name, path, and usage counts
          {/if}
        </span>
      </div>
    </div>

    <div class="flex flex-wrap gap-4">
      {#each ICON_USAGES as icon}
        <article
          class="border-base-300 bg-base-50 flex w-full max-w-[24rem] flex-1 flex-col gap-4 rounded-2xl border p-4 shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-foreground font-mono text-sm font-semibold">
                {icon.name}
              </h2>
              <p class="text-foreground-alt mt-1 text-[11px] break-all">
                {icon.importPath}
              </p>
            </div>
            <div class="flex flex-col items-end gap-2">
              <span
                class="border-base-300 bg-base-100 text-foreground-alt rounded-full border px-2 py-1 text-xs"
              >
                {icon.usageCount}
                import{icon.usageCount === 1 ? '' : 's'}
              </span>
              <span
                class="border-base-300 bg-base-100 text-foreground-alt rounded-full border px-2 py-1 text-xs"
              >
                {icon.fileCount}
                file{icon.fileCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <div
            class="border-success/30 bg-base-100 text-success flex h-28 items-center justify-center rounded-xl border border-dashed"
          >
            <svg
              class="h-16 w-16"
              viewBox={`0 0 ${icon.width} ${icon.height}`}
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              aria-label={icon.name}
              role="img"
            >
              {@html icon.svgBody}
            </svg>
          </div>

          <div class="border-base-300 bg-base-100 space-y-2 rounded-xl border p-3">
            <p
              class="text-foreground-alt text-[11px] font-semibold tracking-[0.18em] uppercase"
            >
              Local Names
            </p>
            <div class="flex flex-wrap gap-2">
              {#each icon.localNames as localName}
                <span
                  class="border-base-300 bg-base-50 text-foreground-alt rounded-full border px-2 py-1 font-mono text-[11px]"
                >
                  {localName}
                </span>
              {/each}
            </div>
          </div>
        </article>
      {/each}
    </div>
  </section>
</main>
