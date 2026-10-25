// The Tablefolk documentation site (VitePress). The pages are the skills'
// own chapter files, read at build time: nothing is copied.
//
//   /guide/            plugins/tablefolk-scenario/skills/tablefolk-scenario/SKILL.md
//   /guide/reference/x                                       .../reference/x.md
//   /dev/              .claude/skills/tablefolk-dev/SKILL.md
//   /dev/reference/x                                         .../reference/x.md
//   /changelog         CHANGELOG.md
//
// Sidebar order follows each SKILL.md's chapter table; a new chapter file
// shows up on its own (at the end until the table lists it).
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'

const root = fileURLToPath(new URL('../../', import.meta.url))
const SCENARIO = root + 'plugins/tablefolk-scenario/skills/tablefolk-scenario/'
const DEV = root + '.claude/skills/tablefolk-dev/'

function chapters(skillDir, base) {
  const index = fs.readFileSync(skillDir + 'SKILL.md', 'utf8')
  const all = fs.readdirSync(skillDir + 'reference').filter(f => f.endsWith('.md')).map(f => f.slice(0, -3))
  const order = [...index.matchAll(/\(reference\/([\w-]+)\.md\)/g)].map(m => m[1]).filter(n => all.includes(n))
  return [...new Set([...order, ...all])].map(n => {
    const head = fs.readFileSync(`${skillDir}reference/${n}.md`, 'utf8').match(/^#\s+(.+)$/m)
    return { text: (head ? head[1] : n).replace(/`/g, ''), link: `${base}reference/${n}` }
  })
}

export default defineConfig({
  title: 'Tablefolk',
  description: 'Little 3D worlds whose characters are small language models running in your browser.',
  srcExclude: ['README.md'],
  // chapters also link to repository files by name; they are not pages
  ignoreDeadLinks: true,
  markdown: {
    // {{var}} in inline code is workflow template syntax, not Vue
    config(md) {
      const inline = md.renderer.rules.code_inline
      md.renderer.rules.code_inline = (...args) => inline(...args).replace('<code', '<code v-pre')
    },
  },
  themeConfig: {
    nav: [
      { text: 'User guide', link: '/guide/' },
      { text: 'Maintainers', link: '/dev/' },
      { text: 'Changelog', link: '/changelog' },
      { text: 'GitHub', link: 'https://github.com/runvnc/tablefolk' },
    ],
    sidebar: {
      '/guide/': [{ text: 'User guide', items: [{ text: 'Overview', link: '/guide/' }, ...chapters(SCENARIO, '/guide/')] }],
      '/dev/': [{ text: 'Maintainers', items: [{ text: 'Overview', link: '/dev/' }, ...chapters(DEV, '/dev/')] }],
    },
    outline: [2, 3],
    search: { provider: 'local' },
  },
})
