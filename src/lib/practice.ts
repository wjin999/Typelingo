import type { LessonItem } from '../types'

export function sampleItems(
  items: LessonItem[],
  limit: number,
  random: () => number = Math.random,
): LessonItem[] {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = shuffled[index]
    const swap = shuffled[swapIndex]

    if (current && swap) {
      shuffled[index] = swap
      shuffled[swapIndex] = current
    }
  }

  return shuffled.slice(0, Math.max(0, limit))
}

export function formatDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
