import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { loadImportedDecks, saveImportedDeck } from './deck-storage'
import type { Lesson } from '../types'

const deck: Lesson = {
  schemaVersion: 2, id: 'anki-test', title: '测试导入', nativeLanguage: 'zh-CN', targetLanguage: 'ja',
  items: [{ id: 'anki-test:1', text: '猫です', nativeText: '是猫', ruby: [{ text: '猫', reading: 'ねこ' }, { text: 'です' }] }],
}
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('localStorage', { setItem: vi.fn() }) })
afterEach(() => { vi.unstubAllGlobals() })

describe('imported deck persistence', () => {
  it('persists examples and readings and updates rather than duplicating a deck', async () => {
    await saveImportedDeck(deck)
    expect(await loadImportedDecks()).toEqual([deck])
    await saveImportedDeck({ ...deck, title: '新名称' })
    const saved = await loadImportedDecks()
    expect(saved).toHaveLength(1)
    expect(saved[0]?.title).toBe('新名称')
    expect(saved[0]?.items[0]?.ruby).toEqual(deck.items[0]?.ruby)
  })
})
