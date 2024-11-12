import type { IconSource } from '@steeze-ui/heroicons';
// ZOD Schemas
import { z } from 'zod';
import {
  FeatureI18nInsert,
  FeatureI18nUpdate,
  FeatureInsert,
  FeatureInsertAPI,
  FeaturePropertyUpdateAPI,
  FeaturePropertyInsertAPI,
  FeaturePropertyUpdate,
  FeaturePropertyInsert,
  FeaturePropertyI18nInsert,
  FeaturePropertyI18nUpdate,
  FeatureUpdate,
  FeatureUpdateAPI,
  fieldDiscriminators,
  LayerI18nInsert,
  LayerI18nUpdate,
  LayerInsert,
  LayerInsertAPI,
  LayerPatch,
  LayerPropertyInsert,
  LayerPropertyUpdate,
  LayerUpdate,
  LayerUpdateAPI,
  OrganisationI18nInsert,
  OrganisationI18nUpdate,
  OrganisationInsert,
  OrganisationInsertAPI,
  OrganisationPatch,
  OrganisationRoleInsert,
  OrganisationRoleUpdateExtra,
  OrganisationUpdate,
  OrganisationUpdateAPI,
  ProjectI18nInsert,
  ProjectI18nUpdate,
  ProjectInsert,
  ProjectInsertAPI,
  ProjectPatch,
  ProjectRoleInsertExtra,
  ProjectRoleUpdateExtra,
  ProjectUpdate,
  ProjectUpdateAPI,
  PropertyI18nInsert,
  PropertyI18nUpdate,
  PropertyInsert,
  PropertyInsertAPI,
  PropertyUpdate,
  PropertyUpdateAPI,
  PropertyValueI18nInsert,
  PropertyValueI18nUpdate,
  PropertyValueInsert,
  PropertyValueInsertAPI,
  PropertyValueUpdate,
  PropertyValueUpdateAPI,
  UserBase,
} from '$lib/db/zod';
// Components
import CustomField from '$lib/components/forms/FormFieldProperties.svelte';
import InputField from '$lib/components/forms/FormFieldInput.svelte';
import TextareaField from '$lib/components/forms/FormFieldTextarea.svelte';
import SelectField from '$lib/components/forms/FormFieldSelect.svelte';
import RangeField from '$lib/components/forms/FormFieldRange.svelte';
import TagsField from '$lib/components/forms/FormFieldTags.svelte';
import UsersField from '$lib/components/forms/FormFieldUsers.svelte';
import ComplexField from '$lib/components/forms/FormFieldComplex.svelte';
import CheckboxField from '$lib/components/forms/FormFieldCheckbox.svelte';

// HTML
export type InputType = 'text' | 'number' | 'email' | 'password';

// BRANDED
export type ResourceType = 'organisation' | 'project' | 'layer' | 'feature';
export type FalsableResourceType = ResourceType | false;
export type SourceLang = 'en';
export type TargetLang = 'zh-hant' | 'zh-hans';
export type LanguageTag = SourceLang | TargetLang | 'core';
export type ResourceToEntity = Record<ResourceType, Entity[]>;
export type ResourceToText = Record<ResourceType, string>;
export type FilterableResourceType = Exclude<ResourceType, 'feature'>;
export type FilterableResourceToEntityId = Record<FilterableResourceType, string[]>;
// (Nano) unique identifier
export type Id = string;
// Human-readable unique identifier
export type Code = string;
// How the object is publicly addressed
export type Ref = Id | Code;
// Property name in API or Database
export type Key = string;
export type FalsableRef = Ref | false;
export type Entity = { id: Id; ref: Ref; name: string; nameShort: string; description: string };
export type ApiEntity = Entity & {
  code?: Code;
  title?: string;
};
export type EntityWithData<T> = Entity & { data: T };
export type FacetType = 'core' | 'address' | 'images' | 'fields';
export type FalsableFacetType = FacetType | false;
export type ResourceToNavItem = Record<ResourceType, NavItem>;

export type Router = {
  resource: FalsableResourceType;
  entity: FalsableRef;
  facet: FalsableFacetType;
};

export type ResourceRouter = Router & {
  resource: ResourceType;
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

export const jsonFieldKeys = [
  'config',
  'geometry',
  'properties',
  'addressProperties',
  'metadata'
] as const;
export type JSONFieldKey = (typeof jsonFieldKeys)[number];
export type FormFieldDefinition = {
  label?: string;
  placeholder?: string;
  component?: FieldComponentType;
  isArray: boolean;
  isTranslated?: boolean;
};
export type FormFieldExtendedDefinition = FormFieldDefinition & {
  values?: readonly string[];
  inputType?: InputType;
  isNested?: boolean;
  showForComponent?: FieldComponentType[];
};
export type FormFieldArrayDefinition = {
  isArray: true;
  discriminators: {
    key: string;
    values: readonly string[];
    specs: Record<Exclude<FieldDiscriminator, 'display'>, Record<Key, FormFieldExtendedDefinition>>;
  };
};
export type FormField = Record<string, FormFieldDefinition>;
export type FormFieldArray = Record<string, FormFieldArrayDefinition>;
export type FormFieldConfig = Record<Key, FormField | FormFieldArray>;

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
export type FormRelatedUsers<T> = T[];
export type FormRelatedProperties<T> = T[];

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

// organisationI18n, but without organisationId - for use in API insertions
export type NewOrganisationI18n = z.infer<typeof OrganisationI18nInsert>;
// Same as NewOrganisationI18n, but with the organisationId - for use in API updates
export type OrganisationI18n = z.infer<typeof OrganisationI18nUpdate>;

// organisationRole, but without organisationId - for use in API insertions
export type NewOrganisationRole = z.infer<typeof OrganisationRoleInsert>;
// Same as NewOrganisationRole, but with the organisationId - for use in API updates
export type OrganisationRole = z.infer<typeof OrganisationRoleUpdateExtra>;

// Organisation where all fields are optional, no relations
export type OrganisationPartialUpdate = z.infer<typeof OrganisationPatch>;

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

// projectI18n, but without projectId and lang - for use in API insertions
export type NewProjectI18n = z.infer<typeof ProjectI18nInsert>;
// Same as NewProjectI18n, but with the projectId - for use in API updates
export type ProjectI18n = z.infer<typeof ProjectI18nUpdate>;

// projectRole, but without projectId and userId - for use in API insertions
export type NewProjectRole = z.infer<typeof ProjectRoleInsertExtra>;
// Same as NewProjectRole, but with the projectId - for use in API updates
export type ProjectRole = z.infer<typeof ProjectRoleUpdateExtra>;

// Project where all fields are optional, no relations
export type ProjectPartialUpdate = z.infer<typeof ProjectPatch>;

/* ----------------- */
// PROJECTS : FIELDS
/* -------- */

export type FieldDiscriminator = (typeof fieldDiscriminators)[number];

export const fieldComponentTypes = [
  'SelectField',
  'RangeField',
  'InputField',
  'TextareaField',
  'TagsField',
  'ComplexField',
  'CheckboxField'
] as const;
export const classifierComponentTypes = ['SelectField', 'RangeField'] as const;
export const specifierComponentTypes = ['InputField', 'TextareaField', 'TagsField'] as const;
export const displayComponentTypes = ['InputField'] as const;
export type FieldComponentType = (typeof fieldComponentTypes)[number];
export type FieldComponent =
  | typeof SelectField
  | typeof RangeField
  | typeof InputField
  | typeof TextareaField
  | typeof TagsField
  | typeof UsersField
  | typeof CustomField
  | typeof CheckboxField
  | typeof ComplexField;

/* ----------------- */
// PROJECTS : FIELDS : INTERMEDIATE VALUE
/* -------- */

export type IntermediateValue = {
  id: string;
  rank: number;
  en: string;
  enGen: boolean;
  'zh-hans': string;
  'zh-hansGen': boolean;
  'zh-hant': string;
  'zh-hantGen': boolean;
};

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
export type NewLayerI18n = z.infer<typeof LayerI18nInsert>;
// Same as NewLayerI18n, but with the layerId - for use in API updates
export type LayerI18n = z.infer<typeof LayerI18nUpdate>;

// layerProperty, but without layerId and propertyId - for use in API insertions
export type NewLayerProperty = z.infer<typeof LayerPropertyInsert>;
// Same as NewLayerProperty, but with the layerId - for use in API updates
export type LayerProperty = z.infer<typeof LayerPropertyUpdate>;

// Layer where all fields are optional, no relations
export type LayerPartialUpdate = z.infer<typeof LayerPatch>;

export type LayerMetadata = {
  defaultEnabled: boolean; // true
  mlCluster?: boolean; // false
  mlClusterRadius?: number; // 50
  mlClusterMaxZoom?: number; // 14
  mlClusterMinPoints?: number; // 2
};

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

// featureI18n, but without featureId - for use in API insertions
export type NewFeatureI18n = z.infer<typeof FeatureI18nInsert>;
// Same as NewFeatureI18n, but with the featureId - for use in API updates
export type FeatureI18n = z.infer<typeof FeatureI18nUpdate>;

/* ----------------- */
// FEATURES : PROPERTIES
/* -------- */

// FeatureProperty with all fields, including translations
export type FeatureProperty = z.infer<typeof FeaturePropertyUpdateAPI>;
// Like FeatureProperty, but for inserting a new feature property
export type NewFeatureProperty = z.infer<typeof FeaturePropertyInsertAPI>;
// FeatureProperty without relations, for use in updating a feature property
export type FeaturePropertyDB = z.infer<typeof FeaturePropertyUpdate>;
// FeatureProperty without relations, for use in inserting a new feature property
export type NewFeaturePropertyDB = z.infer<typeof FeaturePropertyInsert>;

// featurePropertyI18n, but without featurePropertyId - for use in API insertions
export type NewFeaturePropertyI18n = z.infer<typeof FeaturePropertyI18nInsert>;
// Same as NewFeaturePropertyI18n, but with the featurePropertyId - for use in API updates
export type FeaturePropertyI18n = z.infer<typeof FeaturePropertyI18nUpdate>;

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

/* ----------------- */
// PROPERTIES
/* -------- */

// Property with all fields, including translations and values
export type Property = z.infer<typeof PropertyUpdateAPI>;
// Like Property, but without the propertyId in translations and values
export type NewProperty = z.infer<typeof PropertyInsertAPI>;
// Property without relations, for use in updating a property
export type PropertyDB = z.infer<typeof PropertyUpdate>;
// Property without relations, for use in inserting a new property
export type NewPropertyDB = z.infer<typeof PropertyInsert>;

// PropertyI18n, but without propertyId and langCode - for use in API insertions
export type NewPropertyI18n = z.infer<typeof PropertyI18nInsert>;
// Same as NewPropertyI18n, but with the propertyId - for use in API updates
export type PropertyI18n = z.infer<typeof PropertyI18nUpdate>;

/* ----------------- */
// PROPERTY VALUES
/* -------- */

// PropertyValue with all fields, including translations
export type PropertyValue = z.infer<typeof PropertyValueUpdateAPI>;
// Like PropertyValue, but for inserting a new property value
export type NewPropertyValue = z.infer<typeof PropertyValueInsertAPI>;
// PropertyValue without relations, for use in updating a property value
export type PropertyValueDB = z.infer<typeof PropertyValueUpdate>;
// PropertyValue without relations, for use in inserting a new property value
export type NewPropertyValueDB = z.infer<typeof PropertyValueInsert>;

// PropertyValueI18n, but without propertyValueId and langCode - for use in API insertions
export type NewPropertyValueI18n = z.infer<typeof PropertyValueI18nInsert>;
// Same as NewPropertyValueI18n, but with the propertyValueId - for use in API updates
export type PropertyValueI18n = z.infer<typeof PropertyValueI18nUpdate>;
