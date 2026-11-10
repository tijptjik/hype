// I18N
import { getLocaleKey } from '#lib/i18n.js'
const labels: Record<string, readonly [string, string, string]> = {
  kind: ['Location kind', '地點種類', '地点种类'],
  class: ['Location class', '地點類別', '地点类别'],
  unknown: ['Unknown', '未知', '未知'],
  built: ['Built place', '建成場所', '建成场所'],
  geographic: ['Geographic feature', '地理地物', '地理地物'],
  operational: ['Operational', '營運場所', '运营场所'],
  service_point: ['Service point', '服務點', '服务点'],
  premises_address: ['Premises', '處所地址', '处所地址'],
  cadastral_address: ['Cadastral', '地籍地址', '地籍地址'],
  linear_reference: ['Linear reference', '線性參照', '线性参照'],
  establishment: ['Establishment', '商戶或場所', '商户或场所'],
  address: ['Address', '地址', '地址'],
  premises: ['Premises / site', '場地／園區', '场地／园区'],
  building: ['Building', '建築物', '建筑物'],
  building_part: ['Building part', '建築物部分', '建筑物部分'],
  structure: ['Other structure', '其他構築物', '其他构筑物'],
  thoroughfare: ['Thoroughfare', '道路／通道', '道路／通道'],
  landform: ['Landform', '地形', '地形'],
  coastal_feature: ['Coastal feature', '海岸地物', '海岸地物'],
  water_feature: ['Water feature', '水域地物', '水域地物'],
}
/** Label a taxonomy field or value in the active locale.
 * @param value Taxonomy field or enum member. @returns Localized label.
 */
export function locationTaxonomyLabel(value: string): string {
  return (
    labels[value]?.[
      getLocaleKey() === 'zhHant' ? 1 : getLocaleKey() === 'zhHans' ? 2 : 0
    ] ?? value
  )
}
