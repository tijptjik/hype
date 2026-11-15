/** Operating body for a Location, independent of brands, corporate groups and access ownership. */
export type LocationOperator = {
  referenceCode?: string | null
  id: string
  names: Record<string, string>
  logo: string | null
  website: string | null
}
