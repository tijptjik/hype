// @vitest-environment jsdom
// TESTS
import { expect, it, vi } from 'vitest'
// CONTEXT
import { AdminMap } from '#lib/context/adminMap.svelte.js'

it('ignores an old route teardown after a new route takes the map', () => {
  const owner = new AdminMap()
  const first = document.createElement('section')
  const next = document.createElement('section')
  const container = document.createElement('div')
  owner.container = container
  owner.parking = document.createElement('div')
  const props = { coordinates: [114.16, 22.3182], addressMeta: null }
  owner.attach(first, props)
  owner.attach(next, props)
  owner.release(first)
  expect(owner.target).toBe(next)
  expect(container.parentElement).toBe(next)
  expect(owner.props).toBe(props)
})

it('parks the renderer and releases route callbacks while retaining its coordinates', () => {
  const owner = new AdminMap()
  const outlet = document.createElement('section')
  const container = document.createElement('div')
  const parking = document.createElement('div')
  owner.container = container
  owner.parking = parking
  const onMapReady = vi.fn()
  const dragEndCallback = vi.fn()
  owner.attach(outlet, {
    coordinates: [114.16, 22.3182],
    addressMeta: null,
    onMapReady,
    dragEndCallback,
    draggable: true,
  })
  owner.release(outlet)
  expect(container.parentElement).toBe(parking)
  expect(owner.props?.coordinates).toEqual([114.16, 22.3182])
  expect(owner.props?.onMapReady).toBeUndefined()
  expect(owner.props?.dragEndCallback).toBeUndefined()
  expect(owner.props?.draggable).toBe(false)
  owner.clear()
  expect(owner.props).toBeNull()
})
