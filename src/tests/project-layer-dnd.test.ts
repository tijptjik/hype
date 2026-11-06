// @vitest-environment jsdom
import { render, fireEvent, cleanup } from '@testing-library/svelte/pure'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import FormProjectLayersSection from '#lib/bits/patterns/forms/formProjectLayersSection/FormProjectLayersSection.svelte'

vi.mock('#lib/bits/core/index.js', async () => {
  const { default: Component } = await import('./mocks/svelte-component.svelte')
  return { SimpleTooltip: Component }
})
vi.mock('#lib/bits/custom/index.js', async () => {
  const Card = await import('#lib/bits/custom/card/index.js')
  const { default: Component } = await import('./mocks/svelte-component.svelte')
  return { Card, SectionHeader: Component, Switch: Component }
})
vi.mock('#lib/bits/patterns/cards/resourceCard/index.js', async () => {
  const { default: Root } = await import(
    '#lib/bits/patterns/cards/resourceCard/components/Root.svelte'
  )
  const { default: Body } = await import(
    '#lib/bits/patterns/cards/resourceCard/components/Body.svelte'
  )
  return { ResourceCard: { Root, Body } }
})

const items = ['a', 'b'].map(id => ({
  id,
  layerName: `Layer ${id}`,
  projectNameShort: 'Project',
  isDefaultVisible: true,
}))

beforeEach(() => {
  vi.useRealTimers()
  // Real card titles observe their width; jsdom does not provide layout observers.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
  // jsdom has no layout hit testing; auto-scroll can safely see empty space.
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => null,
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('project layer drag and drop', () => {
  it('moves a layer onto another layer using the library actions', async () => {
    const onMove = vi.fn()
    const { container } = render(FormProjectLayersSection, {
      title: 'Layers',
      items,
      onMove,
      onToggleDefault: vi.fn(),
    })
    const [source, target] = container.querySelectorAll('[data-dnd-item]')
    const grip = source.querySelector('.bits-card__drag-handle > *')!
    const payload = new Map<string, string>()
    const dataTransfer = {
      setData: (type: string, value: string) => payload.set(type, value),
      getData: (type: string) => payload.get(type) ?? '',
    }
    // Start from the real nested grip, as a browser pointer gesture does.
    await fireEvent.pointerDown(grip)
    await fireEvent.dragStart(source, { dataTransfer })
    expect(container.querySelectorAll('[data-dnd-active="true"]')).toHaveLength(2)
    await fireEvent.dragEnter(target, { dataTransfer })
    await fireEvent.dragOver(target, { dataTransfer, clientY: 10 })
    await fireEvent.drop(target, { dataTransfer })
    expect(onMove).toHaveBeenCalledExactlyOnceWith('a', 'b')
    await fireEvent.dragEnd(source)
    expect(container.querySelectorAll('[data-dnd-active="true"]')).toHaveLength(0)
  })

  it('keeps layer links interactive without starting a reorder', async () => {
    const onMove = vi.fn()
    const { container } = render(FormProjectLayersSection, {
      title: 'Layers',
      items,
      onMove,
      onToggleDefault: vi.fn(),
    })
    const source = container.querySelector('[data-dnd-item]')!
    const link = source.querySelector('a')!
    await fireEvent.pointerDown(link)
    expect(await fireEvent.dragStart(source)).toBe(false)
    expect(container.querySelectorAll('[data-dnd-active="true"]')).toHaveLength(0)
    expect(onMove).not.toHaveBeenCalled()
    expect(link.getAttribute('href')).toBe('/admin/layers/a')
  })

  it.each([{ isEditing: false }, { isSubmitting: true }])(
    'disables drag and drop with %o',
    props => {
      const { container } = render(FormProjectLayersSection, {
        title: 'Layers',
        items,
        onMove: vi.fn(),
        onToggleDefault: vi.fn(),
        ...props,
      })
      expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(0)
      expect(container.querySelectorAll('[draggable="false"]')).toHaveLength(2)
    },
  )
})
