<script lang="ts">
// SVELTE
import type { Component } from 'svelte'
import type { IconSource } from '@steeze-ui/svelte-icon'

// BITS COMPONENTS
import { Button } from '$lib/bits'

// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'

// ICONS :: LEGACY
import * as HeroIcons from '@steeze-ui/heroicons'

// ICONS :: LUCIDE
import IconArrowDown from 'virtual:icons/lucide/arrow-down'
import IconDownload from 'virtual:icons/lucide/download'
import IconRefreshCw from 'virtual:icons/lucide/refresh-cw'
import IconArrowUp from 'virtual:icons/lucide/arrow-up'
import IconMinimize from 'virtual:icons/lucide/minimize'
import IconMaximize from 'virtual:icons/lucide/maximize'
import IconAtSign from 'virtual:icons/lucide/at-sign'
import IconDelete from 'virtual:icons/lucide/delete'
import IconMenu from 'virtual:icons/lucide/menu'
import IconZap from 'virtual:icons/lucide/zap'
import IconBookOpen from 'virtual:icons/lucide/book-open'
import IconLandmark from 'virtual:icons/lucide/landmark'
import IconCalendar from 'virtual:icons/lucide/calendar'
import IconCamera from 'virtual:icons/lucide/camera'
import IconCheck from 'virtual:icons/lucide/check'
import IconBadgeCheck from 'virtual:icons/lucide/badge-check'
import IconCircleCheck from 'virtual:icons/lucide/circle-check'
import IconChevronDown from 'virtual:icons/lucide/chevron-down'
import IconChevronLeft from 'virtual:icons/lucide/chevron-left'
import IconChevronRight from 'virtual:icons/lucide/chevron-right'
import IconChevronUp from 'virtual:icons/lucide/chevron-up'
import IconCloudDownload from 'virtual:icons/lucide/cloud-download'
import IconCloudUpload from 'virtual:icons/lucide/cloud-upload'
import IconSettings from 'virtual:icons/lucide/settings'
import IconMonitor from 'virtual:icons/lucide/monitor'
import IconBox from 'virtual:icons/lucide/box'
import IconFileText from 'virtual:icons/lucide/file-text'
import IconEllipsisVertical from 'virtual:icons/lucide/ellipsis-vertical'
import IconCircleAlert from 'virtual:icons/lucide/circle-alert'
import IconTriangleAlert from 'virtual:icons/lucide/triangle-alert'
import IconEye from 'virtual:icons/lucide/eye'
import IconEyeOff from 'virtual:icons/lucide/eye-off'
import IconFolderOpen from 'virtual:icons/lucide/folder-open'
import IconFilter from 'virtual:icons/lucide/filter'
import IconGlobe from 'virtual:icons/lucide/globe'
import IconGlobe2 from 'virtual:icons/lucide/globe-2'
import IconHeart from 'virtual:icons/lucide/heart'
import IconInbox from 'virtual:icons/lucide/inbox'
import IconInfo from 'virtual:icons/lucide/info'
import IconLanguages from 'virtual:icons/lucide/languages'
import IconSearch from 'virtual:icons/lucide/search'
import IconMap from 'virtual:icons/lucide/map'
import IconMapPin from 'virtual:icons/lucide/map-pin'
import IconCircleMinus from 'virtual:icons/lucide/circle-minus'
import IconPencil from 'virtual:icons/lucide/pencil'
import IconSquarePen from 'virtual:icons/lucide/square-pen'
import IconImage from 'virtual:icons/lucide/image'
import IconPlus from 'virtual:icons/lucide/plus'
import IconCirclePlus from 'virtual:icons/lucide/circle-plus'
import IconListOrdered from 'virtual:icons/lucide/list-ordered'
import IconReceipt from 'virtual:icons/lucide/receipt'
import IconCopy from 'virtual:icons/lucide/copy'
import IconLayers3 from 'virtual:icons/lucide/layers-3'
import IconGrid2x2 from 'virtual:icons/lucide/grid-2x2'
import IconStar from 'virtual:icons/lucide/star'
import IconSwatchBook from 'virtual:icons/lucide/swatch-book'
import IconTable2 from 'virtual:icons/lucide/table-2'
import IconTag from 'virtual:icons/lucide/tag'
import IconTrash2 from 'virtual:icons/lucide/trash-2'
import IconTrophy from 'virtual:icons/lucide/trophy'
import IconCircleUser from 'virtual:icons/lucide/circle-user'
import IconUsers from 'virtual:icons/lucide/users'
import IconUserPlus from 'virtual:icons/lucide/user-plus'
import IconCircleX from 'virtual:icons/lucide/circle-x'
import IconX from 'virtual:icons/lucide/x'

type IconPair = {
  oldImport: string
  oldIcon: Component | IconSource
  newImport: string
  newPath: string
  newIcon: Component | IconSource
  usageCount: number
}

const ICON_MAPPINGS: IconPair[] = [
  {
    oldImport: 'ArrowDown',
    oldIcon: HeroIcons.ArrowDown,
    newImport: 'IconArrowDown',
    newPath: 'virtual:icons/lucide/arrow-down',
    newIcon: IconArrowDown,
    usageCount: 1,
  },
  {
    oldImport: 'ArrowDownTray',
    oldIcon: HeroIcons.ArrowDownTray,
    newImport: 'IconDownload',
    newPath: 'virtual:icons/lucide/download',
    newIcon: IconDownload,
    usageCount: 1,
  },
  {
    oldImport: 'ArrowPath',
    oldIcon: HeroIcons.ArrowPath,
    newImport: 'IconRefreshCw',
    newPath: 'virtual:icons/lucide/refresh-cw',
    newIcon: IconRefreshCw,
    usageCount: 1,
  },
  {
    oldImport: 'ArrowUp',
    oldIcon: HeroIcons.ArrowUp,
    newImport: 'IconArrowUp',
    newPath: 'virtual:icons/lucide/arrow-up',
    newIcon: IconArrowUp,
    usageCount: 1,
  },
  {
    oldImport: 'ArrowsPointingIn',
    oldIcon: HeroIcons.ArrowsPointingIn,
    newImport: 'IconMinimize',
    newPath: 'virtual:icons/lucide/minimize',
    newIcon: IconMinimize,
    usageCount: 1,
  },
  {
    oldImport: 'ArrowsPointingOut',
    oldIcon: HeroIcons.ArrowsPointingOut,
    newImport: 'IconMaximize',
    newPath: 'virtual:icons/lucide/maximize',
    newIcon: IconMaximize,
    usageCount: 1,
  },
  {
    oldImport: 'AtSymbol',
    oldIcon: HeroIcons.AtSymbol,
    newImport: 'IconAtSign',
    newPath: 'virtual:icons/lucide/at-sign',
    newIcon: IconAtSign,
    usageCount: 1,
  },
  {
    oldImport: 'Backspace',
    oldIcon: HeroIcons.Backspace,
    newImport: 'IconDelete',
    newPath: 'virtual:icons/lucide/delete',
    newIcon: IconDelete,
    usageCount: 1,
  },
  {
    oldImport: 'Bars3',
    oldIcon: HeroIcons.Bars3,
    newImport: 'IconMenu',
    newPath: 'virtual:icons/lucide/menu',
    newIcon: IconMenu,
    usageCount: 2,
  },
  {
    oldImport: 'Bolt',
    oldIcon: HeroIcons.Bolt,
    newImport: 'IconZap',
    newPath: 'virtual:icons/lucide/zap',
    newIcon: IconZap,
    usageCount: 1,
  },
  {
    oldImport: 'BookOpen',
    oldIcon: HeroIcons.BookOpen,
    newImport: 'IconBookOpen',
    newPath: 'virtual:icons/lucide/book-open',
    newIcon: IconBookOpen,
    usageCount: 1,
  },
  {
    oldImport: 'BuildingLibrary',
    oldIcon: HeroIcons.BuildingLibrary,
    newImport: 'IconLandmark',
    newPath: 'virtual:icons/lucide/landmark',
    newIcon: IconLandmark,
    usageCount: 2,
  },
  {
    oldImport: 'Calendar',
    oldIcon: HeroIcons.Calendar,
    newImport: 'IconCalendar',
    newPath: 'virtual:icons/lucide/calendar',
    newIcon: IconCalendar,
    usageCount: 1,
  },
  {
    oldImport: 'Camera',
    oldIcon: HeroIcons.Camera,
    newImport: 'IconCamera',
    newPath: 'virtual:icons/lucide/camera',
    newIcon: IconCamera,
    usageCount: 9,
  },
  {
    oldImport: 'Check',
    oldIcon: HeroIcons.Check,
    newImport: 'IconCheck',
    newPath: 'virtual:icons/lucide/check',
    newIcon: IconCheck,
    usageCount: 10,
  },
  {
    oldImport: 'CheckBadge',
    oldIcon: HeroIcons.CheckBadge,
    newImport: 'IconBadgeCheck',
    newPath: 'virtual:icons/lucide/badge-check',
    newIcon: IconBadgeCheck,
    usageCount: 1,
  },
  {
    oldImport: 'CheckCircle',
    oldIcon: HeroIcons.CheckCircle,
    newImport: 'IconCircleCheck',
    newPath: 'virtual:icons/lucide/circle-check',
    newIcon: IconCircleCheck,
    usageCount: 11,
  },
  {
    oldImport: 'ChevronDown',
    oldIcon: HeroIcons.ChevronDown,
    newImport: 'IconChevronDown',
    newPath: 'virtual:icons/lucide/chevron-down',
    newIcon: IconChevronDown,
    usageCount: 11,
  },
  {
    oldImport: 'ChevronLeft',
    oldIcon: HeroIcons.ChevronLeft,
    newImport: 'IconChevronLeft',
    newPath: 'virtual:icons/lucide/chevron-left',
    newIcon: IconChevronLeft,
    usageCount: 3,
  },
  {
    oldImport: 'ChevronRight',
    oldIcon: HeroIcons.ChevronRight,
    newImport: 'IconChevronRight',
    newPath: 'virtual:icons/lucide/chevron-right',
    newIcon: IconChevronRight,
    usageCount: 9,
  },
  {
    oldImport: 'ChevronUp',
    oldIcon: HeroIcons.ChevronUp,
    newImport: 'IconChevronUp',
    newPath: 'virtual:icons/lucide/chevron-up',
    newIcon: IconChevronUp,
    usageCount: 5,
  },
  {
    oldImport: 'CloudArrowDown',
    oldIcon: HeroIcons.CloudArrowDown,
    newImport: 'IconCloudDownload',
    newPath: 'virtual:icons/lucide/cloud-download',
    newIcon: IconCloudDownload,
    usageCount: 1,
  },
  {
    oldImport: 'CloudArrowUp',
    oldIcon: HeroIcons.CloudArrowUp,
    newImport: 'IconCloudUpload',
    newPath: 'virtual:icons/lucide/cloud-upload',
    newIcon: IconCloudUpload,
    usageCount: 2,
  },
  {
    oldImport: 'Cog6Tooth',
    oldIcon: HeroIcons.Cog6Tooth,
    newImport: 'IconSettings',
    newPath: 'virtual:icons/lucide/settings',
    newIcon: IconSettings,
    usageCount: 1,
  },
  {
    oldImport: 'ComputerDesktop',
    oldIcon: HeroIcons.ComputerDesktop,
    newImport: 'IconMonitor',
    newPath: 'virtual:icons/lucide/monitor',
    newIcon: IconMonitor,
    usageCount: 1,
  },
  {
    oldImport: 'CubeTransparent',
    oldIcon: HeroIcons.CubeTransparent,
    newImport: 'IconBox',
    newPath: 'virtual:icons/lucide/box',
    newIcon: IconBox,
    usageCount: 2,
  },
  {
    oldImport: 'Document',
    oldIcon: HeroIcons.Document,
    newImport: 'IconFileText',
    newPath: 'virtual:icons/lucide/file-text',
    newIcon: IconFileText,
    usageCount: 1,
  },
  {
    oldImport: 'EllipsisVertical',
    oldIcon: HeroIcons.EllipsisVertical,
    newImport: 'IconEllipsisVertical',
    newPath: 'virtual:icons/lucide/ellipsis-vertical',
    newIcon: IconEllipsisVertical,
    usageCount: 1,
  },
  {
    oldImport: 'ExclamationCircle',
    oldIcon: HeroIcons.ExclamationCircle,
    newImport: 'IconCircleAlert',
    newPath: 'virtual:icons/lucide/circle-alert',
    newIcon: IconCircleAlert,
    usageCount: 4,
  },
  {
    oldImport: 'ExclamationTriangle',
    oldIcon: HeroIcons.ExclamationTriangle,
    newImport: 'IconTriangleAlert',
    newPath: 'virtual:icons/lucide/triangle-alert',
    newIcon: IconTriangleAlert,
    usageCount: 6,
  },
  {
    oldImport: 'Eye',
    oldIcon: HeroIcons.Eye,
    newImport: 'IconEye',
    newPath: 'virtual:icons/lucide/eye',
    newIcon: IconEye,
    usageCount: 3,
  },
  {
    oldImport: 'EyeSlash',
    oldIcon: HeroIcons.EyeSlash,
    newImport: 'IconEyeOff',
    newPath: 'virtual:icons/lucide/eye-off',
    newIcon: IconEyeOff,
    usageCount: 2,
  },
  {
    oldImport: 'FolderOpen',
    oldIcon: HeroIcons.FolderOpen,
    newImport: 'IconFolderOpen',
    newPath: 'virtual:icons/lucide/folder-open',
    newIcon: IconFolderOpen,
    usageCount: 2,
  },
  {
    oldImport: 'Funnel',
    oldIcon: HeroIcons.Funnel,
    newImport: 'IconFilter',
    newPath: 'virtual:icons/lucide/filter',
    newIcon: IconFilter,
    usageCount: 3,
  },
  {
    oldImport: 'GlobeAlt',
    oldIcon: HeroIcons.GlobeAlt,
    newImport: 'IconGlobe',
    newPath: 'virtual:icons/lucide/globe',
    newIcon: IconGlobe,
    usageCount: 1,
  },
  {
    oldImport: 'GlobeAsiaAustralia',
    oldIcon: HeroIcons.GlobeAsiaAustralia,
    newImport: 'IconGlobe2',
    newPath: 'virtual:icons/lucide/globe-2',
    newIcon: IconGlobe2,
    usageCount: 2,
  },
  {
    oldImport: 'Heart',
    oldIcon: HeroIcons.Heart,
    newImport: 'IconHeart',
    newPath: 'virtual:icons/lucide/heart',
    newIcon: IconHeart,
    usageCount: 3,
  },
  {
    oldImport: 'InboxArrowDown',
    oldIcon: HeroIcons.InboxArrowDown,
    newImport: 'IconInbox',
    newPath: 'virtual:icons/lucide/inbox',
    newIcon: IconInbox,
    usageCount: 1,
  },
  {
    oldImport: 'InformationCircle',
    oldIcon: HeroIcons.InformationCircle,
    newImport: 'IconInfo',
    newPath: 'virtual:icons/lucide/info',
    newIcon: IconInfo,
    usageCount: 7,
  },
  {
    oldImport: 'Language',
    oldIcon: HeroIcons.Language,
    newImport: 'IconLanguages',
    newPath: 'virtual:icons/lucide/languages',
    newIcon: IconLanguages,
    usageCount: 6,
  },
  {
    oldImport: 'MagnifyingGlass',
    oldIcon: HeroIcons.MagnifyingGlass,
    newImport: 'IconSearch',
    newPath: 'virtual:icons/lucide/search',
    newIcon: IconSearch,
    usageCount: 6,
  },
  {
    oldImport: 'Map',
    oldIcon: HeroIcons.Map,
    newImport: 'IconMap',
    newPath: 'virtual:icons/lucide/map',
    newIcon: IconMap,
    usageCount: 4,
  },
  {
    oldImport: 'MapPin',
    oldIcon: HeroIcons.MapPin,
    newImport: 'IconMapPin',
    newPath: 'virtual:icons/lucide/map-pin',
    newIcon: IconMapPin,
    usageCount: 8,
  },
  {
    oldImport: 'MinusCircle',
    oldIcon: HeroIcons.MinusCircle,
    newImport: 'IconCircleMinus',
    newPath: 'virtual:icons/lucide/circle-minus',
    newIcon: IconCircleMinus,
    usageCount: 1,
  },
  {
    oldImport: 'Pencil',
    oldIcon: HeroIcons.Pencil,
    newImport: 'IconPencil',
    newPath: 'virtual:icons/lucide/pencil',
    newIcon: IconPencil,
    usageCount: 2,
  },
  {
    oldImport: 'PencilSquare',
    oldIcon: HeroIcons.PencilSquare,
    newImport: 'IconSquarePen',
    newPath: 'virtual:icons/lucide/square-pen',
    newIcon: IconSquarePen,
    usageCount: 10,
  },
  {
    oldImport: 'Photo',
    oldIcon: HeroIcons.Photo,
    newImport: 'IconImage',
    newPath: 'virtual:icons/lucide/image',
    newIcon: IconImage,
    usageCount: 7,
  },
  {
    oldImport: 'Plus',
    oldIcon: HeroIcons.Plus,
    newImport: 'IconPlus',
    newPath: 'virtual:icons/lucide/plus',
    newIcon: IconPlus,
    usageCount: 2,
  },
  {
    oldImport: 'PlusCircle',
    oldIcon: HeroIcons.PlusCircle,
    newImport: 'IconCirclePlus',
    newPath: 'virtual:icons/lucide/circle-plus',
    newIcon: IconCirclePlus,
    usageCount: 3,
  },
  {
    oldImport: 'QueueList',
    oldIcon: HeroIcons.QueueList,
    newImport: 'IconListOrdered',
    newPath: 'virtual:icons/lucide/list-ordered',
    newIcon: IconListOrdered,
    usageCount: 3,
  },
  {
    oldImport: 'ReceiptRefund',
    oldIcon: HeroIcons.ReceiptRefund,
    newImport: 'IconReceipt',
    newPath: 'virtual:icons/lucide/receipt',
    newIcon: IconReceipt,
    usageCount: 1,
  },
  {
    oldImport: 'Square2Stack',
    oldIcon: HeroIcons.Square2Stack,
    newImport: 'IconCopy',
    newPath: 'virtual:icons/lucide/copy',
    newIcon: IconCopy,
    usageCount: 1,
  },
  {
    oldImport: 'Square3Stack3d',
    oldIcon: HeroIcons.Square3Stack3d,
    newImport: 'IconLayers3',
    newPath: 'virtual:icons/lucide/layers-3',
    newIcon: IconLayers3,
    usageCount: 3,
  },
  {
    oldImport: 'Squares2x2',
    oldIcon: HeroIcons.Squares2x2,
    newImport: 'IconGrid2x2',
    newPath: 'virtual:icons/lucide/grid-2x2',
    newIcon: IconGrid2x2,
    usageCount: 6,
  },
  {
    oldImport: 'Star',
    oldIcon: HeroIcons.Star,
    newImport: 'IconStar',
    newPath: 'virtual:icons/lucide/star',
    newIcon: IconStar,
    usageCount: 3,
  },
  {
    oldImport: 'Swatch',
    oldIcon: HeroIcons.Swatch,
    newImport: 'IconSwatchBook',
    newPath: 'virtual:icons/lucide/swatch-book',
    newIcon: IconSwatchBook,
    usageCount: 1,
  },
  {
    oldImport: 'TableCells',
    oldIcon: HeroIcons.TableCells,
    newImport: 'IconTable2',
    newPath: 'virtual:icons/lucide/table-2',
    newIcon: IconTable2,
    usageCount: 1,
  },
  {
    oldImport: 'Tag',
    oldIcon: HeroIcons.Tag,
    newImport: 'IconTag',
    newPath: 'virtual:icons/lucide/tag',
    newIcon: IconTag,
    usageCount: 1,
  },
  {
    oldImport: 'Trash',
    oldIcon: HeroIcons.Trash,
    newImport: 'IconTrash2',
    newPath: 'virtual:icons/lucide/trash-2',
    newIcon: IconTrash2,
    usageCount: 7,
  },
  {
    oldImport: 'Trophy',
    oldIcon: HeroIcons.Trophy,
    newImport: 'IconTrophy',
    newPath: 'virtual:icons/lucide/trophy',
    newIcon: IconTrophy,
    usageCount: 1,
  },
  {
    oldImport: 'UserCircle',
    oldIcon: HeroIcons.UserCircle,
    newImport: 'IconCircleUser',
    newPath: 'virtual:icons/lucide/circle-user',
    newIcon: IconCircleUser,
    usageCount: 1,
  },
  {
    oldImport: 'UserGroup',
    oldIcon: HeroIcons.UserGroup,
    newImport: 'IconUsers',
    newPath: 'virtual:icons/lucide/users',
    newIcon: IconUsers,
    usageCount: 3,
  },
  {
    oldImport: 'UserPlus',
    oldIcon: HeroIcons.UserPlus,
    newImport: 'IconUserPlus',
    newPath: 'virtual:icons/lucide/user-plus',
    newIcon: IconUserPlus,
    usageCount: 1,
  },
  {
    oldImport: 'XCircle',
    oldIcon: HeroIcons.XCircle,
    newImport: 'IconCircleX',
    newPath: 'virtual:icons/lucide/circle-x',
    newIcon: IconCircleX,
    usageCount: 10,
  },
  {
    oldImport: 'XMark',
    oldIcon: HeroIcons.XMark,
    newImport: 'IconX',
    newPath: 'virtual:icons/lucide/x',
    newIcon: IconX,
    usageCount: 16,
  },
]

const TOTAL_IMPORT_SITES = ICON_MAPPINGS.reduce((sum, icon) => sum + icon.usageCount, 0)
const MAPPING_EXPORT = `export const HEROICON_TO_LUCIDE_MAP = {
${ICON_MAPPINGS.map(
  icon =>
    `  ${icon.oldImport}: { importName: '${icon.newImport}', importPath: '${icon.newPath}' },`,
).join('\n')}
} as const`

let copyState: 'idle' | 'copied' | 'error' = 'idle'

async function copyMapping(): Promise<void> {
  try {
    await navigator.clipboard.writeText(MAPPING_EXPORT)
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
    class="bits-theme space-y-6 rounded-xl border border-base-300 bg-base-100 p-6"
  >
    <div
      class="flex flex-col gap-4 border-b border-base-300 pb-6 lg:flex-row lg:items-end lg:justify-between"
    >
      <div class="space-y-2">
        <h1 class="text-2xl font-semibold text-foreground">
          Heroicons to Lucide Audit
        </h1>
        <p class="max-w-3xl text-sm text-foreground-alt">
          This page audits every unique runtime icon imported from
          <code>@steeze-ui/heroicons</code>, shows a suggested Lucide replacement, and
          lets you copy a migration map for codemods or manual refactors.
        </p>
        <p class="text-xs uppercase tracking-[0.2em] text-foreground-alt">
          {ICON_MAPPINGS.length}
          unique icons across {TOTAL_IMPORT_SITES} import sites
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <Button text="Copy old -> new map" color="primary" onClick={copyMapping} />
        <span class="text-sm text-foreground-alt">
          {#if copyState === 'copied'}
            Copied mapping export
          {:else if copyState === 'error'}
            Clipboard write failed
          {:else}
            Export includes import name and import path
          {/if}
        </span>
      </div>
    </div>

    <div class="flex flex-wrap gap-4">
      {#each ICON_MAPPINGS as icon}
        <article
          class="flex w-full max-w-[24rem] flex-1 flex-col gap-4 rounded-2xl border border-base-300 bg-base-50 p-4 shadow-sm"
        >
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-mono text-sm font-semibold text-foreground">
              {icon.oldImport}
            </h2>
            <span
              class="rounded-full border border-base-300 bg-base-100 px-2 py-1 text-xs text-foreground-alt"
            >
              {icon.usageCount}
              use{icon.usageCount === 1 ? '' : 's'}
            </span>
          </div>

          <div class="flex flex-wrap gap-4">
            <div
              class="flex min-w-[10rem] flex-1 flex-col items-center rounded-xl border border-base-300 bg-base-100 p-4 text-center"
            >
              <div
                class="mb-3 flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-base-300 bg-base-50 text-foreground"
              >
                <Icon src={icon.oldIcon} class="h-16 w-16" size="64px" />
              </div>
              <p class="font-mono text-xs font-semibold text-foreground">
                {icon.oldImport}
              </p>
              <p class="mt-1 text-[11px] text-foreground-alt">@steeze-ui/heroicons</p>
            </div>

            <div
              class="flex min-w-[10rem] flex-1 flex-col items-center rounded-xl border border-success/30 bg-success/5 p-4 text-center"
            >
              <div
                class="mb-3 flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-success/30 bg-base-100 text-success"
              >
                <Icon src={icon.newIcon} class="h-16 w-16" size="64px" />
              </div>
              <p class="font-mono text-xs font-semibold text-foreground">
                {icon.newImport}
              </p>
              <p class="mt-1 break-all text-[11px] text-foreground-alt">
                {icon.newPath}
              </p>
            </div>
          </div>
        </article>
      {/each}
    </div>
  </section>
</main>
