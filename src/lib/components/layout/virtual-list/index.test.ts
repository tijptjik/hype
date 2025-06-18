import { describe, expect, test } from 'vitest'
import SvelteVirtualListDefault, {
    type SvelteVirtualListDebugInfo,
    type SvelteVirtualListMode,
    type SvelteVirtualListProps
} from './index.js'
import SvelteVirtualListDirect from './SvelteVirtualList.svelte'

describe('index.ts exports', () => {
    test('should export SvelteVirtualList as default', () => {
        expect(SvelteVirtualListDefault).toBeDefined()
        expect(SvelteVirtualListDefault).toBe(SvelteVirtualListDirect)
    })

    test('should export correct types', () => {
        // Create objects that match the exported types to verify type exports
        const debugInfo: SvelteVirtualListDebugInfo = {
            visibleItemsCount: 10,
            startIndex: 0,
            endIndex: 10,
            totalItems: 100,
            processedItems: 50,
            averageItemHeight: 30
        }

        const mode: SvelteVirtualListMode = 'topToBottom'

        const props: SvelteVirtualListProps = {
            items: [],
            renderItem: () => null
        }

        expect(debugInfo).toBeDefined()
        expect(mode).toBeDefined()
        expect(props).toBeDefined()
    })
})
