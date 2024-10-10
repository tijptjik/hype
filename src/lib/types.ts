export type ResourceTypes = 'organisation' | 'project' | 'layer' | 'feature';
export type FilterableResourceTypes = 'organisation' | 'project' | 'layer';
export type ResourceFilters = { [key in FilterableResourceTypes]?: string[] };
export type Resource = { id: string; nameShort: string; ref: string; description: string };
export type ResourceWithData<T> = { data: T; id: string; nameShort: string; ref: string; description: string };