import { parseDocument } from 'htmlparser2'
import type { ChildNode } from 'domhandler'
import type { RubyPart } from '../types'

const ignoredTags = new Set(['script', 'style', 'iframe', 'object', 'audio', 'video', 'img'])

function nodeText(node: ChildNode, includeReading = false): string {
  if (node.type === 'text') return node.data
  if (!('children' in node)) return ''
  const name = 'name' in node ? node.name : ''
  if (ignoredTags.has(name) || (!includeReading && (name === 'rt' || name === 'rp'))) return ''
  if (name === 'br') return '\n'
  return node.children.map((child) => nodeText(child, includeReading)).join('') +
    (['p', 'div', 'li'].includes(name) ? '\n' : '')
}

export function plainText(html: string): string {
  return parseDocument(html).children.map((node) => nodeText(node)).join('')
    .replace(/\[sound:[^\]]*\]/gi, '')
    .replace(/\{\{c\d+::(.*?)(?:::[\s\S]*?)?\}\}/g, '$1')
    .replace(/\s+/g, ' ').trim()
}

function annotatedParts(html: string): RubyPart[] {
  const result: RubyPart[] = []
  function visit(node: ChildNode) {
    if (node.type === 'text') {
      const pattern = /([^\s\[\]]+)\[([^\[\]]+)\]/g
      let offset = 0
      for (const match of node.data.matchAll(pattern)) {
        if (match.index > offset) result.push({ text: node.data.slice(offset, match.index) })
        result.push({ text: match[1]!, reading: match[2]! })
        offset = match.index + match[0].length
      }
      if (offset < node.data.length) result.push({ text: node.data.slice(offset) })
      return
    }
    if (!('children' in node)) return
    const name = 'name' in node ? node.name : ''
    if (ignoredTags.has(name) || name === 'rt' || name === 'rp') return
    if (name === 'ruby') {
      const reading = node.children.filter((child) => 'name' in child && child.name === 'rt')
        .map((child) => nodeText(child, true)).join('')
      result.push({ text: nodeText(node), ...(reading ? { reading } : {}) })
    } else if (name === 'br') result.push({ text: ' ' })
    else node.children.forEach(visit)
  }
  parseDocument(html).children.forEach(visit)
  return result
}

export function parseFurigana(target: string, annotation: string): { ruby: RubyPart[]; aligned: boolean } {
  if (!annotation.trim()) return { ruby: [{ text: target }], aligned: true }
  const parts = annotatedParts(annotation)
  // Anki inserts spaces before annotated words; align against the original target
  // so those separators never become required keystrokes or alter punctuation.
  const ruby: RubyPart[] = []
  let offset = 0
  for (const part of parts) {
    const base = part.text.replace(/\s+/g, '')
    if (!base) continue
    while (target[offset] === ' ') {
      ruby.push({ text: ' ' })
      offset += 1
    }
    if (!target.startsWith(base, offset)) {
      return { ruby: [{ text: target }], aligned: false }
    }
    ruby.push({ text: base, ...(part.reading ? { reading: part.reading.trim() } : {}) })
    offset += base.length
  }
  if (offset !== target.length) return { ruby: [{ text: target }], aligned: false }
  return { ruby, aligned: true }
}
