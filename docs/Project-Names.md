# Project names

`projectI18n.name` is the full project title. `nameShort` is a meaningful short
name that can stand alone; do not store a generic “All” there to avoid repeating
the organisation name.

`project.useAllInOrgContext` controls that replacement independently of locale.
The project profile's **Same as Organisation** checkboxes edit this single shared
boolean. New projects default to false.

Use `getProjectDisplayName` for project labels:

| Context | Label |
| --- | --- |
| Project list or standalone title | Full name (`variant: 'full'`) |
| Compact standalone label, including default maps | Short name, falling back to full name |
| Breadcrumb with the organisation shown | Localised “All” when enabled; otherwise short name |

Full titles never become “All”. Default maps add the organisation only when
distinct projects share the displayed short name; those qualified rows apply the
same breadcrumb rule. Sort by standalone project label, then by layer name, keeping
distinct projects with equal labels in separate groups.

Organisation labels use `text-primary`, project labels `text-accent`, and layer
labels `text-secondary`. Compact project ancestor payloads must retain
`useAllInOrgContext`, including optimistic updates to descendant breadcrumbs.

Migration `0092_project_org_context_name.sql` enables the flag only for the existing
Hong Kong Ghost Signs project and replaces its former English short name “All”
with “HK Ghost Signs”. Other projects and curated translations are preserved.
