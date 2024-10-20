import type { IconSource } from '@steeze-ui/heroicons';

export type ResourceType = 'organisation' | 'project' | 'layer' | 'feature';
export type SourceLang = 'en'
export type TargetLang = 'zh-hant' | 'zh-hans';
export type ResourceToEntity = Record<ResourceType, Entity[]>;
export type ResourceToText = Record<ResourceType, string>;
export type FilterableResourceType = Exclude<ResourceType, 'feature'>;
export type FilterableResourceToEntityId = Record<FilterableResourceType, string[]>;
export type Id = string;
export type Code = string;
export type Ref = string;
export type Entity = { id: Id; ref: Ref; name: string; nameShort: string; description: string };
export type ApiEntity = Entity & {
  code?: Code;
  properties?: { title: string; description: string };
};
export type EntityWithData<T> = Entity & { data: T };
export type FacetType = 'core' | 'address' | 'images';
export type ResourceToNavItem = Record<ResourceType, NavItem>;

export type Router = {
  resource: ResourceType | false;
  entity: Ref | false;
  facet: FacetType | false;
};
export type NavItem = {
  name: string;
  icon: IconSource;
  seq: number;
  path: string;
};
