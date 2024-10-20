import type { IconSource } from '@steeze-ui/heroicons';
// ZOD Schemas
import { z } from 'zod';
import {
  UserBase,
  OrganisationReqBody,
  NewOrganisationReqBody,
  OrganisationI18nReqBase,
  ProjectReqBody,
  NewProjectReqBody,
  ProjectI18nReqBase,
  LayerReqBody,
  NewLayerReqBody,
  LayerI18nReqBase,
  FeatureReqBody,
  NewFeatureReqBody,
  OrganisationRoleReqBase,
  OrganisationRoleBase,
  OrganisationI18nBase
} from '$lib/db/zod';

export type ResourceType = 'organisation' | 'project' | 'layer' | 'feature';
export type SourceLang = 'en';
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

export type NestedRelations = {
  [key: string]: boolean | { with: NestedRelations };
};

/* ----------------- */
// SCHEMA TYPES
/* -------- */

/* ----------------- */
// USERS
/* -------- */

export type User = z.infer<typeof UserBase>;

/* ----------------- */
// ORGANISATIONS
/* -------- */

export type Organisation = z.infer<typeof OrganisationReqBody>;
export type NewOrganisation = z.infer<typeof NewOrganisationReqBody>;
export type OrganisationI18n = z.infer<typeof OrganisationI18nReqBase>;
export type OrganisationI18nKeyed = z.infer<typeof OrganisationI18nBase>;
export type OrganisationRole = z.infer<typeof OrganisationRoleReqBase>;
export type OrganisationRoleKeyed = z.infer<typeof OrganisationRoleBase>;

/* ----------------- */
// PROJECTS
/* -------- */

export type Project = z.infer<typeof ProjectReqBody>;
export type NewProject = z.infer<typeof NewProjectReqBody>;
export type ProjectI18n = z.infer<typeof ProjectI18nReqBase>;

/* ----------------- */
// LAYERS
/* -------- */

export type Layer = z.infer<typeof LayerReqBody>;
export type NewLayer = z.infer<typeof NewLayerReqBody>;
export type LayerI18n = z.infer<typeof LayerI18nReqBase>;

/* ----------------- */
// FEATURES
/* -------- */

export type Feature = z.infer<typeof FeatureReqBody>;
export type NewFeature = z.infer<typeof NewFeatureReqBody>;


/* ----------------- */
// FEATURES : PROPERTIES
/* -------- */

interface FeatureProperties {
  // Title
  title: string;
  'title__zh-hant': string;
  'title__zh-hans': string;
  titleGen: boolean;
  'titleGen__zh-hant': boolean;
  'titleGen__zh-hans': boolean;

  // Description
  description?: string;
  'description__zh-hant'?: string;
  'description__zh-hans'?: string;
  descriptionGen?: boolean;
  'descriptionGen__zh-hant'?: boolean;
  'descriptionGen__zh-hans'?: boolean;
  // Misc
  grade?: number; // Value between 1 and 5

  // Markers
  markerSize?: string; // small, medium, large
  markerSymbol?: string;
  markerColor?: string; // "#fff"
}

export interface GhostSignsFeatureProperties extends FeatureProperties {
  // Description
  graphemes?: string; // Literal

  // Misc
  size?: string; // large, medium, small
  material?: string; // Painted on Cement, Painted on Metal, Painted on Brick, Painted on Tile, Painted over, Acrylic, Metal, Wood, Terrazzo, Stone, Molded Cement, Zinc Stenciled
  visibility?: string; // Revenant, Physical, Palimpsest, Uncovering
}

/* ----------------- */
// FEATURES : ADDRESS
/* -------- */

export interface AddressProperties {
  // Metrics
  distanceFromPoint?: number;

  // Display Address
  formattedAddress?: string;
  formattedAddressGen?: boolean;
  'formattedAddress__zh-hant'?: string;
  'formattedAddressGen__zh-hant'?: boolean;
  'formattedAddress__zh-hans'?: string;
  'formattedAddressGen__zh-hans'?: boolean;

  // Address Components
  plusCode?: string;
  'plusCode__zh-hant'?: string;
  'plusCode__zh-hans'?: string;

  subPremise?: string;
  'subPremise__zh-hant'?: string;
  'subPremise__zh-hans'?: string;

  premise?: string;
  'premise__zh-hant'?: string;
  'premise__zh-hans'?: string;

  streetNumber?: string;
  'streetNumber__zh-hant'?: string;
  'streetNumber__zh-hans'?: string;

  route?: string;
  'route__zh-hant'?: string;
  'route__zh-hans'?: string;

  intersection?: string;
  'intersection__zh-hant'?: string;
  'intersection__zh-hans'?: string;

  neighbourhood?: string;
  'neighbourhood__zh-hant'?: string;
  'neighbourhood__zh-hans'?: string;

  administrativeAreaLevel1?: string;
  'administrativeAreaLevel1__zh-hant'?: string;
  'administrativeAreaLevel1__zh-hans'?: string;

  country?: string;
  'country__zh-hant'?: string;
  'country__zh-hans'?: string;

  // Identifier
  googlePlaceId?: string;

  // Metadata
  addressGeocoder: string; // The Geocoder used are the source
  addressReverseGen: boolean; // Were the address components generator by a Reverse Geocoder
  addressForwardGen: boolean; // Were the address components generated by a Forward Geocoder
}


