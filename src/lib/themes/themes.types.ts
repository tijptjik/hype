export type ThemeId = 'hype-dark' | 'hype-light' | 'breadline-light' | 'breadline-dark'
export type ThemeDefinition = {
  id: ThemeId
  name: string
  mode: 'light' | 'dark'
  family: 'Hype' | 'Breadline'
}
