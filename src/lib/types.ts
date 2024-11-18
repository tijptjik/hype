// ZOD SCHEMAS
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
  FeaturePatch
} from '$lib/db/zod';
// COMPONENTS
import CustomField from '$lib/components/forms/fields/Properties.svelte';
import InputField from '$lib/components/forms/fields/Input.svelte';
import TextareaField from '$lib/components/forms/fields/Textarea.svelte';
import SelectField from '$lib/components/forms/fields/Select.svelte';
import RangeField from '$lib/components/forms/fields/Range.svelte';
import UsersField from '$lib/components/forms/fields/Users.svelte';
import ListField from '$lib/components/forms/fields/List.svelte';
import ToggleField from '$lib/components/forms/fields/Toggle.svelte';
import AddressActions from '$lib/components/forms/actions/Address.svelte';
import FeatureActions from '$lib/components/forms/actions/Feature.svelte';
import UserActions from '$lib/components/forms/actions/User.svelte';
// TYPES
import type { SuperForm } from 'sveltekit-superforms';
import type { IconSource } from '@steeze-ui/heroicons';
import type { Component } from 'svelte';
import type {
  InputConstraints,
  InputConstraint,
  ValidationErrors
} from 'sveltekit-superforms';
import type { Writable } from 'drizzle-orm/utils';
import type {
  LayerForm,
  OrganisationForm,
  ProjectForm,
  FeatureForm
} from './context/forms.svelte';
import type { SuperValidated } from 'sveltekit-superforms';

// HTML
export type InputType = 'text' | 'number' | 'email' | 'password';

// BRANDED
export type ResourceType = 'organisation' | 'project' | 'layer' | 'feature';
export type FalsableResourceType = ResourceType | false;
export type SourceLang = 'en';
export type TargetLang = 'zh-hant' | 'zh-hans';
export type LanguageTag = SourceLang | TargetLang | 'core';
export type ResourceToEntity = {
  organisation: EntityWithData<Organisation>[];
  project: EntityWithData<Project>[];
  layer: EntityWithData<Layer>[];
  feature: EntityWithData<Feature>[];
};
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
export type Entity = {
  id: Id;
  ref: Ref;
  name: string;
  nameShort: string;
  description: string;
  address?: string;
};
export type ApiEntity = Entity & {
  code?: Code;
  title?: string;
  addressProperties?: AddressProperties;
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
  isNested: boolean;
  isTranslated: boolean;
};
export type FormFieldExtendedDefinition = FormFieldDefinition & {
  values?: readonly string[];
  inputType?: InputType;
  showForComponent?: FieldComponentType[];
};
export type FormFieldArrayDefinition = {
  isArray: true;
  discriminators: {
    key: string;
    values: readonly string[];
    specs: Record<
      Exclude<FieldDiscriminator, 'display'>,
      Record<Key, FormFieldExtendedDefinition>
    >;
  };
};
export type FormField = Record<Field, FormFieldDefinition>;
export type FormFieldArray = Record<Field, FormFieldArrayDefinition>;
export type FormFieldConfig = Record<Key, FormField | FormFieldArray>;

/* ----------------- */
// SCHEMA TYPES
/* -------- */

export type OrganisationField = keyof Organisation;
export type ProjectField = keyof Project;
export type LayerField = keyof Layer;
export type FeatureField = keyof Feature;
export type Field = OrganisationField | ProjectField | LayerField | FeatureField;
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
  'InputField',
  'SelectField',
  'RangeField',
  'TextareaField',
  'UsersField',
  'CustomField',
  'ListField',
  'ToggleField'
] as const;
export const classifierComponentTypes = ['SelectField', 'RangeField'] as const;
export const specifierComponentTypes = ['InputField', 'TextareaField'] as const;
export const displayComponentTypes = ['InputField'] as const;
export type FieldComponentType = (typeof fieldComponentTypes)[number];
export type FieldComponent =
  | typeof InputField
  | typeof SelectField
  | typeof RangeField
  | typeof TextareaField
  | typeof UsersField
  | typeof CustomField
  | typeof ListField
  | typeof ToggleField;

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

// Feature where all fields are optional, no relations
export type FeaturePartialUpdate = z.infer<typeof FeaturePatch>;

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

export type AddressProperties = {
  subPremise?: string;
  premise?: string;
  streetNumber?: string;
  route?: string;
  intersection?: string;
  neighbourhood?: string;
  administrativeAreaLevel1?: string;
  country?: string;

  // Metadata
  addressGeocoder: string; // The Geocoder used are the source
  addressReverseGen: boolean; // Were the address components generator by a Reverse Geocoder
  addressForwardGen: boolean; // Were the address components generated by a Forward Geocoder
};

export type AddressPropertiesExtended = AddressProperties & {
  // Metrics
  distanceFromPoint?: number;
  // Address Components
  plusCode?: string;
  // Identifier
  googlePlaceId?: string;
};

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

/* ----------------- */
// SVELTE : PROPS
/* -------- */

export type ResourceNavProps = {
  resource: ResourceType;
  entity: false;
  facet: false;
};

export type NavProps = {
  resource: ResourceType;
  entity: Ref;
  facet: FacetType;
};

export type SectionProps = NavProps & {
  fields: FormField;
  fieldDiscriminator?: string;
  title?: string;
  subtitle?: string;
};

// Update FormProps to use the new type
export type FormProps = OrganisationForm | ProjectForm | LayerForm | FeatureForm;

export type FieldProps = SectionProps & {
  languageTag?: LanguageTag;
  fieldRoot?: keyof Resource;
  field?: FormFieldDefinition;
  fieldIndex?: number;
  fieldKey?: Key;
  values?: string[];
  actions?: Record<string, (...args: any[]) => void>;
};

export type FieldPropsExtended = FieldProps & {
  languageTag: LanguageTag;
  field: FormFieldExtendedDefinition;
  fieldRoot: keyof Resource;
  fieldIndex: number;
  fieldKey: Key;
};

export type BarProps = SectionProps & {
  languageTag: LanguageTag;
};

export type ModalProps = {
  searchMode?: boolean;
  removeMode?: boolean;
};

export type ActionProps = {
  Actions?: typeof UserActions | typeof FeatureActions | typeof AddressActions;
  // | Component<{
  //     searchMode?: boolean;
  //     removeMode?: boolean;
  //     actions?: Record<string, (...args: any[]) => void>;
  //     entity: Ref;
  //     resource: ResourceType;
  //   }>
  actions?: Record<string, (...args: any[]) => void>;
  actionProps?: Record<string, any>;
};

export type ErrorParams = {
  field: FormFieldExtendedDefinition;
  languageTag: LanguageTag;
  fieldRoot: Field;
  fieldIndex: number;
  fieldKey: Key;
};

export type PageProps<T extends Resource> = {
  data: {
    validatedForm: SuperValidated<T>;
    entity: Ref;
  };
};

// FIELDS

export type ListFieldProps = FieldProps & {
  field: FormFieldExtendedDefinition;
  fieldRoot: keyof Resource;
  fieldIndex: number;
  fieldKey: Key;
  values: IntermediateValue[];
  actions: {
    add: () => void;
    remove: (e: Event, valueId: string) => void;
    update: (valueId: string, languageTag: string, e: Event) => void;
    syncUp: () => void;
  };
  actionProps: {
    dragMode: boolean;
    removeMode: boolean;
    removeModeLang?: string;
    confirmingId?: string;
  };
};

// ELEMENTS

export type InputProps = {
  id: Id;
  value: string;
  isGenAI: boolean;
  placeholder?: string;
  languageTag: LanguageTag;
  isTranslated?: boolean;
  inputType?: 'text' | 'number' | 'email';
  onchange: Function;
};

export type SelectProps = {
  id: Id;
  value: string;
  values: string[] | { value: string; id: string }[];
  isComplex?: boolean;
};

export type ResourceTypeMap = {
  organisation: Organisation;
  project: Project;
  layer: Layer;
  feature: Feature;
};
