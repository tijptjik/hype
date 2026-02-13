<script lang="ts">
// BITS COMPONENTS
import { Header } from '$lib/bits'
// ICONS
import Anchor from 'virtual:icons/lucide/anchor'
import Cpu from 'virtual:icons/lucide/cpu'
import Flame from 'virtual:icons/lucide/flame'
import Globe from 'virtual:icons/lucide/globe'
import Heart from 'virtual:icons/lucide/heart'
import Leaf from 'virtual:icons/lucide/leaf'
import Moon from 'virtual:icons/lucide/moon'
import Shield from 'virtual:icons/lucide/shield'
import Skull from 'virtual:icons/lucide/skull'
import Telescope from 'virtual:icons/lucide/telescope'
import Trophy from 'virtual:icons/lucide/trophy'
import Wrench from 'virtual:icons/lucide/wrench'
import Zap from 'virtual:icons/lucide/zap'
// TYPES
import type { HeaderSize } from '$lib/bits'

const HEADER_SIZES: HeaderSize[] = ['xs', 'sm', 'md', 'lg', 'xl']
</script>

<main class="h-full overflow-y-auto p-6">
  <section class="bits-theme space-y-8 rounded-xl border border-base-300 bg-base-100 p-6">
    <h1 class="text-xl font-semibold text-foreground">Bits Header Variations</h1>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Optional Props
      </h2>
      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div class="space-y-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-foreground-alt">Text only</p>
          <Header text="Secret Societies" />
        </div>

        <div class="space-y-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-foreground-alt">
            Description only
          </p>
          <Header description="Global domination has never been easier" />
        </div>

        <div class="space-y-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-foreground-alt">Icon only</p>
          <Header icon={Globe} />
        </div>

        <div class="space-y-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-foreground-alt">
            Text + description
          </p>
          <Header
            text="Secret Societies"
            description="Global domination has never been easier" />
        </div>

        <div class="space-y-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-foreground-alt">
            Icon + text
          </p>
          <Header text="Secret Societies" icon={Heart} />
        </div>

        <div class="space-y-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-foreground-alt">
            Icon + text + description
          </p>
          <Header
            text="Secret Societies"
            description="Global domination has never been easier"
            icon={Globe} />
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">Sizes</h2>
      <div class="flex flex-col items-start gap-5">
        {#each HEADER_SIZES as size}
          <Header
            text={`Header ${size.toUpperCase()}`}
            description="Description scales at 75% of heading size"
            icon={Heart}
            {size} />
        {/each}
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Showcase
      </h2>
      <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Header text="Electric Vanguard" icon={Zap} size="md" />
        <Header text="Shield Protocol" icon={Shield} size="md" />
        <Header text="Skull Division" icon={Skull} size="md" />
        <Header text="Deep Space Survey" icon={Telescope} size="md" />
        <Header text="Victory Committee" icon={Trophy} size="md" />
        <Header text="Tooling Bureau" icon={Wrench} size="md" />
      </div>
        <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt py-4">
            With Descriptions
        </h2>
        <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Header
          text="Midnight Cartographers"
          description="Mapping moonlit routes since forever"
          icon={Moon}
          size="md" />
        <Header
          text="Silent Processors"
          description="Cold logic, warm intentions"
          icon={Cpu}
          size="md" />
        <Header
          text="Harbor Syndicate"
          description="Anchored power with fluid strategy"
          icon={Anchor}
          size="md" />
        <Header
          text="Kindling Council"
          description="Small sparks, massive outcomes"
          icon={Flame}
          size="md" />
        <Header
          text="Verdant Network"
          description="Growing influence root by root"
          icon={Leaf}
          size="md" />
        <Header
          text="World Operators"
          description="Global domination has never been easier"
          icon={Globe}
          size="md" />
      </div>
      </div>
  </section>
</main>
