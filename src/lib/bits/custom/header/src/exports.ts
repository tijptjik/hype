export { default as Root } from './components/HeaderRoot.svelte'
export { default as Breadcrumbs } from './components/HeaderBreadcrumbs.svelte'
export { default as Icon } from './components/HeaderIcon.svelte'
export { default as Title } from './components/HeaderTitle.svelte'
export { default as Subtitle } from './components/HeaderSubtitle.svelte'

export type {
  HeaderRootProps as RootProps,
  HeaderIconProps as IconProps,
  HeaderTitleProps as TitleProps,
  HeaderSubtitleProps as SubtitleProps,
} from './headerPrimitive.types.js'
