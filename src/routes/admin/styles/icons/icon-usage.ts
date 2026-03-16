import type { Component } from 'svelte'

import IconAlertCircle from 'virtual:icons/lucide/alert-circle'
import IconAnchor from 'virtual:icons/lucide/anchor'
import IconArrowDown from 'virtual:icons/lucide/arrow-down'
import IconArrowUp from 'virtual:icons/lucide/arrow-up'
import IconArrowUpDown from 'virtual:icons/lucide/arrow-up-down'
import IconAtSign from 'virtual:icons/lucide/at-sign'
import IconBadgeCheck from 'virtual:icons/lucide/badge-check'
import IconBlend from 'virtual:icons/lucide/blend'
import IconBookOpen from 'virtual:icons/lucide/book-open'
import IconBot from 'virtual:icons/lucide/bot'
import IconBuilding2 from 'virtual:icons/lucide/building-2'
import IconCalendar from 'virtual:icons/lucide/calendar'
import IconCamera from 'virtual:icons/lucide/camera'
import IconCheck from 'virtual:icons/lucide/check'
import IconChevronDown from 'virtual:icons/lucide/chevron-down'
import IconChevronLeft from 'virtual:icons/lucide/chevron-left'
import IconChevronRight from 'virtual:icons/lucide/chevron-right'
import IconChevronUp from 'virtual:icons/lucide/chevron-up'
import IconChevronsUpDown from 'virtual:icons/lucide/chevrons-up-down'
import IconCircleAlert from 'virtual:icons/lucide/circle-alert'
import IconCircleCheck from 'virtual:icons/lucide/circle-check'
import IconCircleDotDashed from 'virtual:icons/lucide/circle-dot-dashed'
import IconCircleMinus from 'virtual:icons/lucide/circle-minus'
import IconCirclePlus from 'virtual:icons/lucide/circle-plus'
import IconCircleUser from 'virtual:icons/lucide/circle-user'
import IconCircleX from 'virtual:icons/lucide/circle-x'
import IconCloudDownload from 'virtual:icons/lucide/cloud-download'
import IconCloudUpload from 'virtual:icons/lucide/cloud-upload'
import IconCopy from 'virtual:icons/lucide/copy'
import IconCopyCheck from 'virtual:icons/lucide/copy-check'
import IconCpu from 'virtual:icons/lucide/cpu'
import IconDatabase from 'virtual:icons/lucide/database'
import IconDot from 'virtual:icons/lucide/dot'
import IconEllipsisVertical from 'virtual:icons/lucide/ellipsis-vertical'
import IconEraser from 'virtual:icons/lucide/eraser'
import IconExpand from 'virtual:icons/lucide/expand'
import IconEye from 'virtual:icons/lucide/eye'
import IconEyeOff from 'virtual:icons/lucide/eye-off'
import IconFileText from 'virtual:icons/lucide/file-text'
import IconFilter from 'virtual:icons/lucide/filter'
import IconFlame from 'virtual:icons/lucide/flame'
import IconFolderOpen from 'virtual:icons/lucide/folder-open'
import IconFormInput from 'virtual:icons/lucide/form-input'
import IconFunnel from 'virtual:icons/lucide/funnel'
import IconFunnelX from 'virtual:icons/lucide/funnel-x'
import IconGhost from 'virtual:icons/lucide/ghost'
import IconGlobe from 'virtual:icons/lucide/globe'
import IconGlobe2 from 'virtual:icons/lucide/globe-2'
import IconGripVertical from 'virtual:icons/lucide/grip-vertical'
import IconHeart from 'virtual:icons/lucide/heart'
import IconImage from 'virtual:icons/lucide/image'
import IconImageUp from 'virtual:icons/lucide/image-up'
import IconInbox from 'virtual:icons/lucide/inbox'
import IconInfo from 'virtual:icons/lucide/info'
import IconLandmark from 'virtual:icons/lucide/landmark'
import IconLanguages from 'virtual:icons/lucide/languages'
import IconLayers from 'virtual:icons/lucide/layers'
import IconLayers3 from 'virtual:icons/lucide/layers-3'
import IconLayoutGrid from 'virtual:icons/lucide/layout-grid'
import IconLeaf from 'virtual:icons/lucide/leaf'
import IconList from 'virtual:icons/lucide/list'
import IconListPlus from 'virtual:icons/lucide/list-plus'
import IconLoaderCircle from 'virtual:icons/lucide/loader-circle'
import IconMailbox from 'virtual:icons/lucide/mailbox'
import IconMap from 'virtual:icons/lucide/map'
import IconMapPin from 'virtual:icons/lucide/map-pin'
import IconMenu from 'virtual:icons/lucide/menu'
import IconMinus from 'virtual:icons/lucide/minus'
import IconMonitor from 'virtual:icons/lucide/monitor'
import IconMoon from 'virtual:icons/lucide/moon'
import IconOctagonMinus from 'virtual:icons/lucide/octagon-minus'
import IconPanelTopBottomDashed from 'virtual:icons/lucide/panel-top-bottom-dashed'
import IconPen from 'virtual:icons/lucide/pen'
import IconPenLine from 'virtual:icons/lucide/pen-line'
import IconPencil from 'virtual:icons/lucide/pencil'
import IconPlus from 'virtual:icons/lucide/plus'
import IconPlusCircle from 'virtual:icons/lucide/plus-circle'
import IconRefreshCw from 'virtual:icons/lucide/refresh-cw'
import IconReplace from 'virtual:icons/lucide/replace'
import IconRotateCcw from 'virtual:icons/lucide/rotate-ccw'
import IconSave from 'virtual:icons/lucide/save'
import IconSearch from 'virtual:icons/lucide/search'
import IconSettings from 'virtual:icons/lucide/settings'
import IconShield from 'virtual:icons/lucide/shield'
import IconShieldCheck from 'virtual:icons/lucide/shield-check'
import IconShrink from 'virtual:icons/lucide/shrink'
import IconSkull from 'virtual:icons/lucide/skull'
import IconSmile from 'virtual:icons/lucide/smile'
import IconSquarePen from 'virtual:icons/lucide/square-pen'
import IconStar from 'virtual:icons/lucide/star'
import IconSwatchBook from 'virtual:icons/lucide/swatch-book'
import IconTable2 from 'virtual:icons/lucide/table-2'
import IconTag from 'virtual:icons/lucide/tag'
import IconTags from 'virtual:icons/lucide/tags'
import IconTelescope from 'virtual:icons/lucide/telescope'
import IconTrash2 from 'virtual:icons/lucide/trash-2'
import IconTriangleAlert from 'virtual:icons/lucide/triangle-alert'
import IconTrophy from 'virtual:icons/lucide/trophy'
import IconType from 'virtual:icons/lucide/type'
import IconUndo2 from 'virtual:icons/lucide/undo-2'
import IconUserMinus from 'virtual:icons/lucide/user-minus'
import IconUserPlus from 'virtual:icons/lucide/user-plus'
import IconUsers from 'virtual:icons/lucide/users'
import IconUsersRound from 'virtual:icons/lucide/users-round'
import IconWrench from 'virtual:icons/lucide/wrench'
import IconX from 'virtual:icons/lucide/x'
import IconZap from 'virtual:icons/lucide/zap'

export type IconUsage = {
  name: string
  importName: string
  importPath: string
  component: Component
  usageCount: number
  fileCount: number
  localNames: string[]
}

export const ICON_USAGES: IconUsage[] = [
  {
    name: 'alert-circle',
    importName: 'IconAlertCircle',
    importPath: 'virtual:icons/lucide/alert-circle',
    component: IconAlertCircle,
    usageCount: 1,
    fileCount: 1,
    localNames: ['AlertCircle'],
  },
  {
    name: 'anchor',
    importName: 'IconAnchor',
    importPath: 'virtual:icons/lucide/anchor',
    component: IconAnchor,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Anchor'],
  },
  {
    name: 'arrow-down',
    importName: 'IconArrowDown',
    importPath: 'virtual:icons/lucide/arrow-down',
    component: IconArrowDown,
    usageCount: 1,
    fileCount: 1,
    localNames: ['ArrowDownIcon'],
  },
  {
    name: 'arrow-up',
    importName: 'IconArrowUp',
    importPath: 'virtual:icons/lucide/arrow-up',
    component: IconArrowUp,
    usageCount: 1,
    fileCount: 1,
    localNames: ['ArrowUpIcon'],
  },
  {
    name: 'arrow-up-down',
    importName: 'IconArrowUpDown',
    importPath: 'virtual:icons/lucide/arrow-up-down',
    component: IconArrowUpDown,
    usageCount: 1,
    fileCount: 1,
    localNames: ['ArrowUpDownIcon'],
  },
  {
    name: 'at-sign',
    importName: 'IconAtSign',
    importPath: 'virtual:icons/lucide/at-sign',
    component: IconAtSign,
    usageCount: 1,
    fileCount: 1,
    localNames: ['AtSymbol'],
  },
  {
    name: 'badge-check',
    importName: 'IconBadgeCheck',
    importPath: 'virtual:icons/lucide/badge-check',
    component: IconBadgeCheck,
    usageCount: 1,
    fileCount: 1,
    localNames: ['CheckBadge'],
  },
  {
    name: 'blend',
    importName: 'IconBlend',
    importPath: 'virtual:icons/lucide/blend',
    component: IconBlend,
    usageCount: 4,
    fileCount: 4,
    localNames: ['Blend'],
  },
  {
    name: 'book-open',
    importName: 'IconBookOpen',
    importPath: 'virtual:icons/lucide/book-open',
    component: IconBookOpen,
    usageCount: 9,
    fileCount: 9,
    localNames: ['BookOpen', 'BookOpenIcon'],
  },
  {
    name: 'bot',
    importName: 'IconBot',
    importPath: 'virtual:icons/lucide/bot',
    component: IconBot,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Bot'],
  },
  {
    name: 'building-2',
    importName: 'IconBuilding2',
    importPath: 'virtual:icons/lucide/building-2',
    component: IconBuilding2,
    usageCount: 2,
    fileCount: 2,
    localNames: ['HubIcon'],
  },
  {
    name: 'calendar',
    importName: 'IconCalendar',
    importPath: 'virtual:icons/lucide/calendar',
    component: IconCalendar,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Calendar'],
  },
  {
    name: 'camera',
    importName: 'IconCamera',
    importPath: 'virtual:icons/lucide/camera',
    component: IconCamera,
    usageCount: 9,
    fileCount: 9,
    localNames: ['Camera'],
  },
  {
    name: 'check',
    importName: 'IconCheck',
    importPath: 'virtual:icons/lucide/check',
    component: IconCheck,
    usageCount: 11,
    fileCount: 11,
    localNames: ['Check', 'CheckIcon'],
  },
  {
    name: 'chevron-down',
    importName: 'IconChevronDown',
    importPath: 'virtual:icons/lucide/chevron-down',
    component: IconChevronDown,
    usageCount: 14,
    fileCount: 14,
    localNames: ['ChevronDown', 'ChevronDownIcon'],
  },
  {
    name: 'chevron-left',
    importName: 'IconChevronLeft',
    importPath: 'virtual:icons/lucide/chevron-left',
    component: IconChevronLeft,
    usageCount: 6,
    fileCount: 6,
    localNames: ['ChevronLeft', 'ChevronLeftIcon'],
  },
  {
    name: 'chevron-right',
    importName: 'IconChevronRight',
    importPath: 'virtual:icons/lucide/chevron-right',
    component: IconChevronRight,
    usageCount: 13,
    fileCount: 13,
    localNames: ['ChevronRight', 'ChevronRightIcon'],
  },
  {
    name: 'chevron-up',
    importName: 'IconChevronUp',
    importPath: 'virtual:icons/lucide/chevron-up',
    component: IconChevronUp,
    usageCount: 7,
    fileCount: 7,
    localNames: ['ChevronUp', 'ChevronUpIcon'],
  },
  {
    name: 'chevrons-up-down',
    importName: 'IconChevronsUpDown',
    importPath: 'virtual:icons/lucide/chevrons-up-down',
    component: IconChevronsUpDown,
    usageCount: 1,
    fileCount: 1,
    localNames: ['ChevronsUpDownIcon'],
  },
  {
    name: 'circle-alert',
    importName: 'IconCircleAlert',
    importPath: 'virtual:icons/lucide/circle-alert',
    component: IconCircleAlert,
    usageCount: 3,
    fileCount: 3,
    localNames: ['ExclamationCircle'],
  },
  {
    name: 'circle-check',
    importName: 'IconCircleCheck',
    importPath: 'virtual:icons/lucide/circle-check',
    component: IconCircleCheck,
    usageCount: 9,
    fileCount: 9,
    localNames: ['CheckCircle'],
  },
  {
    name: 'circle-dot-dashed',
    importName: 'IconCircleDotDashed',
    importPath: 'virtual:icons/lucide/circle-dot-dashed',
    component: IconCircleDotDashed,
    usageCount: 6,
    fileCount: 6,
    localNames: ['StatusIcon'],
  },
  {
    name: 'circle-minus',
    importName: 'IconCircleMinus',
    importPath: 'virtual:icons/lucide/circle-minus',
    component: IconCircleMinus,
    usageCount: 1,
    fileCount: 1,
    localNames: ['MinusCircle'],
  },
  {
    name: 'circle-plus',
    importName: 'IconCirclePlus',
    importPath: 'virtual:icons/lucide/circle-plus',
    component: IconCirclePlus,
    usageCount: 2,
    fileCount: 2,
    localNames: ['PlusCircle'],
  },
  {
    name: 'circle-user',
    importName: 'IconCircleUser',
    importPath: 'virtual:icons/lucide/circle-user',
    component: IconCircleUser,
    usageCount: 1,
    fileCount: 1,
    localNames: ['UserCircle'],
  },
  {
    name: 'circle-x',
    importName: 'IconCircleX',
    importPath: 'virtual:icons/lucide/circle-x',
    component: IconCircleX,
    usageCount: 9,
    fileCount: 9,
    localNames: ['XCircle'],
  },
  {
    name: 'cloud-download',
    importName: 'IconCloudDownload',
    importPath: 'virtual:icons/lucide/cloud-download',
    component: IconCloudDownload,
    usageCount: 1,
    fileCount: 1,
    localNames: ['CloudArrowDown'],
  },
  {
    name: 'cloud-upload',
    importName: 'IconCloudUpload',
    importPath: 'virtual:icons/lucide/cloud-upload',
    component: IconCloudUpload,
    usageCount: 2,
    fileCount: 2,
    localNames: ['CloudArrowUp'],
  },
  {
    name: 'copy',
    importName: 'IconCopy',
    importPath: 'virtual:icons/lucide/copy',
    component: IconCopy,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Square2Stack'],
  },
  {
    name: 'copy-check',
    importName: 'IconCopyCheck',
    importPath: 'virtual:icons/lucide/copy-check',
    component: IconCopyCheck,
    usageCount: 1,
    fileCount: 1,
    localNames: ['CopyCheck'],
  },
  {
    name: 'cpu',
    importName: 'IconCpu',
    importPath: 'virtual:icons/lucide/cpu',
    component: IconCpu,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Cpu'],
  },
  {
    name: 'database',
    importName: 'IconDatabase',
    importPath: 'virtual:icons/lucide/database',
    component: IconDatabase,
    usageCount: 2,
    fileCount: 2,
    localNames: ['DatabaseIcon'],
  },
  {
    name: 'dot',
    importName: 'IconDot',
    importPath: 'virtual:icons/lucide/dot',
    component: IconDot,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Dot'],
  },
  {
    name: 'ellipsis-vertical',
    importName: 'IconEllipsisVertical',
    importPath: 'virtual:icons/lucide/ellipsis-vertical',
    component: IconEllipsisVertical,
    usageCount: 1,
    fileCount: 1,
    localNames: ['EllipsisVertical'],
  },
  {
    name: 'eraser',
    importName: 'IconEraser',
    importPath: 'virtual:icons/lucide/eraser',
    component: IconEraser,
    usageCount: 2,
    fileCount: 2,
    localNames: ['Eraser', 'EraserIcon'],
  },
  {
    name: 'expand',
    importName: 'IconExpand',
    importPath: 'virtual:icons/lucide/expand',
    component: IconExpand,
    usageCount: 3,
    fileCount: 3,
    localNames: ['ArrowsPointingOut', 'Expand', 'ExpandIcon'],
  },
  {
    name: 'eye',
    importName: 'IconEye',
    importPath: 'virtual:icons/lucide/eye',
    component: IconEye,
    usageCount: 4,
    fileCount: 4,
    localNames: ['Eye', 'EyeIcon'],
  },
  {
    name: 'eye-off',
    importName: 'IconEyeOff',
    importPath: 'virtual:icons/lucide/eye-off',
    component: IconEyeOff,
    usageCount: 4,
    fileCount: 4,
    localNames: ['EyeOff', 'EyeOffIcon', 'EyeSlash'],
  },
  {
    name: 'file-text',
    importName: 'IconFileText',
    importPath: 'virtual:icons/lucide/file-text',
    component: IconFileText,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Document'],
  },
  {
    name: 'filter',
    importName: 'IconFilter',
    importPath: 'virtual:icons/lucide/filter',
    component: IconFilter,
    usageCount: 2,
    fileCount: 2,
    localNames: ['Funnel'],
  },
  {
    name: 'flame',
    importName: 'IconFlame',
    importPath: 'virtual:icons/lucide/flame',
    component: IconFlame,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Flame'],
  },
  {
    name: 'folder-open',
    importName: 'IconFolderOpen',
    importPath: 'virtual:icons/lucide/folder-open',
    component: IconFolderOpen,
    usageCount: 2,
    fileCount: 2,
    localNames: ['FolderOpen'],
  },
  {
    name: 'form-input',
    importName: 'IconFormInput',
    importPath: 'virtual:icons/lucide/form-input',
    component: IconFormInput,
    usageCount: 1,
    fileCount: 1,
    localNames: ['FormInputIcon'],
  },
  {
    name: 'funnel',
    importName: 'IconFunnel',
    importPath: 'virtual:icons/lucide/funnel',
    component: IconFunnel,
    usageCount: 2,
    fileCount: 2,
    localNames: ['Funnel', 'FunnelIcon'],
  },
  {
    name: 'funnel-x',
    importName: 'IconFunnelX',
    importPath: 'virtual:icons/lucide/funnel-x',
    component: IconFunnelX,
    usageCount: 1,
    fileCount: 1,
    localNames: ['FunnelX'],
  },
  {
    name: 'ghost',
    importName: 'IconGhost',
    importPath: 'virtual:icons/lucide/ghost',
    component: IconGhost,
    usageCount: 3,
    fileCount: 3,
    localNames: ['CubeTransparent', 'GhostIcon'],
  },
  {
    name: 'globe',
    importName: 'IconGlobe',
    importPath: 'virtual:icons/lucide/globe',
    component: IconGlobe,
    usageCount: 2,
    fileCount: 2,
    localNames: ['Globe', 'GlobeAlt'],
  },
  {
    name: 'globe-2',
    importName: 'IconGlobe2',
    importPath: 'virtual:icons/lucide/globe-2',
    component: IconGlobe2,
    usageCount: 2,
    fileCount: 2,
    localNames: ['GlobeAsiaAustralia'],
  },
  {
    name: 'grip-vertical',
    importName: 'IconGripVertical',
    importPath: 'virtual:icons/lucide/grip-vertical',
    component: IconGripVertical,
    usageCount: 1,
    fileCount: 1,
    localNames: ['GripVertical'],
  },
  {
    name: 'heart',
    importName: 'IconHeart',
    importPath: 'virtual:icons/lucide/heart',
    component: IconHeart,
    usageCount: 4,
    fileCount: 4,
    localNames: ['Heart'],
  },
  {
    name: 'image',
    importName: 'IconImage',
    importPath: 'virtual:icons/lucide/image',
    component: IconImage,
    usageCount: 14,
    fileCount: 14,
    localNames: ['ImageIcon', 'Photo'],
  },
  {
    name: 'image-up',
    importName: 'IconImageUp',
    importPath: 'virtual:icons/lucide/image-up',
    component: IconImageUp,
    usageCount: 1,
    fileCount: 1,
    localNames: ['ImageUp'],
  },
  {
    name: 'inbox',
    importName: 'IconInbox',
    importPath: 'virtual:icons/lucide/inbox',
    component: IconInbox,
    usageCount: 3,
    fileCount: 3,
    localNames: ['Inbox', 'TaskIcon'],
  },
  {
    name: 'info',
    importName: 'IconInfo',
    importPath: 'virtual:icons/lucide/info',
    component: IconInfo,
    usageCount: 7,
    fileCount: 7,
    localNames: ['InfoIcon', 'InformationCircle'],
  },
  {
    name: 'landmark',
    importName: 'IconLandmark',
    importPath: 'virtual:icons/lucide/landmark',
    component: IconLandmark,
    usageCount: 2,
    fileCount: 2,
    localNames: ['Building', 'BuildingLibrary'],
  },
  {
    name: 'languages',
    importName: 'IconLanguages',
    importPath: 'virtual:icons/lucide/languages',
    component: IconLanguages,
    usageCount: 13,
    fileCount: 13,
    localNames: ['Language', 'Languages', 'LanguagesIcon'],
  },
  {
    name: 'layers',
    importName: 'IconLayers',
    importPath: 'virtual:icons/lucide/layers',
    component: IconLayers,
    usageCount: 2,
    fileCount: 2,
    localNames: ['LayerIcon'],
  },
  {
    name: 'layers-3',
    importName: 'IconLayers3',
    importPath: 'virtual:icons/lucide/layers-3',
    component: IconLayers3,
    usageCount: 4,
    fileCount: 4,
    localNames: ['LayersIcon', 'Square3Stack3d'],
  },
  {
    name: 'layout-grid',
    importName: 'IconLayoutGrid',
    importPath: 'virtual:icons/lucide/layout-grid',
    component: IconLayoutGrid,
    usageCount: 9,
    fileCount: 9,
    localNames: ['LayoutGrid', 'ProjectIcon', 'Squares2x2'],
  },
  {
    name: 'leaf',
    importName: 'IconLeaf',
    importPath: 'virtual:icons/lucide/leaf',
    component: IconLeaf,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Leaf'],
  },
  {
    name: 'list',
    importName: 'IconList',
    importPath: 'virtual:icons/lucide/list',
    component: IconList,
    usageCount: 1,
    fileCount: 1,
    localNames: ['List'],
  },
  {
    name: 'list-plus',
    importName: 'IconListPlus',
    importPath: 'virtual:icons/lucide/list-plus',
    component: IconListPlus,
    usageCount: 3,
    fileCount: 3,
    localNames: ['ListPlus'],
  },
  {
    name: 'loader-circle',
    importName: 'IconLoaderCircle',
    importPath: 'virtual:icons/lucide/loader-circle',
    component: IconLoaderCircle,
    usageCount: 4,
    fileCount: 4,
    localNames: ['LoaderCircle', 'LoaderCircleIcon'],
  },
  {
    name: 'mailbox',
    importName: 'IconMailbox',
    importPath: 'virtual:icons/lucide/mailbox',
    component: IconMailbox,
    usageCount: 1,
    fileCount: 1,
    localNames: ['InboxArrowDown'],
  },
  {
    name: 'map',
    importName: 'IconMap',
    importPath: 'virtual:icons/lucide/map',
    component: IconMap,
    usageCount: 4,
    fileCount: 4,
    localNames: ['MapIcon'],
  },
  {
    name: 'map-pin',
    importName: 'IconMapPin',
    importPath: 'virtual:icons/lucide/map-pin',
    component: IconMapPin,
    usageCount: 11,
    fileCount: 11,
    localNames: ['FeatureIcon', 'MapPin', 'MapPinIcon'],
  },
  {
    name: 'menu',
    importName: 'IconMenu',
    importPath: 'virtual:icons/lucide/menu',
    component: IconMenu,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Menu'],
  },
  {
    name: 'minus',
    importName: 'IconMinus',
    importPath: 'virtual:icons/lucide/minus',
    component: IconMinus,
    usageCount: 1,
    fileCount: 1,
    localNames: ['MinusIcon'],
  },
  {
    name: 'monitor',
    importName: 'IconMonitor',
    importPath: 'virtual:icons/lucide/monitor',
    component: IconMonitor,
    usageCount: 1,
    fileCount: 1,
    localNames: ['ComputerDesktop'],
  },
  {
    name: 'moon',
    importName: 'IconMoon',
    importPath: 'virtual:icons/lucide/moon',
    component: IconMoon,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Moon'],
  },
  {
    name: 'octagon-minus',
    importName: 'IconOctagonMinus',
    importPath: 'virtual:icons/lucide/octagon-minus',
    component: IconOctagonMinus,
    usageCount: 1,
    fileCount: 1,
    localNames: ['OctagonMinusIcon'],
  },
  {
    name: 'panel-top-bottom-dashed',
    importName: 'IconPanelTopBottomDashed',
    importPath: 'virtual:icons/lucide/panel-top-bottom-dashed',
    component: IconPanelTopBottomDashed,
    usageCount: 2,
    fileCount: 2,
    localNames: ['QueueList'],
  },
  {
    name: 'pen',
    importName: 'IconPen',
    importPath: 'virtual:icons/lucide/pen',
    component: IconPen,
    usageCount: 3,
    fileCount: 3,
    localNames: ['PenIcon'],
  },
  {
    name: 'pen-line',
    importName: 'IconPenLine',
    importPath: 'virtual:icons/lucide/pen-line',
    component: IconPenLine,
    usageCount: 1,
    fileCount: 1,
    localNames: ['PenLineIcon'],
  },
  {
    name: 'pencil',
    importName: 'IconPencil',
    importPath: 'virtual:icons/lucide/pencil',
    component: IconPencil,
    usageCount: 2,
    fileCount: 2,
    localNames: ['Pencil'],
  },
  {
    name: 'plus',
    importName: 'IconPlus',
    importPath: 'virtual:icons/lucide/plus',
    component: IconPlus,
    usageCount: 5,
    fileCount: 5,
    localNames: ['Plus', 'PlusIcon'],
  },
  {
    name: 'plus-circle',
    importName: 'IconPlusCircle',
    importPath: 'virtual:icons/lucide/plus-circle',
    component: IconPlusCircle,
    usageCount: 1,
    fileCount: 1,
    localNames: ['PlusCircle'],
  },
  {
    name: 'refresh-cw',
    importName: 'IconRefreshCw',
    importPath: 'virtual:icons/lucide/refresh-cw',
    component: IconRefreshCw,
    usageCount: 1,
    fileCount: 1,
    localNames: ['ArrowPath'],
  },
  {
    name: 'replace',
    importName: 'IconReplace',
    importPath: 'virtual:icons/lucide/replace',
    component: IconReplace,
    usageCount: 2,
    fileCount: 2,
    localNames: ['ReplaceIcon'],
  },
  {
    name: 'rotate-ccw',
    importName: 'IconRotateCcw',
    importPath: 'virtual:icons/lucide/rotate-ccw',
    component: IconRotateCcw,
    usageCount: 2,
    fileCount: 2,
    localNames: ['RotateCcw', 'RotateCcwIcon'],
  },
  {
    name: 'save',
    importName: 'IconSave',
    importPath: 'virtual:icons/lucide/save',
    component: IconSave,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Save'],
  },
  {
    name: 'search',
    importName: 'IconSearch',
    importPath: 'virtual:icons/lucide/search',
    component: IconSearch,
    usageCount: 7,
    fileCount: 7,
    localNames: ['MagnifyingGlass', 'Search', 'SearchIcon'],
  },
  {
    name: 'settings',
    importName: 'IconSettings',
    importPath: 'virtual:icons/lucide/settings',
    component: IconSettings,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Cog6Tooth'],
  },
  {
    name: 'shield',
    importName: 'IconShield',
    importPath: 'virtual:icons/lucide/shield',
    component: IconShield,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Shield'],
  },
  {
    name: 'shield-check',
    importName: 'IconShieldCheck',
    importPath: 'virtual:icons/lucide/shield-check',
    component: IconShieldCheck,
    usageCount: 3,
    fileCount: 3,
    localNames: ['ShieldCheckIcon'],
  },
  {
    name: 'shrink',
    importName: 'IconShrink',
    importPath: 'virtual:icons/lucide/shrink',
    component: IconShrink,
    usageCount: 3,
    fileCount: 3,
    localNames: ['ArrowsPointingIn', 'Shrink', 'ShrinkIcon'],
  },
  {
    name: 'skull',
    importName: 'IconSkull',
    importPath: 'virtual:icons/lucide/skull',
    component: IconSkull,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Skull'],
  },
  {
    name: 'smile',
    importName: 'IconSmile',
    importPath: 'virtual:icons/lucide/smile',
    component: IconSmile,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Smile'],
  },
  {
    name: 'square-pen',
    importName: 'IconSquarePen',
    importPath: 'virtual:icons/lucide/square-pen',
    component: IconSquarePen,
    usageCount: 10,
    fileCount: 10,
    localNames: ['PencilSquare'],
  },
  {
    name: 'star',
    importName: 'IconStar',
    importPath: 'virtual:icons/lucide/star',
    component: IconStar,
    usageCount: 3,
    fileCount: 3,
    localNames: ['Star'],
  },
  {
    name: 'swatch-book',
    importName: 'IconSwatchBook',
    importPath: 'virtual:icons/lucide/swatch-book',
    component: IconSwatchBook,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Swatch'],
  },
  {
    name: 'table-2',
    importName: 'IconTable2',
    importPath: 'virtual:icons/lucide/table-2',
    component: IconTable2,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Table2'],
  },
  {
    name: 'tag',
    importName: 'IconTag',
    importPath: 'virtual:icons/lucide/tag',
    component: IconTag,
    usageCount: 2,
    fileCount: 2,
    localNames: ['Tag', 'TagIcon'],
  },
  {
    name: 'tags',
    importName: 'IconTags',
    importPath: 'virtual:icons/lucide/tags',
    component: IconTags,
    usageCount: 4,
    fileCount: 4,
    localNames: ['TagsIcon'],
  },
  {
    name: 'telescope',
    importName: 'IconTelescope',
    importPath: 'virtual:icons/lucide/telescope',
    component: IconTelescope,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Telescope'],
  },
  {
    name: 'trash-2',
    importName: 'IconTrash2',
    importPath: 'virtual:icons/lucide/trash-2',
    component: IconTrash2,
    usageCount: 11,
    fileCount: 11,
    localNames: ['Trash', 'Trash2', 'Trash2Icon'],
  },
  {
    name: 'triangle-alert',
    importName: 'IconTriangleAlert',
    importPath: 'virtual:icons/lucide/triangle-alert',
    component: IconTriangleAlert,
    usageCount: 6,
    fileCount: 6,
    localNames: ['AlertTriangleIcon', 'ExclamationTriangle', 'TriangleAlert'],
  },
  {
    name: 'trophy',
    importName: 'IconTrophy',
    importPath: 'virtual:icons/lucide/trophy',
    component: IconTrophy,
    usageCount: 2,
    fileCount: 2,
    localNames: ['Trophy'],
  },
  {
    name: 'type',
    importName: 'IconType',
    importPath: 'virtual:icons/lucide/type',
    component: IconType,
    usageCount: 4,
    fileCount: 4,
    localNames: ['Type', 'TypeIcon'],
  },
  {
    name: 'undo-2',
    importName: 'IconUndo2',
    importPath: 'virtual:icons/lucide/undo-2',
    component: IconUndo2,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Undo2'],
  },
  {
    name: 'user-minus',
    importName: 'IconUserMinus',
    importPath: 'virtual:icons/lucide/user-minus',
    component: IconUserMinus,
    usageCount: 1,
    fileCount: 1,
    localNames: ['UserMinusIcon'],
  },
  {
    name: 'user-plus',
    importName: 'IconUserPlus',
    importPath: 'virtual:icons/lucide/user-plus',
    component: IconUserPlus,
    usageCount: 2,
    fileCount: 2,
    localNames: ['UserPlus', 'UserPlusIcon'],
  },
  {
    name: 'users',
    importName: 'IconUsers',
    importPath: 'virtual:icons/lucide/users',
    component: IconUsers,
    usageCount: 3,
    fileCount: 3,
    localNames: ['UserGroup'],
  },
  {
    name: 'users-round',
    importName: 'IconUsersRound',
    importPath: 'virtual:icons/lucide/users-round',
    component: IconUsersRound,
    usageCount: 3,
    fileCount: 3,
    localNames: ['OrganisationIcon'],
  },
  {
    name: 'wrench',
    importName: 'IconWrench',
    importPath: 'virtual:icons/lucide/wrench',
    component: IconWrench,
    usageCount: 1,
    fileCount: 1,
    localNames: ['Wrench'],
  },
  {
    name: 'x',
    importName: 'IconX',
    importPath: 'virtual:icons/lucide/x',
    component: IconX,
    usageCount: 28,
    fileCount: 28,
    localNames: ['X', 'XIcon', 'XMark'],
  },
  {
    name: 'zap',
    importName: 'IconZap',
    importPath: 'virtual:icons/lucide/zap',
    component: IconZap,
    usageCount: 2,
    fileCount: 2,
    localNames: ['Bolt', 'Zap'],
  },
]

export const TOTAL_IMPORT_SITES = ICON_USAGES.reduce(
  (sum, icon) => sum + icon.usageCount,
  0,
)

export const ICON_USAGE_EXPORT = [
  'export const LUCIDE_ICON_USAGE = {',
  ...ICON_USAGES.map(
    icon =>
      `  '${icon.name}': { importName: '${icon.importName}', importPath: '${icon.importPath}', usageCount: ${icon.usageCount}, fileCount: ${icon.fileCount} },`,
  ),
  '} as const',
].join('\n')
