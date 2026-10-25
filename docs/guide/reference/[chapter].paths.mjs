// One page per chapter of the scenario skill (see ../../.vitepress/config.mjs).
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../../../plugins/tablefolk-scenario/skills/tablefolk-scenario/reference/', import.meta.url))

export default {
  paths: () => fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => ({
    params: { chapter: f.slice(0, -3) },
    content: fs.readFileSync(dir + f, 'utf8'),
  })),
}
