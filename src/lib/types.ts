import type { IconSource } from '@steeze-ui/heroicons';
// ZOD Schemas
import { z } from 'zod';
import {
  UserBase,
  OrganisationInsertAPI,
  OrganisationI18nAPI,
  OrganisationRoleBase,
  OrganisationI18nBase,
  OrganisationRoleAPI,
  OrganisationUpdateAPI,
  OrganisationInsert,
  OrganisationUpdate,
  OrganisationI18nWithoutPK,
  OrganisationRoleWithoutPK,
  ProjectI18nBase,
  ProjectRoleBase,
  ProjectInsertAPI,
  ProjectUpdateAPI,
  ProjectInsert,
  ProjectUpdate,
  ProjectI18nAPI,
  ProjectI18nWithoutPK,
  ProjectRoleAPI,
  ProjectRoleWithoutPK,
  LayerI18nBase,
  LayerInsertAPI,
  LayerUpdateAPI,
  LayerInsert,
  LayerUpdate,
  LayerI18nAPI,
  LayerI18nWithoutPK,
  FeatureInsertAPI,
  FeatureUpdateAPI,
  FeatureInsert,
  FeatureUpdate
} from '$lib/db/zod';
// Components
import FormInputField from '$lib/components/forms/FormInputField.svelte';
import FormTextField from '$lib/components/forms/FormTextField.svelte';
import FormUserCard from '$lib/components/forms/FormUserCard.svelte';

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
  [key: string]: boolean | { columns: NestedRelations } | { with: NestedRelations };
};

export type FormFieldConfig = Record<string, FormField>;
export type FormField = Record<string, FormFieldDefinition>;
export type FormFieldDefinition = { label: string; component: FormFieldComponent };
export type FormFieldComponent = typeof FormInputField | typeof FormTextField | typeof FormUserCard;

/* ----------------- */
// SCHEMA TYPES
/* -------- */

export type Field = keyof Organisation | keyof Project | keyof Layer | keyof Feature;
export type Resource = Organisation | Project | Layer | Feature;
export type ResourceDB = OrganisationDB | ProjectDB | LayerDB | FeatureDB;

// RELATED TYPES
export type FormTranslations<T> = {
  'zh-hant': T;
  'zh-hans': T;
};
export type FormRelatedUsers<T> = Record<Id, T>;

/* ----------------- */
// USERS
/* -------- */

export type User = z.infer<typeof UserBase>;

/* ----------------- */
// ORGANISATIONS
/* -------- */

// Organisation with all fields, including userRoles & translations, and User
export type Organisation = z.infer<typeof OrganisationUpdateAPI>;
// Like Organisation, but without the organisationId in userRoles and translations
export type NewOrganisation = z.infer<typeof OrganisationInsertAPI>;
// Organisation without relations, for use in updating an organisation
export type OrganisationDB = z.infer<typeof OrganisationUpdate>;
// Organisation without relations, for use in inserting a new organisation
export type NewOrganisationDB = z.infer<typeof OrganisationInsert>;

// organisationI18n, but without organisationId and langCode - for use in API insertions
export type NewOrganisationI18n = z.infer<typeof OrganisationI18nAPI>;
// Same as NewOrganisationI18n, but with the organisationId - for use in API updates
export type OrganisationI18n = z.infer<typeof OrganisationI18nWithoutPK>;
// Database representation of OrganisationI18n, so with organisationId and langCode
export type OrganisationI18nDB = z.infer<typeof OrganisationI18nBase>;

// organisationRole, but without organisationId and userId - for use in API insertions
export type NewOrganisationRole = z.infer<typeof OrganisationRoleAPI>;
// Same as NewOrganisationRole, but with the organisationId - for use in API updates
export type OrganisationRole = z.infer<typeof OrganisationRoleWithoutPK>;
// Database representation of OrganisationRole, so with organisationId and userId
export type OrganisationRoleDB = z.infer<typeof OrganisationRoleBase>;

/* ----------------- */
// PROJECTS
/* -------- */

// Project with all fields, including maintainerRoles & translations, and User
export type Project = z.infer<typeof ProjectUpdateAPI>;
// Like Project, but without the projectId in maintainerRoles and translations
export type NewProject = z.infer<typeof ProjectInsertAPI>;
// Project without relations, for use in updating a project
export type ProjectDB = z.infer<typeof ProjectUpdate>;
// Project without relations, for use in inserting a new project
export type NewProjectDB = z.infer<typeof ProjectInsert>;

// projectI18n, but without projectId and langCode - for use in API insertions
export type NewProjectI18n = z.infer<typeof ProjectI18nAPI>;
// Same as NewProjectI18n, but with the projectId - for use in API updates
export type ProjectI18n = z.infer<typeof ProjectI18nWithoutPK>;
// Database representation of ProjectI18n, so with projectId and langCode
export type ProjectI18nDB = z.infer<typeof ProjectI18nBase>;

// projectRole, but without projectId and userId - for use in API insertions
export type NewProjectRole = z.infer<typeof ProjectRoleAPI>;
// Same as NewProjectRole, but with the projectId - for use in API updates
export type ProjectRole = z.infer<typeof ProjectRoleWithoutPK>;
// Database representation of ProjectRole, so with projectId and userId
export type ProjectRoleDB = z.infer<typeof ProjectRoleBase>;

/* ----------------- */
// LAYERS
/* -------- */

// Layer with all fields, including translations
export type Layer = z.infer<typeof LayerUpdateAPI>;
// Like Layer, but without the layerId in translations
export type NewLayer = z.infer<typeof LayerInsertAPI>;
// Layer without relations, for use in updating a layer
export type LayerDB = z.infer<typeof LayerUpdate>;
// Layer without relations, for use in inserting a new layer
export type NewLayerDB = z.infer<typeof LayerInsert>;

// layerI18n, but without layerId and langCode - for use in API insertions
export type NewLayerI18n = z.infer<typeof LayerI18nAPI>;
// Same as NewLayerI18n, but with the layerId - for use in API updates
export type LayerI18n = z.infer<typeof LayerI18nWithoutPK>;
// Database representation of LayerI18n, so with layerId and langCode
export type LayerI18nDB = z.infer<typeof LayerI18nBase>;

/* ----------------- */
// FEATURES
/* -------- */

// Feature with all fields
export type Feature = z.infer<typeof FeatureUpdateAPI>;
// Like Feature, but for inserting a new feature
export type NewFeature = z.infer<typeof FeatureInsertAPI>;
// Feature without relations, for use in updating a feature
export type FeatureDB = z.infer<typeof FeatureUpdate>;
// Feature without relations, for use in inserting a new feature
export type NewFeatureDB = z.infer<typeof FeatureInsert>;

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