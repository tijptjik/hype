export type ResourceTypes = 'organisation' | 'project' | 'layer' | 'feature';
export type SectionTypes = 'core' | 'address' | 'images';
export type FilterableResourceTypes = 'organisation' | 'project' | 'layer';
export type ResourceFilters = { [key in FilterableResourceTypes]: string[] };
export type Resource = { id: string; name: string; nameShort: string; ref: string; description: string };
export type ResourceWithData<T> = { data: T; id: string; name: string; nameShort: string; ref: string; description: string };