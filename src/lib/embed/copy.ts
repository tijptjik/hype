import type { EmbedConfig } from './config'
const en = {
  maps: 'Maps',
  filters: 'Filters',
  settings: 'Settings',
  more: 'For more maps, see Hype',
  languages: 'Language',
  theme: 'Theme',
  divisions: 'Divisions',
  categories: 'Categories',
  close: 'Close',
  loading: 'Loading map…',
  empty: 'No public layers are available for this map.',
  noFeatures: 'No places match your selection.',
  unavailable: 'This map is unavailable.',
  retry: 'Retry',
  places: 'Places',
  search: 'Search places',
  open: 'Open in Hype',
  reset: 'Clear filters',
}
const hant: typeof en = {
  maps: '地圖',
  filters: '篩選',
  settings: '設定',
  more: '更多地圖，請瀏覽 Hype',
  languages: '語言',
  theme: '主題',
  divisions: '地區',
  categories: '分類',
  close: '關閉',
  loading: '正在載入地圖…',
  empty: '此地圖沒有可用的公開圖層。',
  noFeatures: '沒有符合篩選條件的地點。',
  unavailable: '此地圖暫時無法使用。',
  retry: '重試',
  places: '地點',
  search: '搜尋地點',
  open: '在 Hype 開啟',
  reset: '清除篩選',
}
const hans: typeof en = {
  maps: '地图',
  filters: '筛选',
  settings: '设置',
  more: '更多地图，请浏览 Hype',
  languages: '语言',
  theme: '主题',
  divisions: '地区',
  categories: '分类',
  close: '关闭',
  loading: '正在载入地图…',
  empty: '此地图没有可用的公开图层。',
  noFeatures: '没有符合筛选条件的地点。',
  unavailable: '此地图暂时无法使用。',
  retry: '重试',
  places: '地点',
  search: '搜索地点',
  open: '在 Hype 打开',
  reset: '清除筛选',
}
/** Returns embed-only UI copy without account or cookie preferences.
 * @param lang Selected language. @returns Localized control labels.
 */
export function embedCopy(lang: EmbedConfig['lang']): typeof en {
  return lang === 'zh-Hant' ? hant : lang === 'zh-Hans' ? hans : en
}
