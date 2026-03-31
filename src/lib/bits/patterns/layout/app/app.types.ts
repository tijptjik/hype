// SVELTE
import type { Component, Snippet } from 'svelte'
// QUERY
import type { QueryClient } from '@tanstack/svelte-query'
// CUSTOM
import type { LoadScreenColor, LoadScreenSurface } from '$lib/bits/custom/loading'
// LAYOUT
import type { HeaderProps } from '../header'
// TYPES
import type { LocaleKey } from '$lib/types'

export interface AppSocialImage {
  image: string
  width: string
  height: string
}

export interface AppHeadMetaProps {
  title: string
  siteName: string
  siteDescription: string
  socialImage: AppSocialImage
}

export interface AppHeadFontsProps {
  localeKey: LocaleKey
}

export interface AppHeadRootProps extends AppHeadMetaProps, AppHeadFontsProps {
  windowWidth?: number
}

export interface AppShellProps {
  queryClient: QueryClient
  localeKey: LocaleKey
  isReady: boolean
  pendingColor?: LoadScreenColor
  pendingSurface?: LoadScreenSurface
  children: Snippet
}

export interface AppProps extends AppHeadRootProps, AppShellProps {}

export interface AdminShellProps {
  minWidth: number
  title: string
  description: string
  widthLabel: string
  icon?: Component<Record<string, unknown>> | null
  isReady: boolean
  isPrimaryPanelAutoHide?: boolean
  isAdminPanelOpen?: boolean
  onOpenVisual?: () => void
  onCloseVisual?: () => void
  headerProps: HeaderProps
  sidebar: Snippet
  settings: Snippet
  children: Snippet
}
