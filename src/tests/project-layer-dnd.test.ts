// @vitest-environment jsdom
import { render, fireEvent, cleanup } from '@testing-library/svelte/pure'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import FormProjectLayersSection from '$lib/bits/patterns/forms/formProjectLayersSection/FormProjectLayersSection.svelte'

vi.mock('$lib/bits/core', async () => {
  const { default: Component } = await import('./mocks/svelte-component.svelte')
  return { SimpleTooltip: Component }
})
vi.mock('$lib/bits/custom', async () => {
  const { default: Component } = await import('./mocks/svelte-component.svelte')
  return { Card: { Actions: Component }, SectionHeader: Component, Switch: Component }
})
vi.mock('$lib/bits/patterns/cards/resourceCard', async () => {
  const { default: Root } = await import('./mocks/svelte-component.svelte')
  return { ResourceCard: { Root, Body: Root } }
})

const items = ['a', 'b'].map(id => ({
  id,
  layerName: `Layer ${id}`,
  projectNameShort: 'Project',
  isDefaultVisible: true,
}))

beforeEach(() => {
  vi.useRealTimers()
  // jsdom has no layout hit testing; auto-scroll can safely see empty space.
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => null,
  })
})
afterEach(cleanup)

describe('project layer drag and drop', () => {
  it('moves a layer onto another layer using the library actions', async () => {
    const onMove = vi.fn()
    const { container } = render(FormProjectLayersSection, {
      title: 'Layers',
      items,
      onMove,
      onToggleDefault: vi.fn(),
    })
    const [source, target] = container.querySelectorAll('[draggable="true"]')
    const payload = new Map<string, string>()
    const dataTransfer = {
      setData: (type: string, value: string) => payload.set(type, value),
      getData: (type: string) => payload.get(type) ?? '',
    }
    await fireEvent.dragStart(source, { dataTransfer })
    expect(container.querySelectorAll('[data-dnd-active="true"]')).toHaveLength(2)
    await fireEvent.dragEnter(target, { dataTransfer })
    await fireEvent.dragOver(target, { dataTransfer, clientY: 10 })
    await fireEvent.drop(target, { dataTransfer })
    expect(onMove).toHaveBeenCalledExactlyOnceWith('a', 'b')
    await fireEvent.dragEnd(source)
    expect(container.querySelectorAll('[data-dnd-active="true"]')).toHaveLength(0)
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
