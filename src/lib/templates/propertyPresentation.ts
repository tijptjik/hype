/** Metadata shared by template property choices and automatic previews. */
export type TemplateProperty = {
  path: string
  label: string
  code?: string
  component?: string
  options?: { value: string; label: string }[]
  examples?: Record<string, string>
  test?: 'boolean' | 'hasValue'
}

/** Describe a property without exposing storage paths in the editor.
 * @param property Permitted property metadata. @returns Display name, source and type.
 */
export function describeTemplateProperty(property: TemplateProperty): {
  name: string
  source: string
  type: 'text' | 'boolean' | 'phone' | 'url'
} {
  const names: Record<string, string> = {
    'feature.name': 'Name',
    'location.name': 'Name',
    'source.name': 'Name',
    'brand.name': 'Brand',
    'group.name': 'Group',
    'format.name': 'Format',
    branch: 'Branch',
    address: 'Address',
    accessHint: 'Access hint',
    phoneNumber: 'Phone number',
    website: 'Website',
  }
  const name =
    names[property.path] ?? property.label.split(' · ').at(-1) ?? property.label
  return {
    name,
    source:
      property.path === 'accessHint'
        ? 'Feature address'
        : property.path.startsWith('properties.')
          ? 'Feature property'
          : property.path.startsWith('feature.')
            ? 'Feature'
            : property.path.startsWith('source.')
              ? 'Provided name'
              : 'Linked location',
    type:
      property.test === 'boolean'
        ? 'boolean'
        : property.path === 'phoneNumber' ||
            property.component?.toLowerCase().includes('phone')
          ? 'phone'
          : property.path === 'website'
            ? 'url'
            : 'text',
  }
}

/** Pick a saved example in the current locale or generate a clearly labelled placeholder.
 * @param property Permitted property metadata. @param locale Preview language.
 * @returns Preview-only value; never persisted to a record.
 */
export function templatePreviewValue(
  property: TemplateProperty,
  locale = 'en',
): string | boolean | number {
  if (property.path === 'session.sequence') return 1
  const example = property.examples?.[locale]
  if (example) return example
  const { name, type } = describeTemplateProperty(property)
  return type === 'boolean'
    ? true
    : `Sample ${name.charAt(0).toUpperCase()}${name.slice(1)}`
}
