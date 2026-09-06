// @vitest-environment jsdom

import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import lessonData from './data/egg-rolls.json'
import 'fake-indexeddb/auto'
import {
  addHistoryEntry,
  clearPermanentlySkippedSentences,
  loadHistory,
  permanentlySkipSentence,
} from './lib/storage'

let container: HTMLDivElement
let root: Root

vi.mock('./lib/default-deck', () => ({ loadDefaultDeck: async () => lessonData }))

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.localStorage.clear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function mountApp() {
  await act(async () => root.render(createElement(StrictMode, null, createElement(App))))
}

function button(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll('button')].find((element) =>
    element.textContent?.includes(label),
  )
  if (!match) throw new Error(`Button not found: ${label}`)
  return match
}

function clickButton(label: string) {
  act(() => button(label).click())
}

function storageChanged(key: string | null) {
  act(() => window.dispatchEvent(new StorageEvent('storage', {
    key,
    storageArea: window.localStorage,
  })))
}

describe('practice storage and empty lesson states', () => {
  it('renders the home screen even when a saved date is invalid', async () => {
    window.localStorage.setItem('typelingo.history.ja.v2', JSON.stringify([{
      id: 'invalid-session',
      completedAt: 'not-a-date',
      lessonId: 'ja-basic',
      sentenceCount: 1,
      elapsedMs: 1000,
    }]))

    await expect(mountApp()).resolves.not.toThrow()
    expect(button('开始练习').disabled).toBe(false)
    expect(container.querySelectorAll('.history-row')).toHaveLength(0)
  })

  it('updates visible history and skipped counts after another tab changes storage', async () => {
    await mountApp()
    addHistoryEntry([], {
      id: 'another-tab',
      completedAt: '2026-09-05T00:00:00.000Z',
      lessonId: 'ja-basic',
      sentenceCount: 3,
      elapsedMs: 2000,
    })
    storageChanged('typelingo.history.ja.v2')
    expect(container.querySelector('.history-row')?.textContent).toContain('完成 3 句')

    permanentlySkipSentence([], lessonData.items[0]!.id)
    storageChanged('typelingo.skipped-sentences.ja.v1')
    expect(button('已永久跳过 1 句')).toBeDefined()

    clearPermanentlySkippedSentences()
    storageChanged('typelingo.skipped-sentences.ja.v1')
    expect(container.textContent).not.toContain('恢复全部')

    window.localStorage.clear()
    storageChanged(null)
    expect(container.querySelectorAll('.history-row')).toHaveLength(0)
  })

  it('disables restart when the final available sentence is skipped and enables it after restore', async () => {
    window.localStorage.setItem('typelingo.skipped-sentences.ja.v1', JSON.stringify(
      lessonData.items.slice(1).map((item) => item.id),
    ))
    await mountApp()
    clickButton('开始练习')
    clickButton('永远跳过该句')

    expect(button('再来一组').disabled).toBe(true)
    expect(container.textContent).toContain('没有可练习句子，请返回主页恢复已跳过的句子。')
    expect(loadHistory()).toHaveLength(1)
    expect(loadHistory()[0]?.sentenceCount).toBe(0)

    clearPermanentlySkippedSentences()
    storageChanged('typelingo.skipped-sentences.ja.v1')
    expect(button('再来一组').disabled).toBe(false)
    clickButton('再来一组')
    expect(container.querySelector('.progress-count')?.textContent).toBe('1 / 10')
  })
})
