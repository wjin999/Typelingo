import { describe, expect, it } from 'vitest'
import { GRADES, reviewSentence, studyPlan } from './scheduler'

const now = new Date('2026-09-13T12:00:00Z')
const items = Array.from({ length: 20 }, (_, index) => ({ id: `sentence-${index}`, sourceNoteId: `note-${index}`,
  text: '猫', nativeText: '猫', ruby: [{ text: '猫', reading: 'ねこ' }] }))

describe('memory review scheduling', () => {
  it('assigns distinct Anki-style intervals to all four ratings', () => {
    const due = GRADES.map((grade) => Date.parse(reviewSentence(undefined, 'deck', items[0]!, grade, now).card.due))
    expect(due[0]).toBeLessThan(due[1]!)
    expect(due[1]).toBeLessThanOrEqual(due[2]!)
    expect(due[2]).toBeLessThan(due[3]!)
    expect(due.every((date) => date > now.getTime())).toBe(true)
  })

  it('selects due reviews before new cards and enforces the daily new limit across sessions', () => {
    const yesterday = new Date(now.getTime() - 86400000)
    const due = reviewSentence(undefined, 'deck', items[8]!, 1, yesterday)
    const learnedToday = reviewSentence(undefined, 'deck', items[0]!, 4, now)
    const plan = studyPlan(items, 'deck', [due, learnedToday], 3, now)
    expect(plan.queue[0]?.id).toBe(items[8]?.id)
    expect(plan.newCount).toBe(2)
    expect(plan.queue).toHaveLength(3)
    expect(plan.queue.some((item) => item.id === items[0]?.id)).toBe(false)
  })

  it('keeps sibling examples apart, honors supplied filters, and resets the new limit next day', () => {
    const siblings = items.map((item) => ({ ...item, sourceNoteId: 'shared-note' }))
    expect(studyPlan(siblings, 'deck', [], 10, now).queue).toHaveLength(1)
    const card = reviewSentence(undefined, 'deck', items[0]!, 4, now)
    expect(studyPlan(items.slice(1), 'deck', [card], 1, now).queue).toHaveLength(0)
    const tomorrow = new Date(now.getTime() + 86400000)
    expect(studyPlan(items.slice(1), 'deck', [card], 1, tomorrow).newCount).toBe(1)
  })
})
