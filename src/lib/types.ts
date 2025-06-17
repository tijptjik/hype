// ZOD SCHEMAS
import { z } from 'zod';
// COMPONENTS
import CustomField from '$lib/components/forms/fields/Property.svelte';
import InputField from '$lib/components/forms/fields/Input.svelte';
import TextareaField from '$lib/components/forms/fields/Textarea.svelte';
import SelectField from '$lib/components/forms/fields/Select.svelte';
import RangeField from '$lib/components/forms/fields/Range.svelte';
import UsersField from '$lib/components/forms/fields/Users.svelte';
import ListField from '$lib/components/forms/fields/List.svelte';
import ToggleField from '$lib/components/forms/fields/Toggle.svelte';
import DisplayField from '$lib/components/forms/fields/Display.svelte';
// ENUMS
import {
  ImageContextResource,
  ImageContextResourceExtended,
  FirstClassResource,
  SupportedLocales,
  FieldDiscriminator as FieldDiscriminatorEnum,
  TaskType as TaskTypeEnum,
  TaskReviewOutcome
} from './enums';
// ZOD SCHEMAS
import {
  FeatureAPI,
  FeatureBase,
  FeatureClientExt,
  FeatureCollectionAPI,
  FeatureI18nBase,
  FeatureI18nInsert,
  FeatureI18nUpdate,
  FeatureImageBase,
  FeatureImageInsert,
  FeatureImageUpdate,
  FeatureInsert,
  FeatureInsertAPI,
  FeaturePropertyAPI,
  FeaturePropertyBase,
  FeaturePropertyI18nBase,
  FeaturePropertyI18nInsert,
  FeaturePropertyI18nUpdate,
  FeaturePropertyInsert,
  FeaturePropertyInsertAPI,
  FeaturePropertyToMerge,
  FeaturePropertyUpdate,
  FeaturePropertyUpdateAPI,
  FeatureRaw,
  FeatureUpdate,
  FeatureUpdateAPI,
  HubAPI,
  HubBase,
  HubBasic,
  HubCollectionAPI,
  HubI18nBase,
  HubI18nInsert,
  HubI18nUpdate,
  HubInsert,
  HubInsertAPI,
  HubRaw,
  HubUpdate,
  HubUpdateAPI,
  ImageAPI,
  ImageBase,
  ImageBaseRaw,
  ImageFlat,
  ImageFlatUpdate,
  ImageInsert,
  ImageInsertAPI,
  ImageInsertWithFeatureAPI,
  ImageInsertWithProjectOrOrganisationAPI,
  ImageUpdate,
  ImageUpdateAPI,
  LayerAPI,
  LayerBase,
  LayerI18nBase,
  LayerI18nInsert,
  LayerI18nUpdate,
  LayerInsert,
  LayerInsertAPI,
  LayerPropertyBase,
  LayerPropertyInsert,
  LayerPropertyRaw,
  LayerPropertyUpdate,
  LayerPropertyUpdateExtra,
  LayerRaw,
  LayerUpdate,
  LayerUpdateAPI,
  OrganisationAPI,
  OrganisationBase,
  OrganisationI18nBase,
  OrganisationI18nInsert,
  OrganisationI18nUpdate,
  OrganisationInsert,
  OrganisationInsertAPI,
  OrganisationInsertSuperAdminAPI,
  OrganisationRaw,
  OrganisationRoleAPI,
  OrganisationRoleBase,
  OrganisationRoleInsert,
  OrganisationRoleUpdate,
  OrganisationRoleUpdateExtra,
  OrganisationRoleWithUser,
  OrganisationSuperAdminAPI,
  OrganisationUpdate,
  OrganisationUpdateAPI,
  OrganisationUpdateSuperAdminAPI,
  ProjectAPI,
  ProjectBase,
  ProjectI18nBase,
  ProjectI18nInsert,
  ProjectI18nUpdate,
  ProjectInsert,
  ProjectInsertAPI,
  ProjectRaw,
  ProjectRoleAPI,
  ProjectRoleBase,
  ProjectRoleInsert,
  ProjectRoleUpdate,
  ProjectRoleUpdateExtra,
  ProjectRoleWithUser,
  ProjectUpdate,
  ProjectUpdateAPI,
  PropertyAPI,
  PropertyBase,
  PropertyBaseRaw,
  PropertyI18nBase,
  PropertyI18nInsert,
  PropertyI18nUpdate,
  PropertyInsert,
  PropertyInsertAPI,
  PropertyUpdate,
  PropertyUpdateAPI,
  PropertyValueAPI,
  PropertyValueBase,
  PropertyValueI18nBase,
  PropertyValueI18nInsert,
  PropertyValueI18nUpdate,
  PropertyValueInsert,
  PropertyValueInsertAPI,
  PropertyValueRaw,
  PropertyValueUpdate,
  PropertyValueUpdateAPI,
  TaskAPI,
  TaskBase,
  TaskBaseRaw,
  TaskCollectionAPI,
  TaskInsert,
  TaskInsertAPI,
  TaskUpdate,
  TaskUpdateAPI,
  UserAPI,
  UserBase,
  UserBaseRaw,
  UserCollectionAPI,
  UserCurrentAPI,
  UserFeatureAPI,
  UserFeatureBase,
  UserFeatureInsert,
  UserFeatureInsertAPI,
  UserFeatureUpdate,
  UserFeatureUpdateAPI,
  UserLayerAPI,
  UserLayerBase,
  UserLayerInsert,
  UserLayerUpdate,
  UserLayerUpdateAPI,
  UserUpdate,
  UserUpdateAPI
} from './db/zod';
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
  FeatureForm as FeatureFormType,
  HubForm as HubFormType
} from './context/form.svelte';
import type { enhance } from '$app/forms';
import type { Marker } from 'maplibre-gl';
import type { Writable } from 'svelte/store';
import type { SvelteSet } from 'svelte/reactivity';
import type { Geometry } from 'geojson';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { SQLiteTable, SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';
import type {
  SessionSession as BetterAuthSessionSession,
  SessionUser as BetterAuthSessionUser
} from './auth';

/* ----------------- */
// NAMING CONVENTIONS
//
// ModelBase : SelectSchema(Model)
// ModelInsert : InsertSchema(Model)
// ModelUpdate : UpdateSchema(Model)
//
// ModelI18nBase : SelectSchema(ModelI18n)
// ModelI18nInsert : InsertSchema(ModelI18n)
// ModelI18nUpdate : UpdateSchema(ModelI18n)
// ModelI18nByLocale : ModelI18nBase.map()
// ModelI18nInsertByLocale : ModelI18nInsert.map()
// ModelI18nUpdateByLocale : ModelI18nUpdate.map()
//
// ModelAPI : ModelBase.extend({
//   i18n : ModelI18nByLocale,
//   roles : ModelRole[],
//   ...
// })
//
// ModelInsertAPI : ModelInsert.extend({
//   i18n : ModelI18nInsertByLocale,
//   roles : ModelRoleInsert[],
//   ...
// })
//
// ModelUpdateAPI : ModelUpdate.extend({
//   i18n : ModelI18nUpdateByLocale,
//   roles : ModelRoleUpdate[],
//   ...
// })
//
// The types inferred from the schemas above are as follows:
//
// ModelDB : ModelBase
// ModelDBNew : ModelInsert
// ModelDBPartial : ModelUpdate
//
// ModelI18nDB : ModelI18nBase
// ModelI18nNew : ModelI18nInsert
// ModelI18nPartial : ModelI18nUpdate
// ModelByLocale : ModelI18nByLocale
// ModelInsertByLocale : ModelI18nInsertByLocale
// ModelUpdateByLocale : ModelI18nUpdateByLocale
//
// Model : ModelAPI
// ModelNew : ModelInsertAPI
// ModelPartial : ModelUpdateAPI

/* ----------------- */
// DATABASE
/* -------- */

// Drizzle Database
export type Database = DrizzleD1Database<typeof import('$lib/db/schema')>;

export type DbTable = SQLiteTable<any>;

// Drizzle withRelations
export type NestedRelations = {
  [key: string]: boolean | { columns: NestedRelations } | { with: NestedRelations };
};

/* ----------------- */
// RESOURCES
/* -------- */

export type ResourceConfig = {
  name: string;
  table: SQLiteTableWithColumns<any>;
  parentName: string | null;
  parentTable: SQLiteTableWithColumns<any> | null;
  keyToParent: string | null;
  keyToSelf: string;
  depth: number;
};

export type ResourceHierarchy = ResourceConfig[];

export type ResourceContext = {
  feature?: Feature;
  layer?: Layer;
  project?: Project;
  organisation?: Organisation;
};

export type ResourceType =
  | 'organisation'
  | 'project'
  | 'layer'
  | 'feature'
  | 'task'
  | 'image'
  | 'user'
  | 'hub'
  | 'userFeature';

export type FalsableResourceType = ResourceType | false;

export type HierarchicalResourceType =
  | 'organisation'
  | 'project'
  | 'layer'
  | 'feature'
  | 'task';

export type ResourceTypeWithParent = Exclude<HierarchicalResourceType, 'organisation'>;

export type ResourceTypeWithChildren = Exclude<
  HierarchicalResourceType,
  'feature' | 'task'
>;

/* ----------------- */
// NAVIGATION :: ADMIN :: ACTIVE RESOURCE
/* -------- */

type activeResourceType = {
  resourceType: FirstClassResource | false;
  resourceRef: Ref | false;
  facet: FacetType | false;
};

export type NavItem = {
  name: string;
  icon: any;
  seq: number;
  path: string;
  isShownInSidebar: boolean;
  isAlwaysExpanded: boolean;
};

/* ----------------- */
// ADMIN CONTROLS
/* -------- */
export type LayoutMode = 'table' | 'list' | 'card';
export type ControlMode = 'filter' | null;

/* ----------------- */
// VIEW FILTERS (TIER 3)
/* -------- */
export type FilterTriState = boolean | null;
export type LocalisedFilterTriState = Record<Locale, FilterTriState>;

export type FeatureViewFilters = {
  // Status related
  isPublished: FilterTriState;
  isPendingReview: FilterTriState;
  isArchived: FilterTriState;
  isIntangible: FilterTriState;
  isVisitable: FilterTriState;

  // Image related
  hasImage: FilterTriState;
  isOneImagePublished: FilterTriState;
  isAllImagePublished: FilterTriState;

  // Authorship related
  hasTitle: FilterTriState;
  hasDescription: FilterTriState;

  // Translation related (per locale)
  translationLocales: Record<Locale, boolean>; // Which locales to consider for translation filters
  isTitleTranslated: LocalisedFilterTriState;
  isDescriptionTranslated: LocalisedFilterTriState;
  isSpecifierTranslated: LocalisedFilterTriState; // TODO: implement
  isAddressTranslated: LocalisedFilterTriState;

  // Property related
  properties: Record<Id, FilterTriState>; // propertyId -> state
};

export type ViewFilters = {
  feature: FeatureViewFilters;
  // Add other resource types as needed
};

/* ----------------- */
// FILTERS :: ADMIN :: FEATURES
/* -------- */

export type FeatureStatusFilterKey =
  | 'isPublished'
  | 'isPendingReview'
  | 'isArchived'
  | 'isIntangible'
  | 'isVisitable';

export type FeatureTranslationFilterKey =
  | 'isTitleTranslated'
  | 'isDescriptionTranslated'
  | 'isAddressTranslated';

export type FeatureAuthorshipFilterKey =
  | 'hasTitle'
  | 'hasDescription';

export type FeatureImageFilterKey =
  | 'hasImage'
  | 'isOneImagePublished'
  | 'isAllImagePublished';

/* ----------------- */
// FILTERS :: APP
/* -------- */

// Resources constrained by suncast filters
export type FilteredResources = {
  organisation: Organisation[];
  project: Project[];
  layer: Layer[];
  feature: Feature[];
  task: Task[];
  hub: Hub[];
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
export type AdminFilterStates = Record<FirstClassResource, AdminFilterState>;

export type ActiveCollection = {
  id: string;
  type: 'neighbourhood' | 'walk' | 'feature' | 'search';
  i18n: Record<Locale, { name: string }>;
  items: Feature[];
} | null;

/* ----------------- */
// ENTITY CARDS
/* -------- */

export type KeyMap = {
  id: 'id' | 'code' | string;
  title: string;
  subtitle?: string;
  description?: string;
  image: string;
  tags?: string[];
  badges?: Array<{
    label: string;
    variant?: 'primary' | 'secondary' | 'outline' | undefined;
    type?: 'boolean';
    trueText?: string;
    falseText?: string;
    superAdminOnly?: boolean;
  }>;
};

/* ----------------- */
// URL
/* -------- */

export type QueryParams = Record<string, string | string[]>;

/* ----------------- */
// NAVIGATION :: PRISMS
/* -------- */

export type Prisms = { organisation: Code[]; project: Code[]; layer: Id[] };

/* ----------------- */
// NAVIGATION :: FACETS
/* -------- */

export const Facets = [
  'core',
  'address',
  'images',
  'fields'
] as const;
export type FacetType = (typeof Facets)[number];

/* ----------------- */
// I18N
/* -------- */

export type Locale = `${SupportedLocales}`;
export type LocaleExtended = Locale | 'core';

export type TranslatedValue = {
  value: string;
  i18n?: {
    locale: string;
    value: string;
  }[];
};

// Define the shape of a translation object
export interface LocaleBundle {
  locale: Locale;
  [key: string]: unknown;
}

/* ----------------- */
// HTML
/* -------- */

export type InputType = 'text' | 'number' | 'email' | 'password';

/* ----------------- */
// SESSION
/* -------- */

export type Session = BetterAuthSessionSession;
export type SessionUser = BetterAuthSessionUser;

/* ----------------- */
// I18N
/* -------- */

export interface TranslationState {
  confirmed: boolean;
  translated: boolean;
  required: boolean;
}

export type TranslationStates = Record<Locale, TranslationState>;

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
export type HubForm = HubFormType;
export type Form = LayerForm | OrganisationForm | ProjectForm | FeatureForm | HubForm;

/* ----------------- */
// FORM FIELDS
/* -------- */

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
      Exclude<FieldDiscriminatorEnum, 'display'>,
      Record<Key, FormFieldExtendedDefinition>
    >;
  };
};
export type FormField = Record<Field, FormFieldDefinition>;
export type FormFieldArray = Record<Field, FormFieldArrayDefinition>;
export type FormFieldNested = Record<Field, FormFieldNestedDefinition>;
export type FormFieldConfig = Record<Key, FormField | FormFieldArray | FormFieldNested>;

/* ----------------- */
// RESOURCE :: COMMON
/* -------- */

// (Nano) unique identifier
export type Id = string;
// Human-readable unique identifier
export type Code = string;
// How the object is publicly addressed
export type Ref = Id | Code;
// Property name in API or Database
export type Key = string;

/* ----------------- */
// RESOURCE :: STATE
/* -------- */

export type ResourceState = {
  active: activeResourceType;
  prisms: Prisms;
  resources: FilteredResources;
  filters: AdminFilterStates;
};
export type FilterableResourceType = Exclude<ResourceType, 'feature' | 'task'>;

/* ----------------- */
// SCHEMA TYPES
/* -------- */

export type OrganisationField = keyof Organisation | keyof OrganisationI18nDB;
export type ProjectField = keyof Project | keyof ProjectI18nDB;
export type LayerField = keyof Layer | keyof LayerI18nDB;
export type FeatureField = keyof Feature | keyof FeatureI18nDB;
export type HubField = keyof Hub;
export type Field =
  | OrganisationField
  | ProjectField
  | LayerField
  | FeatureField
  | HubField;
export type Resource = Organisation | Project | Layer | Feature | Task | Hub;
export type ResourceNew =
  | OrganisationNew
  | ProjectNew
  | LayerNew
  | FeatureNew
  | TaskNew
  | HubNew;
export type ResourceDB =
  | OrganisationDB
  | ProjectDB
  | LayerDB
  | FeatureDB
  | TaskDB
  | HubDB;

// RELATED TYPES
export type FormI18n<T> = Record<Locale, T>;

/* ----------------- */
// USERS
/* -------- */

/* ----------------- */
// USERS :: DB
/* -------- */

export type UserDB = z.infer<typeof UserBase>;
export type UserDBPartial = z.infer<typeof UserUpdate>;
export type UserRaw = z.infer<typeof UserBaseRaw>;

export type UserLayerDB = z.infer<typeof UserLayerBase>;
export type UserLayerDBPartial = z.infer<typeof UserLayerUpdate>;

/* ----------------- */
// USERS :: API
/* -------- */

export type User = z.infer<typeof UserAPI>;
export type CurrentUser = z.infer<typeof UserCurrentAPI>;
export type UserCollection = z.infer<typeof UserCollectionAPI>;
export type UserPartial = z.infer<typeof UserUpdateAPI>;

export type UserLayer = z.infer<typeof UserLayerAPI>;
export type UserLayerNew = z.infer<typeof UserLayerInsert>;
export type UserLayerPartial = z.infer<typeof UserLayerUpdateAPI>;

/* ----------------- */
// USERS :: JOIN
/* -------- */

// Used to distriminate between Organisation and Project roles
export type UserJoinConfig = {
  discriminator: 'role';
  checkedValue: 'owner' | 'maintainer';
  uncheckedValue: 'member';
};

// Used to manage organisation core inclusion in hubs
export type OrganisationJoinConfig = {
  discriminator: 'isCoreInclusive';
  checkedValue: true;
  uncheckedValue: false;
};

/* ----------------- */
// USERS :: JSON TYPE OBJECTS
/* -------- */

// JSON type objects for user preferences and experimental features

export type UserPreferences = {
  fallbackLocales: Locale[];
  allowMachineTranslation: boolean;
  preferFallbackInCurrentLocale: boolean;
  isTranslateButtonVisible: boolean;
};

export type UserExperimental = {
  contributorMode: boolean;
  noLabelsMode: boolean;
};

export type ExperimentalFeatureConfig = {
  name: string;
  description: string;
  code: keyof UserExperimental;
};

/* ----------------- */
// ORGANISATIONS
/* -------- */

/* ----------------- */
// ORGANISATIONS :: DB
/* -------- */

// Organisation with all its own fields.
export type OrganisationDB = Omit<z.infer<typeof OrganisationBase>, 'isCoreInclusive'>;
export type OrganisationDBSuperAdmin = z.infer<typeof OrganisationBase>;
// Organisation without relations, for use in inserting a new organisation
export type OrganisationDBNew = z.infer<typeof OrganisationInsert>;
// Organisation without relations, for use in partiall updating a organisation
export type OrganisationDBPartial = z.infer<typeof OrganisationUpdate>;

/* ----------------- */
// ORGANISATIONS :: API
/* -------- */

// Organisation with all fields, including userRoles & translations, and User
export type Organisation = z.infer<typeof OrganisationAPI>;
// Like Organisation, but without the organisationId in userRoles and translations
export type OrganisationNew = z.infer<typeof OrganisationInsertAPI>;
// Like Organisation, but with all fields optional
export type OrganisationPartial = z.infer<typeof OrganisationUpdateAPI>;

/* ----------------- */
// ORGANISATIONS :: SUPER ADMIN API
/* -------- */

// Organisation with all fields, including userRoles & translations, and User
export type OrganisationSuperAdmin = z.infer<typeof OrganisationSuperAdminAPI>;
// Like Organisation, but without the organisationId in userRoles and translations
export type OrganisationSuperAdminNew = z.infer<typeof OrganisationInsertSuperAdminAPI>;
// Like Organisation, but with all fields optional
export type OrganisationSuperAdminPartial = z.infer<
  typeof OrganisationUpdateSuperAdminAPI
>;

/* ----------------- */
// ORGANISATIONS :: RELATIONAL
/* -------- */

// organisationI18n, but with the organisationId - for use in DB seeding & selects
export type OrganisationI18nDB = z.infer<typeof OrganisationI18nBase>;
// organisationI18n, but without organisationId - for use in API insertions
export type OrganisationI18nNew = z.infer<typeof OrganisationI18nInsert>;
// Same as OrganisationI18nNew, but all fields are optional
export type OrganisationI18nPartial = z.infer<typeof OrganisationI18nUpdate>;

export type OrganisationRole = z.infer<typeof OrganisationRoleAPI>;
export type OrganisationRoleUser = z.infer<typeof OrganisationRoleWithUser>;

// organisationRole, but with the organisationId - for use in DB seeding & selects
export type OrganisationRoleDB = z.infer<typeof OrganisationRoleBase>;
// organisationRole, but without organisationId - for use in API insertions
export type OrganisationRoleNew = z.infer<typeof OrganisationRoleInsert>;
// Same as OrganisationRoleNew, but all fields are optional
export type OrganisationRolePartial = z.infer<typeof OrganisationRoleUpdate>;
export type OrganisationRolePartialExtra = z.infer<typeof OrganisationRoleUpdateExtra>;

export type OrganisationDBRaw = z.infer<typeof OrganisationRaw>;

/* ----------------- */
// PROJECTS
/* -------- */

/* ----------------- */
// PROJECTS :: DB
/* -------- */

// Project with all its own fields.
export type ProjectDB = z.infer<typeof ProjectBase>;
// Project without relations, for use in inserting a new project
export type ProjectDBNew = z.infer<typeof ProjectInsert>;
// Project without relations, for use in partiall updating a project
export type ProjectDBPartial = z.infer<typeof ProjectUpdate>;

/* ----------------- */
// PROJECTS :: API
/* -------- */

// Project with all fields, including maintainerRoles & translations, and User
export type Project = z.infer<typeof ProjectAPI>;
// Like Project, but without the projectId in maintainerRoles and translations
export type ProjectNew = z.infer<typeof ProjectInsertAPI>;
// Like Project, but with all fields optional
export type ProjectPartial = z.infer<typeof ProjectUpdateAPI>;

/* ----------------- */
// PROJECTS :: RELATIONAL
/* -------- */

// projectI18n, but with the projectId - for use in DB seeding & selects
export type ProjectI18nDB = z.infer<typeof ProjectI18nBase>;
// projectI18n, but without projectId - for use in API insertions
export type ProjectI18nNew = z.infer<typeof ProjectI18nInsert>;
// Same as ProjectI18nNew, but all fields are optional
export type ProjectI18nPartial = z.infer<typeof ProjectI18nUpdate>;

export type ProjectI18n = z.infer<typeof ProjectI18nBase>;

// projectRole, but with the projectId - for use in DB seeding & selects
export type ProjectRole = z.infer<typeof ProjectRoleAPI>;
export type ProjectRoleUser = z.infer<typeof ProjectRoleWithUser>;
export type ProjectRoleDB = z.infer<typeof ProjectRoleBase>;
// projectRole, but without projectId - for use in API insertions
export type ProjectRoleNew = z.infer<typeof ProjectRoleInsert>;
// Same as ProjectRoleNew, but all fields are optional
export type ProjectRolePartial = z.infer<typeof ProjectRoleUpdate>;
export type ProjectRolePartialExtra = z.infer<typeof ProjectRoleUpdateExtra>;

/* ----------------- */
// PROJECTS : FIELDS
/* -------- */

export type FieldDiscriminator = `${FieldDiscriminatorEnum}`;

export const fieldComponentTypes = [
  'InputField',
  'SelectField',
  'RangeField',
  'TextareaField',
  'UsersField',
  'CustomField',
  'ListField',
  'ToggleField',
  'DisplayField'
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
  | typeof ToggleField
  | typeof DisplayField;

export type RangeFilterValue = {
  globalMin: number;
  globalMax: number;
  rangeMin: number;
  rangeMax: number;
};

/* ----------------- */
// PROJECTS : FIELDS : INTERMEDIATE VALUE
/* -------- */

// Project, with relations in DB form - used as an intermediate type for DB operations
export type ProjectDBRaw = z.infer<typeof ProjectRaw>;

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

export type UserRole = OrganisationRole | ProjectRole;
export type UserRoleDisco =
  | (OrganisationRole & { type: 'organisation' })
  | (ProjectRole & { type: 'project' });

/* ----------------- */
// LAYERS
/* -------- */

/* ----------------- */
// LAYERS :: DB
/* -------- */

// Layer with all its own fields.
export type LayerDB = z.infer<typeof LayerBase>;
// Layer without relations, for use in inserting a new layer
export type LayerDBNew = z.infer<typeof LayerInsert>;
// Layer without relations, for use in partially updating a layer
export type LayerDBPartial = z.infer<typeof LayerUpdate>;
// Layer, with relations in DB form - used as an intermediate type for DB operations
export type LayerDBRaw = z.infer<typeof LayerRaw>;

/* ----------------- */
// LAYERS :: API
/* -------- */

// Layer with all fields, including translations and properties
export type Layer = z.infer<typeof LayerAPI>;
// Like Layer, but without the layerId in translations and properties
export type LayerNew = z.infer<typeof LayerInsertAPI>;
// Like Layer, but with all fields optional
export type LayerPartial = z.infer<typeof LayerUpdateAPI>;

/* ----------------- */
// LAYERS :: RELATIONAL
/* -------- */

// layerI18n, but with the layerId - for use in DB seeding & selects
export type LayerI18nDB = z.infer<typeof LayerI18nBase>;
// layerI18n, but without layerId - for use in API insertions
export type LayerI18nNew = z.infer<typeof LayerI18nInsert>;
// Same as LayerI18nNew, but all fields are optional
export type LayerI18nPartial = z.infer<typeof LayerI18nUpdate>;

// layerProperty, but with the layerId - for use in DB seeding & selects
export type LayerPropertyDB = z.infer<typeof LayerPropertyBase>;
// layerProperty, but with relations in DB form - used as an intermediate type for DB operations
export type LayerPropertyDBRaw = z.infer<typeof LayerPropertyRaw>;
// layerProperty, but without layerId - for use in API insertions
export type LayerPropertyNew = z.infer<typeof LayerPropertyInsert>;
// Same as LayerPropertyNew, but all fields are optional
export type LayerPropertyPartial = z.infer<typeof LayerPropertyUpdate>;
export type LayerPropertyPartialExtra = z.infer<typeof LayerPropertyUpdateExtra>;

export type LayerMetadata = {};

/* ----------------- */
// FEATURES
/* -------- */

/* ----------------- */
// FEATURES :: DB
/* -------- */

// Feature with all its own fields.
export type FeatureDB = z.infer<typeof FeatureBase>;
// Feature without relations, for use in inserting a new feature
export type FeatureDBNew = z.infer<typeof FeatureInsert>;
// Feature without relations, for use in partially updating a feature
export type FeatureDBPartial = z.infer<typeof FeatureUpdate>;
// Feature, with relations in DB form - used as an intermediate type for DB operations
export type FeatureDBRaw = z.infer<typeof FeatureRaw>;

/* ----------------- */
// FEATURES :: API
/* -------- */

// Feature with all fields, including translations and properties
export type FeatureCollection = z.infer<typeof FeatureCollectionAPI>;
export type Feature = z.infer<typeof FeatureAPI>;
// Like Feature, but without the featureId in translations and properties
export type FeatureNew = z.infer<typeof FeatureInsertAPI>;
// Like Feature, but with all fields optional
export type FeaturePartial = z.infer<typeof FeatureUpdateAPI>;

/* ----------------- */
// FEATURES :: RELATIONAL
/* -------- */

// featureI18n, but with the featureId - for use in DB seeding & selects
export type FeatureI18nDB = z.infer<typeof FeatureI18nBase>;
// featureI18n, but without featureId - for use in API insertions
export type FeatureI18nNew = z.infer<typeof FeatureI18nInsert>;
// Same as FeatureI18nNew, but all fields are optional
export type FeatureI18nPartial = z.infer<typeof FeatureI18nUpdate>;

// featureProperty, but with the featureId - for use in DB seeding & selects
export type FeaturePropertyDB = z.infer<typeof FeaturePropertyBase>;
// featureProperty, but without featureId - for use in API insertions
export type FeaturePropertyNew = z.infer<typeof FeaturePropertyInsert>;
// Same as FeaturePropertyNew, but all fields are optional
export type FeaturePropertyPartial = z.infer<typeof FeaturePropertyUpdate>;
// featureProperty, but without featurePropertyId - for use in API insertions
export type FeaturePropertyMerge = z.infer<typeof FeaturePropertyToMerge>;

// featureProperty, but with feature, i18n, and propertyValue - for use in API
export type FeatureProperty = z.infer<typeof FeaturePropertyAPI>;
// featureProperty, but without featurePropertyId - for use in API insertions
export type NewFeatureProperty = z.infer<typeof FeaturePropertyInsertAPI>;
// Same as NewFeatureProperty, but all fields are optional
export type PartialFeatureProperty = z.infer<typeof FeaturePropertyUpdateAPI>;

// featurePropertyI18n, but with the featurePropertyId - for use in DB seeding & selects
export type FeaturePropertyI18nDB = z.infer<typeof FeaturePropertyI18nBase>;
// featurePropertyI18n, but without featurePropertyId - for use in API insertions
export type FeaturePropertyI18nNew = z.infer<typeof FeaturePropertyI18nInsert>;
// Same as FeaturePropertyI18nNew, but all fields are optional
export type FeaturePropertyI18nPartial = z.infer<typeof FeaturePropertyI18nUpdate>;

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
// FEATURES : USER CONTRIBUTED
/* -------- */

export type NewFeatureWithLocationAndParents = PartialExcept<
  NewFeatureTask & {
    feature: PartialExcept<
      UserContributedFeature,
      'layerId' | 'geometry' | 'properties'
    > & {
      geometry: Geometry;
      properties: UserContributedFeatureProperty[];
    };
  },
  'organisationId' | 'projectId' | 'layerId'
>;

export type UserContributedFeatureProperty = {
  property: Property;
  propertyId: Id;
  propertyValueId?: Id; // Categorical
  value?: string; // Universal specifier OR range value
  i18n?: Partial<Record<Locale, { locale: Locale; value: string; valueGen: boolean }>>; // I18n Specifier
};

export type UserContributedFeature = {
  organisationId: Id;
  projectId: Id;
  layerId: Id;
  geometry: Geometry;
  i18n: Partial<
    Record<
      Locale,
      {
        title?: string;
        description?: string;
        displayAddress: string;
        displayAddressGen: boolean;
      }
    >
  >;
  properties: UserContributedFeatureProperty[];
  contributorId?: Id;
};

// Base task creation data
type BaseTaskData = {
  layerId: Id;
  organisationId: Id;
  projectId: Id;
  contributorId: Id;
};

export type NewFeatureTask = BaseTaskData & {
  type: 'newFeature';
  feature: UserContributedFeature;
  featureId?: Id;
};

// Specific task types
export type ReportedMissingTask = BaseTaskData & {
  type: 'reportedMissing';
  featureId: Id;
  message?: string;
};

export type NewPhotoTask = BaseTaskData & {
  type: 'newPhoto';
  featureId: Id;
};

// Union type for all task creation APIs
export type TaskCreation = NewFeatureTask | ReportedMissingTask | NewPhotoTask;

/* ----------------- */
// PROPERTIES
/* -------- */

/* ----------------- */
// PROPERTIES :: DB
/* -------- */

// Property with all its own fields.
export type PropertyDB = z.infer<typeof PropertyBase>;
// Property without relations, for use in inserting a new property
export type PropertyDBNew = z.infer<typeof PropertyInsert>;
// Property without relations, for use in partially updating a property
export type PropertyDBPartial = z.infer<typeof PropertyUpdate>;
// Property, with relations in DB form - used as an intermediate type for DB operations
export type PropertyDBRaw = z.infer<typeof PropertyBaseRaw>;

/* ----------------- */
// PROPERTIES :: API
/* -------- */

// Property with all fields, including translations and values
export type Property = z.infer<typeof PropertyAPI>;
// Like Property, but without the propertyId in translations and values
export type PropertyNew = z.infer<typeof PropertyInsertAPI>;
// Like Property, but with all fields optional
export type PropertyPartial = z.infer<typeof PropertyUpdateAPI>;

/* ----------------- */
// PROPERTIES :: RELATIONAL
/* -------- */

// propertyI18n, but with the propertyId - for use in DB seeding & selects
export type PropertyI18nDB = z.infer<typeof PropertyI18nBase>;
// propertyI18n, but without propertyId - for use in API insertions
export type PropertyI18nNew = z.infer<typeof PropertyI18nInsert>;
// Same as PropertyI18nNew, but all fields are optional
export type PropertyI18nPartial = z.infer<typeof PropertyI18nUpdate>;

// propertyValue, but with the propertyId - for use in DB seeding & selects
export type PropertyValueDB = z.infer<typeof PropertyValueBase>;
export type PropertyValueDBRaw = z.infer<typeof PropertyValueRaw>;

// propertyValue, but without propertyId - for use in API insertions
export type PropertyValueNewDB = z.infer<typeof PropertyValueInsert>;
// Same as PropertyValueNew, but all fields are optional
export type PropertyValuePartialDB = z.infer<typeof PropertyValueUpdate>;

export type PropertyValueI18nDB = z.infer<typeof PropertyValueI18nBase>;
// propertyValueI18n, but without propertyValueId - for use in API insertions
export type PropertyValueI18nNew = z.infer<typeof PropertyValueI18nInsert>;
// Same as PropertyValueI18nNew, but all fields are optional
export type PropertyValueI18nPartial = z.infer<typeof PropertyValueI18nUpdate>;

// PropertyValue, but with i18n, for use in API
export type PropertyValue = z.infer<typeof PropertyValueAPI>;
// Like PropertyValue, but without the propertyValueId in translations
export type PropertyValueNew = z.infer<typeof PropertyValueInsertAPI>;
// Like PropertyValue, but with all fields optional
export type PropertyValuePartial = z.infer<typeof PropertyValueUpdateAPI>;

/* ----------------- */
// IMAGES
/* -------- */

export type ImageDB = z.infer<typeof ImageBase>;
export type ImageDBNew = z.infer<typeof ImageInsert>;
export type ImageDBPartial = z.infer<typeof ImageUpdate>;
export type ImageDBFlat = z.infer<typeof ImageFlat>;
export type ImageDBFlatUpdate = z.infer<typeof ImageFlatUpdate>;
export type ImageDBRaw = z.infer<typeof ImageBaseRaw>;

export type Image = z.infer<typeof ImageAPI>;
export type ImageNew = z.infer<typeof ImageInsertAPI>;
export type ImageNewWithFeature = z.infer<typeof ImageInsertWithFeatureAPI>;
export type ImageNewWithProjectOrOrganisation = z.infer<
  typeof ImageInsertWithProjectOrOrganisationAPI
>;
export type ImagePartial = z.infer<typeof ImageUpdateAPI>;

export type FeatureImageDB = z.infer<typeof FeatureImageBase>;
export type FeatureImageDBNew = z.infer<typeof FeatureImageInsert>;
export type FeatureImageDBPartial = z.infer<typeof FeatureImageUpdate>;

export type FeatureImage = z.infer<typeof FeatureImageBase>;
export type FeatureImageNew = z.infer<typeof FeatureImageInsert>;
export type FeatureImagePartial = z.infer<typeof FeatureImageUpdate>;

/* ----------------- */
// IMAGES :: METADATA
/* -------- */

export type Intent =
  | 'canonical'
  | 'closeUp'
  | 'context'
  | 'general'
  | 'evidence'
  | 'undefined';

export type EXIF = {
  CopyrightNotice: string;
  Credit: string;
  DateTimeOriginal: string;
  CreateDate: string;
  ModifyDate: string;
  GPSLatitude: string;
  GPSLongitude: string;
  'By-line': string;
  [key: string]: string;
};

export type LngLat = {
  latitude?: string;
  longitude?: string;
};

export type Metadata = Record<string, string>;

/* ----------------- */
// IMAGES :: UPLOAD
/* -------- */

export type LoadStatus = 'initial' | 'uploaded' | 'loading' | 'loaded' | 'error';
export type UploadStatus = 'idle' | 'uploading' | 'uploaded' | 'error' | 'invalidated';
export type ImageUploadState = {
  file: File;
  status: UploadStatus;
  retries: number;
  imageToReplace?: Image;
  preview?: string;
};

export type UploadedPhoto = {
  file: File;
  previewUrl: string;
};

export type ImageUploadCtx = {
  // ResourceType which the image is associated with
  ctxType: ImageContextResource;
  // ID of the entity which the image is associated with
  ctxId: Id;
  // Parent Organisation
  organisation: OrganisationDB;
  // Parent Project
  project?: ProjectDB;
  // Image to replace is used to determine the image being replaced
  imageToReplace?: Image;
};

export type ImageEditCtx = {
  // ResourceType which the image is associated with
  ctxType: ImageContextResource;
  // ID of the entity which the image is associated with
  ctxId: Id;
};

export type SignData = {
  cloudname: string;
  apikey: string;
  timestamp: string;
  signature: string;
};

export type ParamsToSign = {
  folder: string;
  public_id?: string | null;
};

export type DeleteParamsToSign = {
  public_id: string | null;
};

export type CameraPermissionStatus = 'unknown' | 'prompt' | 'granted' | 'denied';

/* ----------------- */
// USER FEATURES
/* -------- */

export type UserFeatureDB = z.infer<typeof UserFeatureBase>;
export type UserFeatureDBNew = z.infer<typeof UserFeatureInsert>;
export type UserFeatureDBPartial = z.infer<typeof UserFeatureUpdate>;

export type UserFeature = z.infer<typeof UserFeatureAPI>;
export type UserFeatureNew = z.infer<typeof UserFeatureInsertAPI>;
export type UserFeaturePartial = z.infer<typeof UserFeatureUpdateAPI>;
// Extended on the client side to include hierarchy information
export type FeatureExtended = z.infer<typeof FeatureClientExt>;

/* ----------------- */
// TASKS
/* -------- */

export const taskTypes = Object.values(TaskTypeEnum);
export type TaskType = `${TaskTypeEnum}`;

export const reviewActions = [
  'ignored',
  'set-unpublished',
  'set-intangible',
  'set-archived',
  'add-all-photo',
  'add-all-photo-with-intent',
  'added-feature'
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
  'added-all-photos',
  'added-all-photos-with-intent'
] as const;
export type NewPhotoAction = (typeof newPhotoActions)[number];

export const newFeatureActions = ['ignored', 'added-feature'] as const;
export type NewFeatureAction = (typeof newFeatureActions)[number];

export const reviewOutcomes = Object.values(TaskReviewOutcome);
export type ReviewOutcome = `${TaskReviewOutcome}`;

/* ----------------- */
// TASKS :: DB
/* -------- */

export type TaskDB = z.infer<typeof TaskBase>;
export type TaskDBRaw = z.infer<typeof TaskBaseRaw>;
export type TaskDBNew = z.infer<typeof TaskInsert>;
export type TaskDBPartial = z.infer<typeof TaskUpdate>;

export type Task = z.infer<typeof TaskAPI>;
export type TaskCollection = z.infer<typeof TaskCollectionAPI>;
export type TaskNew = z.infer<typeof TaskInsertAPI>;
export type TaskPartial = z.infer<typeof TaskUpdateAPI>;

/* ----------------- */
// SVELTE : PROPS
/* -------- */

export type FormProps = OrganisationForm | ProjectForm | LayerForm | FeatureForm;

export type PageProps<T extends Resource> = {
  data: {
    [key: string]: T;
  };
};

export type FormPageProps<T extends Resource> = {
  data: {
    validatedForm: SuperValidated<T>;
    entity: Ref;
    image?: Image | null;
  };
};

export type SectionProps = {
  form: Form;
  fields: FormField | FormFieldArray;
  fieldDiscriminator?: FieldDiscriminator;
  title?: string;
  subtitle?: string;
  cols?: number;
};

export type ExtendedParams = {
  locale?: LocaleExtended;
  field: FormFieldExtendedDefinition;
  fieldRoot: Field;
  fieldIndex: number;
  fieldKey: Field | 'value';
};

// FIELDS

export type FieldProps = SectionProps &
  ExtendedParams & {
    values?: string[];
    actions?: Record<string, (...args: any[]) => void>;
  };

export type UserFieldProps = SectionProps & {
  fieldRoot: Field;
  joinConfig: {
    discriminator: string; // e.g. 'role'
    uncheckedValue: string; // e.g. 'member'
    checkedValue: string; // e.g. 'owner'
  };
  searchMode: boolean;
  removeMode: boolean;
};

export type FieldPropsExtended = FieldProps & ExtendedParams;

export type ListFieldProps = FieldPropsExtended & {
  values: IntermediateValue[];
  actions: {
    add: (e: Event) => void;
    remove: (e: Event, valueId: Id) => void;
    update: (e: Event, valueId: Id, locale: Locale) => void;
    syncUp: () => void;
  };
  actionProps: {
    dragMode: boolean;
    removeMode: boolean;
    removeModeLocale?: string;
    confirmingId?: string;
  };
};

// PROVIDERS

export type ImageProviderProps = {
  children: any;
  mode: ImageCtxMode;
  isAdminMode: boolean;
  ctxType: ImageContextResource;
  ctxId: Id;
  organisation?: Omit<OrganisationDB, 'isCoreInclusive'>;
  project?: ProjectDB;
  image?: Image;
  ctxTypeSecondary?: ImageContextResourceExtended;
  ctxIdSecondary?: Id;
  highlightedIds?: Id[];
};

// ELEMENTS

export type InputProps = {
  id: Id;
  value: string;
  isGenAI: boolean;
  placeholder?: string;
  locale: LocaleExtended;
  isTranslated?: boolean;
  inputType?: 'text' | 'number' | 'email';
  onchange: Function;
};

export type SelectProps = {
  id: Id;
  value: string;
  values: readonly string[] | { readonly value: string; readonly id: string }[];
  isComplex?: boolean;
};

export type DisplayFieldProps = {
  label: string;
  value: any;
  justify?: 'start' | 'end';
  gridCell?: boolean;
};

/* ----------------- */
// PANELS :: APP
/* -------- */

export type PanelState = {
  filters: boolean;
  maps: boolean;
  stars: boolean;
  settings: boolean;
};

/* ----------------- */
// APP :: OMNIBAR
/* -------- */

export type OmniGroup = 'walks' | 'neighbourhoods' | 'features';

export type SearchResult = {
  name: string;
  count: number;
  group: OmniGroup;
  ref: string;
};

/* ----------------- */
// CTX STATE :: APP
/* -------- */

export type AppContextState = {
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

export type ImageCtxMode = 'standalone' | 'gallery';
export type ImageCtxState = {
  mode: ImageCtxMode;

  ctxType: ImageContextResource | null;
  ctxTypeSecondary: ImageContextResourceExtended | null;
  ctxId: Id | null;
  ctxIdSecondary: Id | null;

  organisation: OrganisationDB | null;
  project: ProjectDB | null;

  highlightedIds: Id[];
  uploadQueue: ImageUploadState[];
  loadStatus: Record<string, LoadStatus>;
  activeId: string | null;
  images: (Image & { preview?: string })[];
  preloadedImages: Set<string>;
  pendingConfirmation: SvelteSet<string>;
  deletionQueue: SvelteSet<string>;
  rejected: File[];
  thumbnailLoadStatus: Record<string, LoadStatus>;
};

export type ImageCtxOptions = {
  mode: ImageCtxMode;
  isAdminMode: boolean;
  ctxType: ImageContextResource;
  ctxId: Id;
  organisation?: OrganisationDB;
  project?: ProjectDB;
  image?: Image;
  ctxTypeSecondary?: ImageContextResourceExtended;
  ctxIdSecondary?: Id;
  highlightedIds?: Id[];
};

/* ----------------- */
// GEOCODING
/* -------- */

export type ParsedReverseGeocodeResultI18n = {
  displayAddress: string | undefined | null;
  displayAddressGen: boolean;
  addressProperties: Partial<AddressProperties>;
};

// IDENTIFY RESULT
export interface ParsedReverseGeocodeResult {
  addressMeta: AddressMeta;
  i18n: Record<Locale, ParsedReverseGeocodeResultI18n>;
}

export interface ReverseGeocodeResult {
  address: {
    Street: string;
    Neighborhood: string | null;
    City: string;
    Subregion: string | null;
    State: string;
    Country: string | null;
    Match_addr: string;
    Loc_name: string;
  };
  location: {
    x: number;
    y: number;
    spatialReference: {
      wkid: number;
      latestWkid: number;
    };
  };
}

// ALS RESULT
// Data Dictionary is available at:
// https://www.als.gov.hk/docs/Data_Dictionary_for_ALS_EN-v3.2.pdf
export interface ALSResult {
  // Input address information provided in the search request
  RequestAddress: {
    AddressLine: string[];
  };
  // List of suggested addresses that match the search criteria
  SuggestedAddress?: Array<{
    Address: {
      PremisesAddress: {
        // English address components
        EngPremisesAddress: {
          // Building/Block information
          EngBlock: {
            BlockDescriptor: string; // Block type (e.g., "BLK", "TOWER")
            BlockNo: string; // Block number
            BlockDescriptorPrecedenceIndicator: string; // Whether BlockDescriptor appears before BlockNo
          };
          BuildingName: string; // English name of the building
          // Estate information
          EngEstate: {
            EstateName: string; // English name of the estate
            EngPhase?: {
              // Optional phase information
              PhaseName?: string;
              PhaseNo?: string;
            };
          };
          // Street information
          EngStreet: {
            StreetName: string; // English street name
            BuildingNoFrom: string; // Starting street number
            BuildingNoTo?: string; // Optional ending street number
            EngVillage?: {
              LocationName: string;
            };
          };
          // District information
          EngDistrict: {
            DcDistrict: string; // English district name
          };
          Region: string; // Region code (HK/KLN/NT)
        };
        // Chinese address components
        ChiPremisesAddress: {
          // Building/Block information
          ChiBlock: {
            BlockDescriptor: string; // Block type in Chinese (e.g., "座", "樓")
            BlockNo: string; // Block number
            BlockDescriptorPrecedenceIndicator?: string;
          };
          BuildingName: string; // Chinese name of the building
          // Estate information
          ChiEstate: {
            EstateName: string; // Chinese name of the estate
            ChiPhase?: {
              // Optional phase information
              PhaseName?: string;
              PhaseNo?: string;
            };
          };
          // Street information
          ChiStreet: {
            StreetName: string; // Chinese street name
            BuildingNoFrom: string; // Starting street number
            BuildingNoTo?: string; // Optional ending street number
          };
          // District information
          ChiDistrict: {
            DcDistrict: string; // Chinese district name
          };
          Region: string; // Region in Chinese (香港/九龍/新界)
        };
        // Unique identifier for the address
        GeoAddress: string; // Unique address reference number
        // Spatial coordinates
        GeospatialInformation: {
          Northing: string; // HK1980 Grid Northing
          Easting: string; // HK1980 Grid Easting
          Latitude: string; // WGS84 latitude
          Longitude: string; // WGS84 longitude
        };
      };
    };
    // Address matching confidence
    ValidationInformation: {
      Score: number; // Confidence score (0-100)
    };
  }>;
}

export type NeighbourhoodMap = Record<
  string,
  {
    i18n: Record<
      Locale,
      {
        name: string;
        neighbourhood: string;
        district: string;
        region: string;
      }
    >;
  }
>;

export type Neighbourhood = {
  neighbourhood: string;
  data: {
    neighbourhood: string;
    region: string;
    district: string;
  };
};

export type ALSSuggestedAddressItem = NonNullable<
  ALSResult['SuggestedAddress']
>[number];

/* ----------------- */
// HUB TYPES
/* -------- */

export type HubDB = z.infer<typeof HubBase>;
export type HubDBBasic = z.infer<typeof HubBasic>;
export type HubDBNew = z.infer<typeof HubInsert>;
export type HubDBPartial = z.infer<typeof HubUpdate>;

export type Hub = z.infer<typeof HubAPI>;
export type HubCollection = z.infer<typeof HubCollectionAPI>;
export type HubNew = z.infer<typeof HubInsertAPI>;
export type HubPartial = z.infer<typeof HubUpdateAPI>;

export type HubDBRaw = z.infer<typeof HubRaw>;

/* ----------------- */
// HUBS :: RELATIONAL
/* -------- */

// hubI18n, but with the hubId - for use in DB seeding & selects
export type HubI18nDB = z.infer<typeof HubI18nBase>;
// hubI18n, but without hubId - for use in API insertions
export type HubI18nNew = z.infer<typeof HubI18nInsert>;
// Same as HubI18nNew, but all fields are optional
export type HubI18nPartial = z.infer<typeof HubI18nUpdate>;

export interface HubOpts {
  code?: string;
  domain?: string;
  isCore: boolean;
  isSuperAdmin?: boolean;
}

/* ----------------- */
// TYPESCRIPT UTILITIES
/* -------- */

// RECURSIVE PARTIAL
export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

// Only make some keys optional
export type PickPartial<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Make all keys optional except for the ones in K
export type PartialExcept<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;

/* ----------------- */
// GUARDS
/* -------- */

// Type guard to narrow the type
export function isOrganisationOrProject(
  resource: Resource
): resource is Organisation | Project {
  return 'code' in resource;
}

// Type guards for resource types
export function isOrganisation(resource: Resource): resource is Organisation {
  return (
    !('organisationId' in resource) &&
    !('layerId' in resource) &&
    !('featureId' in resource) &&
    !('projectId' in resource) &&
    'userRoles' in resource
  );
}

export function isProject(resource: Resource): resource is Project {
  return 'organisationId' in resource;
}

export function isLayer(resource: Resource): resource is Layer {
  return 'projectId' in resource;
}

export function isFeature(resource: Resource): resource is Feature {
  return 'layerId' in resource;
}

export function isHub(resource: Resource): resource is Hub {
  return 'organisation' in resource && 'domain' in resource;
}

// FEATURE TYPES
export type { FeatureClientExt, FeatureI18nFieldKeys } from './db/zod/schema/feature';
