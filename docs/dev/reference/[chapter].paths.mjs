// One page per chapter of the maintainer skill (see ../../.vitepress/config.mjs).
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../../../.claude/skills/tablefolk-dev/reference/', import.meta.url))

export default {
  paths: () => fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => ({
    params: { chapter: f.slice(0, -3) },
    content: fs.readFileSync(dir + f, 'utf8'),
  })),
}
