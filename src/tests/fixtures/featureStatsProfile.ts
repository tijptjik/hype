import '#lib/styles/app.css'
import { mount, unmount, tick } from 'svelte'
import StatsPips from '#lib/bits/custom/featureStats/components/StatsPips.svelte'
import { getCachedFeatureRowModel } from '#lib/client/services/featureRow.js'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { UserPreferences } from '#lib/db/zod/schema/user.types.js'

const appCtx = {
  cache: { stats: new Map(), layer: new Map(), property: new Map() },
} as unknown as ResourceViewCtx
const features = Array.from({ length: 10000 }, (_, id) => ({
  id: `profile-${id}`,
  layerId: 'test',
  properties: [],
  images: [],
  isPublished: true,
  isPendingReview: false,
  isVisitable: true,
  isIntangible: false,
  i18n: {
    en: {
      title: `Feature ${id}`,
      description: 'Description',
      displayAddress: 'Address',
    },
    zhHant: { title: '名稱', description: '描述', displayAddress: '地址' },
  },
})) as unknown as Feature[]
const params = {
  appCtx,
  localeKey: 'en' as const,
  activeTranslationLocales: ['en', 'zhHant'] as ('en' | 'zhHant')[],
  isSuperAdmin: true,
  userPreferences: {} as UserPreferences,
}
const tooltipMode =
  new URLSearchParams(location.search).get('mode') === 'native' ? 'native' : 'rich'
const target = document.getElementById('app')
if (!target) throw new Error('Missing profile target')
target.style.cssText = 'display:grid;grid-template-columns:repeat(6,80px);gap:6px'
document.documentElement.setAttribute('data-theme', 'hype-dark')
const samples: Record<string, number[]> = {
  calculateCold: [],
  calculateWarm: [],
  calculateVisible: [],
  mount: [],
  unmount: [],
}
for (let run = 0; run < 5; run++) {
  let started = performance.now()
  const models = features.map(feature =>
    getCachedFeatureRowModel({
      ...params,
      feature: { ...feature, id: `${run}-${feature.id}` },
    }),
  )
  samples.calculateCold.push(performance.now() - started)
  started = performance.now()
  features.forEach(feature => {
    getCachedFeatureRowModel({
      ...params,
      feature: { ...feature, id: `${run}-${feature.id}` },
    })
  })
  samples.calculateWarm.push(performance.now() - started)
  started = performance.now()
  features.slice(0, 28).map(feature =>
    getCachedFeatureRowModel({
      ...params,
      feature: { ...feature, id: `visible-${run}-${feature.id}` },
    }),
  )
  samples.calculateVisible.push(performance.now() - started)
  started = performance.now()
  const components = models.slice(0, 28).flatMap(model =>
    Object.entries(model.stats).map(([title, statuses]) =>
      mount(StatsPips, {
        target,
        props: { title, statuses, showTitle: false, tooltipMode },
      }),
    ),
  )
  await tick()
  target.offsetHeight
  samples.mount.push(performance.now() - started)
  started = performance.now()
  await Promise.all(components.map(component => unmount(component)))
  samples.unmount.push(performance.now() - started)
}
console.log('PROFILE', JSON.stringify(samples))
document.body.dataset.results = JSON.stringify(samples)
