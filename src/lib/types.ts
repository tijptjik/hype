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
  FeaturePatch,
  ImageInsert,
  ImageUpdate,
  FeatureImageInsert,
  FeatureImageUpdate,
  UserFeatureInsert,
  UserFeatureUpdate,
  TaskInsert,
  TaskUpdate,
  UserFeatureUpdateAPI,
  FeatureImageUpdateAPI,
  ImagePatch,
  TaskInsertAPI,
  TaskUpdateAPI,
  TaskPatch,
  ImageUpdateAPI,
  ImageInsertAPI,
  FeatureGetAPI,
  ImageGetAPI,
  LayerUpdateAPIWithProject,
  UserUpdateAPI,
  UserUpdate,
  FeatureImageInserts,
  UserFeatureUpdateExtended
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
import ViewerActions from '$lib/components/forms/actions/Viewer.svelte';
import GalleryActions from '$lib/components/forms/actions/Gallery.svelte';
// TYPES
import type {
  FormPath,
  InputConstraints,
  TaintedFields,
  FormPathLeaves,
  ValidateOptions,
  FormPathType,
  SuperValidated,
  ValidationErrors
} from 'sveltekit-superforms';
import type {
  LayerForm as LayerFormType,
  OrganisationForm as OrganisationFormType,
  ProjectForm as ProjectFormType,
  FeatureForm as FeatureFormType
} from './context/forms.svelte';
import type { IconSource } from '@steeze-ui/heroicons';
import type { enhance } from '$app/forms';
import type { Marker } from 'maplibre-gl';
import type { Writable } from 'svelte/store';
import type { SvelteSet } from 'svelte/reactivity';

// HTML
export type InputType = 'text' | 'number' | 'email' | 'password';

// BRANDED
export type ResourceType =
  | 'organisation'
  | 'project'
  | 'layer'
  | 'feature'
  | 'task'
  | 'image'
  | 'userFeature';
export type ResourceTypeWithParent = 'project' | 'layer' | 'feature' | 'task';
export type ResourceTypeWithChildren = 'organisation' | 'project' | 'layer';
export type ParentEntity = {
  type: ResourceTypeWithChildren;
  name: string;
  entity: Organisation | Project | Layer;
  href: string;
};
type activeResource = {
  resource: HierarchicalResource | 'task' | false;
  entity: Ref | false;
  facet: FacetType | false;
};
export type ResourceState = {
  active: activeResource;
  prisms: Prisms;
  resources: AdminFilteredResources;
  filters: AdminFilterStates;
};
export type FalsableResourceType = ResourceType | false;
export type SourceLang = 'en';
export type TargetLang = 'zh-hant' | 'zh-hans';
export type LanguageTag = SourceLang | TargetLang;
export type LanguageTagExtended = LanguageTag | 'core';
export type ResourceToEntity = {
  organisation: EntityWithData<Organisation>[];
  project: EntityWithData<Project>[];
  layer: EntityWithData<Layer>[];
  feature: EntityWithData<Feature>[];
  task: EntityWithData<Task>[];
};
export type ResourceToRecord = Record<ResourceType, Record<string, boolean | null>>;
export type ResourceToText = Record<ResourceType, string>;
export type FilterableResourceType = Exclude<ResourceType, 'feature' | 'task'>;
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
  image?: GetImageAPI;
};
export type ApiEntity = Entity & {
  code?: Code;
  title?: string;
  displayAddress?: string;
};
export type EntityWithData<T extends Resource> = Entity & {
  data: T;
  image?: string;
};
export const Facets = [
  'core',
  'address',
  'images',
  'fields'
] as const;
export type FacetType = (typeof Facets)[number];
export type FalsableFacetType = FacetType | false;
export type ResourceToNavItem = Record<ResourceType, NavItem>;

export type Router = {
  resource: FalsableResourceType;
  entity: FalsableRef;
  facet: FalsableFacetType;
};

export type NavItem = {
  name: string;
  icon: IconSource;
  seq: number;
  path: string;
  isShownInSidebar: boolean;
  isAlwaysExpanded: boolean;
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
export type FormFieldNestedDefinition = FormFieldDefinition & {
  coreValues: string[];
  translatedValues: string[];
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
export type FormFieldNested = Record<Field, FormFieldNestedDefinition>;
export type FormFieldConfig = Record<Key, FormField | FormFieldArray | FormFieldNested>;

/* ----------------- */
// I18N
/* -------- */

export interface TranslationState {
  confirmed: boolean;
  translated: boolean;
  required: boolean;
}

export type TranslationStates = Record<TargetLang, TranslationState>;

/* ----------------- */
// SCHEMA TYPES
/* -------- */

export type OrganisationField = keyof Organisation;
export type ProjectField = keyof Project;
export type LayerField = keyof Layer;
export type FeatureField = keyof Feature;
export type Field = OrganisationField | ProjectField | LayerField | FeatureField;
export type Resource = Organisation | Project | Layer | Feature | Task;
export type ResourceDB = OrganisationDB | ProjectDB | LayerDB | FeatureDB | TaskDB;

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
export type UserDB = z.infer<typeof UserUpdate>;
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

// Layer with all fields, including translations and project
export type LayerWithProject = z.infer<typeof LayerUpdateAPIWithProject>;

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

export type UserLayer = {
  layerId: Id;
  isVisibleOnLoad: boolean;
  layer: Layer;
};

export type UserUpdate = z.infer<typeof UserUpdateAPI>;
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

// Feature with all relations
export type FeatureResponse = z.infer<typeof FeatureGetAPI>;

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
  // Suggested Display Address
  formattedAddress?: string;

  // ADDRESS COMPONENTS (sorted from smallest to largest unit)

  // Division - e.g. front, roof, etc.
  unitPortion?: string;
  // Internal Building Numbering - e.g. 4, 13C,
  unitNumber?: string;
  // Internal Building Numbering Type - e.g. floor, unit, room, etc.
  unitType?: string;
  // Floor Numbering - e.g. 1/F, 13/F store 1 and 13.
  floorNumber?: string;
  // Floor Type - e.g. concourse, upper g/f, roof, etc.
  floorType?: string;

  buildingName?: string;
  buildingNumberFrom?: string;
  buildingNumberTo?: string;

  // Block Type - e.g. tower, block, etc.
  blockType?: string;
  // Block Number - e.g. 1, F etc.
  blockNumber?: string;
  // Block Type Before Number - e.g. Tower 1 of F Block
  blockTypeBeforeNumber?: boolean;

  phaseName?: string;
  phaseNumber?: string;
  estateName?: string;

  streetNumber?: string;
  streetName?: string;

  intersection?: string;

  neighbourhood?: string;
  subDistrict?: string;
  district?: string | null;
  region?: string | null;
  country?: string | null;
};

export type AddressMeta = {
  // IDENTIFIERS

  // IDENTIFIERS :: HKGOV
  // // Building Deparment CSUID
  geoAddressCode?: string;

  // IDENTIFIERS :: GOOGLE
  // // Google Place ID
  googlePlaceId?: string;
  // // Plus Code
  plusCode?: string;

  // GEOSPATIAL
  longitude?: number;
  latitude?: number;

  // METRICS
  distanceFromPoint?: number;
  confidenceForwardGeocoder?: number;

  // GEOCODING
  addressForwardGeocoder?: 'hkgov_als' | 'googlemaps';
  addressReverseGeocoder?: 'hkgov_reverse' | 'googlemaps';
  addressReverseGen?: boolean;
  addressForwardGen?: boolean;
};

export type AddressPropertiesExtended = AddressProperties & AddressMeta;

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

export type SectionProps = {
  fields: FormField;
  form: SuperFormResult<Resource>;
  fieldDiscriminator?: FieldDiscriminator;
  title?: string;
  subtitle?: string;
};

// Update FormProps to use the new type
export type FormProps = OrganisationForm | ProjectForm | LayerForm | FeatureForm;

export type FieldProps = SectionProps & {
  languageTag?: LanguageTagExtended;
  fieldRoot?: keyof Resource;
  field?: FormFieldDefinition;
  fieldIndex?: number;
  fieldKey?: Key;
  values?: string[];
  actions?: Record<string, (...args: any[]) => void>;
};

export type FieldPropsExtended = FieldProps & {
  languageTag: LanguageTagExtended;
  field: FormFieldExtendedDefinition;
  fieldRoot: keyof Resource;
  fieldIndex: number;
  fieldKey: Key;
};

export type BarProps = SectionProps & {
  languageTag: LanguageTag;
  form: SuperFormResult<Resource>;
  fields: FormField;
};

export type ModalProps = {
  searchMode?: boolean;
  removeMode?: boolean;
};

export type ActionProps = {
  Actions?:
    | typeof UserActions
    | typeof FeatureActions
    | typeof AddressActions
    | typeof ViewerActions
    | typeof GalleryActions;
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

export type FormPageProps<T extends Resource> = {
  data: {
    validatedForm: SuperValidated<T>;
    entity: Ref;
    image?: GetImageAPI | null;
  };
};

export type PageProps<T extends Resource> = {
  data: {
    [key: string]: T;
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
  languageTag: LanguageTagExtended;
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

export type DisplayFieldProps = {
  label: string;
  value: any;
  justify?: 'start' | 'end';
  gridCell?: boolean;
};

/* ----------------- */
// IMAGES
/* -------- */

export type Image = z.infer<typeof ImageUpdate>;
export type NewImage = z.infer<typeof ImageInsert>;
export type ImageDB = z.infer<typeof ImageUpdate>;
export type NewImageDB = z.infer<typeof ImageInsert>;
export type ImageAPI = z.infer<typeof ImageUpdateAPI>;
export type NewImageAPI = z.infer<typeof ImageInsertAPI>;
export type ImagePatchAPI = z.infer<typeof ImagePatch>;
export type GetImageAPI = z.infer<typeof ImageGetAPI>;

export type FeatureImage = z.infer<typeof FeatureImageUpdate>;
export type NewFeatureImage = z.infer<typeof FeatureImageInsert>;
export type NewFeatureImages = z.infer<typeof FeatureImageInserts>;
export type FeatureImageDB = z.infer<typeof FeatureImageUpdate>;
export type NewFeatureImageDB = z.infer<typeof FeatureImageInsert>;
export type FeatureImageAPI = z.infer<typeof FeatureImageUpdateAPI>;

// Add these types for tracking upload status
// Add new types for image states
export type LoadStatus = 'initial' | 'uploaded' | 'loading' | 'loaded' | 'error';
export type UploadStatus = 'idle' | 'uploading' | 'uploaded' | 'error' | 'invalidated';
export type ImageUploadState = {
  file: File;
  status: UploadStatus;
  retries: number;
  imageToReplace?: GetImageAPI;
  preview?: string;
};

export type Intent =
  | 'canonical'
  | 'closeUp'
  | 'context'
  | 'general'
  | 'evidence'
  | 'undefined';

/* ----------------- */
// USER FEATURES
/* -------- */

export type UserFeature = z.infer<typeof UserFeatureUpdate>;
export type UserFeatureExtended = z.infer<typeof UserFeatureUpdateExtended>;
export type NewUserFeature = z.infer<typeof UserFeatureInsert>;
export type UserFeatureDB = z.infer<typeof UserFeatureUpdate>;
export type NewUserFeatureDB = z.infer<typeof UserFeatureInsert>;
export type UserFeatureAPI = z.infer<typeof UserFeatureUpdateAPI>;

/* ----------------- */
// TASKS
/* -------- */

export const taskTypes = ['reportedMissing', 'newPhoto', 'newFeature'] as const;
export type TaskType = (typeof taskTypes)[number];

export const reviewActions = [
  'ignored',
  'set-unpublished',
  'set-intangible',
  'set-archived',
  'add-all-photo',
  'add-all-photo-with-intent',
  'add-feature'
] as const;
export type ReviewAction = (typeof reviewActions)[number];

export const reportedMissingActions = [
  'ignored',
  'set-archived',
  'set-unpublished',
  'set-intangible'
] as const;
export type ReportedMissingAction = (typeof reportedMissingActions)[number];

export const newPhotoActions = [
  'ignored',
  'add-all-photos',
  'add-all-photos-with-intent'
] as const;
export type NewPhotoAction = (typeof newPhotoActions)[number];

export const newFeatureActions = ['ignored', 'add-feature'] as const;
export type NewFeatureAction = (typeof newFeatureActions)[number];

export const reviewOutcomes = ['rejected', 'accepted'] as const;
export type ReviewOutcome = (typeof reviewOutcomes)[number];

export type Task = z.infer<typeof TaskUpdate>;
export type NewTask = z.infer<typeof TaskInsert>;
export type TaskDB = z.infer<typeof TaskUpdate>;
export type NewTaskDB = z.infer<typeof TaskInsert>;
export type TaskAPI = z.infer<typeof TaskUpdateAPI>;
export type NewTaskAPI = z.infer<typeof TaskInsertAPI>;
export type TaskPatchAPI = z.infer<typeof TaskPatch>;

/* ----------------- */
// FORMS
/* -------- */

export type SuperFormResult<T extends Record<string, unknown>> = {
  form: Writable<T>;
  enhance: typeof enhance;
  constraints: Writable<InputConstraints<T>>;
  validate: (
    path: FormPathLeaves<T>,
    // opts?: ValidateOptions<FormPathType<T, FormPathLeaves<T>>, T, Record<string, unknown>>
    opts?: ValidateOptions<
      FormPathType<T, FormPathLeaves<T>>,
      T,
      Record<string, unknown>
    >
  ) => Promise<string[] | undefined>;
  // validateForm!: () => Promise<SuperValidated<Record<string, unknown>, string, Form>>;
  validateForm: () => Promise<SuperValidated<T>>;
  tainted: Writable<TaintedFields<T> | undefined>;
  // isTainted!: (path?: FormPath<T> | Record<string, unknown> | boolean | undefined) => boolean;
  isTainted: (path?: FormPath<T> | boolean | undefined) => boolean;
  submit: (event: Event) => void;
  reset: (options?: {
    keepMessage?: boolean;
    data?: Partial<T>;
    newState?: Partial<T>;
    id?: string;
  }) => void;
  errors: Writable<ValidationErrors<T>>;
  message: Writable<string | undefined>;
  posted: Writable<boolean>;
};

export type LayerForm = LayerFormType;
export type OrganisationForm = OrganisationFormType;
export type ProjectForm = ProjectFormType;
export type FeatureForm = FeatureFormType;

/* ----------------- */
// ACCESS CONTROL
/* -------- */

// ACCESS CONTROL - OPTIONS
// - OPEN - No restrictions or filters, i.e. access is granted to all users
// - ROLE - Restricted by role, i.e. access is accepted/denied based on the user's role
// - STATE - Filtered by state, i.e. result set is filtered based on the state of the resource

// ACCESS CONTROL - OPEN
export const publicAccessOptions = ['Public', 'SuperAdmin', 'ResourceAll', 'EntityAny'];
export type PublicAccessOption = (typeof publicAccessOptions)[number];

// ACCESS CONTROL - RESTRICED BY ROLE - Note : Also used in hierarchicalResourceQuery() and hierarchicalEntityQuery()
export const hierarchicalOwnOptions = ['ResourceOwn', 'EntityOwn'];
export type HierarchicalOwnOption = (typeof hierarchicalOwnOptions)[number];

export const hierarchicalChildrenOptions = ['ResourceOwnChildren', 'EntityOwnChild'];
export type HierarchicalChildrenOption = (typeof hierarchicalChildrenOptions)[number];

export const hierarchicalGrandChildrenOptions = [
  'ResourceOwnGrandChildren',
  'EntityOwnGrandChild'
];
export type HierarchicalGrandChildrenOption =
  (typeof hierarchicalGrandChildrenOptions)[number];

export const hierarchicalAccessOptions = [
  ...hierarchicalOwnOptions,
  ...hierarchicalChildrenOptions,
  ...hierarchicalGrandChildrenOptions
];
export type HierarchicalAccessOption = (typeof hierarchicalAccessOptions)[number];

// ACCESS CONTROL - RESTRICED BY ROLE - Note : Also used in genericResourceQuery() and genericEntityQuery()
export const relationalAccessOptions = [
  'EntityFromEditableProject',
  'EntityFromEditableOrganisation',
  'ResourceFromEditableProject',
  'ResourceFromEditableOrganisation'
];
export type RelationalAccessOption = (typeof relationalAccessOptions)[number];

// ACCESS CONTROL - FILTERED BY STATE
export const statefulAccessOptions = ['Stateful'];
export type StatefulAccessOption = (typeof statefulAccessOptions)[number];

export const genericAccessOptions = ['GenericOwn', 'GenericSelf'];
export type GenericAccessOption = (typeof genericAccessOptions)[number];

export type AccessStrategyOption =
  | PublicAccessOption
  | HierarchicalAccessOption
  | RelationalAccessOption
  | GenericAccessOption;

export type AccessStrategy = AccessStrategyOption | AccessStrategyOption[];

export type ImageUploadRefs = {
  // ResourceType which the image is associated with
  resource: ResourceType;
  // ID of the entity which the image is associated with
  entity: Id;
  // Parent Organisation
  organisation: Organisation;
  // Parent Project
  project?: Project;
  // Image to replace is used to determine the image being replaced
  imageToReplace?: GetImageAPI;
};

export type ImageEditRefs = {
  // ResourceType which the image is associated with
  refType: ResourceType;
  // ID of the entity which the image is associated with
  refId: Id;
};

export type ParamsToSign = {
  folder: string;
  public_id?: string | null;
};

export type OmniGroup = 'walks' | 'neighbourhoods' | 'features';

export type SearchResult = {
  name: string;
  count: number;
  group: OmniGroup;
  ref: string;
};

// ENUMS

export enum FeatureCardMode {
  Display = 'display',
  New = 'new',
  Missing = 'missing',
  AddPhoto = 'addPhoto'
}

export enum HierarchicalResource {
  organisation = 'organisation',
  project = 'project',
  layer = 'layer',
  feature = 'feature',
  task = 'task'
}

export enum HierarchicalResourcePath {
  organisation = 'organisations',
  project = 'projects',
  layer = 'layers',
  feature = 'features',
  task = 'tasks'
}

export enum HierarchicalResourceSeq {
  organisation = 1,
  project = 2,
  layer = 3,
  feature = 4,
  task = 5
}

export enum HierarchicalResourceRefKey {
  organisation = 'code',
  project = 'code',
  layer = 'id',
  feature = 'id',
  task = 'id'
}

export enum HierarchicalResourceParent {
  project = 'organisation',
  layer = 'project',
  feature = 'layer',
  task = 'feature'
}

export enum HierarchicalResourceParentRefKey {
  project = 'organisationId',
  layer = 'projectId',
  feature = 'layerId',
  task = 'featureId'
}

export enum CollectionStatistic {
  total = 'total',
  access = 'access',
  filtered = 'filtered',
  selected = 'selected'
}

export enum GeoCoder {
  hkgov_als = 'hkgov_als',
  hkgov_identify = 'hkgov_identify',
  googlemaps = 'googlemaps'
}

// USER APP

// Selected Resource Constraints by code
export type Prisms = { organisation: Code[]; project: Code[]; layer: Id[] };

// Resources constrained by suncast filters
export type FilteredResources = {
  organisation: Organisation[];
  project: Project[];
  layer: Layer[];
  feature: Feature[];
};

export type AdminFilteredResources = {
  organisation: Organisation[];
  project: Project[];
  layer: Layer[];
  feature: Feature[];
  task: Task[];
};

export type FilterState = {
  neighbourhoods: string[];
  properties: Record<Id, Record<string, any>>;
};

export type AdminFilterState = {
  text?: string;
  properties?: Record<string, any>;
  isPublished?: boolean | null;
  isArchived?: boolean | null;
  isReviewed?: boolean | null;
};
export type AdminFilterStates = Record<HierarchicalResource, AdminFilterState>;

export type ActiveCollection = {
  id: string;
  name: string;
  type: 'neighbourhood' | 'walk' | 'feature' | 'search';
  translations: Record<string, string>[];
  items: Feature[];
} | null;

export type PanelState = {
  filters: boolean;
  maps: boolean;
  stars: boolean;
  settings: boolean;
};

export type mapContextState = {
  markers: Map<Id, Marker>;
  active: {
    feature: Feature | null;
    collection: ActiveCollection | null;
  };
  filters: FilterState;
  prisms: Prisms;
  resources: FilteredResources;
  userFeatures: {
    wishlisted: UserFeature[];
    visited: UserFeature[];
  };
  userLocation: {
    coords: {
      accuracy: number;
      altitude: number | null;
      altitudeAccuracy: number | null;
      heading: number | null;
      latitude: number;
      longitude: number;
      speed: number | null;
    };
    timestamp: number;
  } | null;
  distancesFromUser: Record<Id, number>;
  panels: PanelState;
};

export type TranslatedValue = {
  value: string;
  translations?: {
    lang: string;
    value: string;
  }[];
};

export type RangeFilterValue = {
  globalMin: number;
  globalMax: number;
  rangeMin: number;
  rangeMax: number;
};

export type ImageCtxMode = 'standalone' | 'gallery';
export type ImageCtxState = {
  mode: ImageCtxMode;
  refType: ResourceType | null;
  refId: Id | null;
  refOrganisation: OrganisationDB | null;
  refProject: ProjectDB | null;
  uploadQueue: ImageUploadState[];
  loadStatus: Record<string, LoadStatus>;
  activeId: string | null;
  images: (GetImageAPI & { preview?: string })[];
  preloadedImages: Set<string>;
  pendingConfirmation: SvelteSet<string>;
  deletionQueue: SvelteSet<string>;
  rejected: File[];
  thumbnailLoadStatus: Record<string, LoadStatus>;
};

export type ImageCtxOptions = {
  mode: ImageCtxMode;
  isAdminMode: boolean;
  refType: ResourceType;
  refId: Id;
  refOrganisation?: OrganisationDB;
  refProject?: ProjectDB;
  image?: GetImageAPI;
};

export type UploadedPhoto = {
  file: File;
  previewUrl: string;
};

export type CameraPermissionStatus = 'unknown' | 'prompt' | 'granted' | 'denied';
