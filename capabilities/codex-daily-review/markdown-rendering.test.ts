import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

test('renders review groups as visible Markdown lists after the platform reset', () => {
  const output = `## 1. 今日已完成

- **Workbench / Block**

  完成能力入口优化。

  - 支持 Markdown/GFM 渲染`
  const markup = renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [remarkGfm] }, output))
  const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

  assert.match(markup, /<ul>/)
  assert.match(markup, /<strong>Workbench \/ Block<\/strong>/)
  assert.match(styles, /\.codex-review-output ul\s*\{[^}]*list-style:\s*disc/s)
  assert.match(styles, /\.codex-review-output ol\s*\{[^}]*list-style:\s*decimal/s)
})
