import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { createServer } from 'vite'
import initSqlJs from 'sql.js'

const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/import-default-deck.mjs <egg-rolls.apkg>')
const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' })
try {
  const { readApkg, suggestMappings, convertAnki, EGG_ROLLS_ID } = await server.ssrLoadModule('/src/lib/anki.ts')
  const pkg = await readApkg(new Uint8Array(await readFile(input)), basename(input), await initSqlJs())
  if (pkg.info.id !== EGG_ROLLS_ID) throw new Error('Expected the egg rolls v3.5 deck.')
  const lesson = convertAnki(pkg, suggestMappings(pkg.info))
  if (!lesson.items.length) throw new Error('No usable examples were found.')
  lesson.metadata.builtIn = true
  await writeFile('src/data/egg-rolls.json', JSON.stringify(lesson) + '\n', 'utf8')
  console.log(JSON.stringify({
    sentences: lesson.items.length, ...lesson.metadata,
    levels: Object.fromEntries(['N5','N4','N3','N2','N1'].map(level => [level, lesson.items.filter(item => item.level === level).length])),
    examples: lesson.items.slice(0, 3),
  }, null, 2))
} finally { await server.close() }
