import assert from 'node:assert/strict'
import test from 'node:test'
import type { CodexSessionTextFile } from '../../packages/capability-contract/src/index.ts'
import { buildSummaryPrompt, parseDailySessions } from './session-parser.ts'

function line(type: string, payload: Record<string, unknown>, timestamp = '2026-09-04T01:00:00.000Z') {
  return JSON.stringify({ timestamp, type, payload })
}

test('extracts user tasks and outcomes while excluding injected context and subagents', () => {
  const rootContent = [
    line('session_meta', { id: 'root-1', cwd: '/work/project', source: 'cli' }),
    line('response_item', { type: 'message', role: 'user', content: [
      { type: 'input_text', text: '# AGENTS.md instructions\ninternal' },
      { type: 'input_text', text: '<environment_context>internal</environment_context>' },
    ] }),
    line('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '修复登录失败' }] }),
    line('event_msg', { type: 'task_complete', last_agent_message: '已修复并通过测试' }),
    line('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '继续检查发布状态' }] }),
    '{unfinished',
  ].join('\n')
  const subagentContent = [
    line('session_meta', { id: 'child-1', cwd: '/work/project', source: { subagent: { other: 'review' } } }),
    line('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '内部审查任务' }] }),
  ].join('\n')
  const files: CodexSessionTextFile[] = [
    { name: 'root.jsonl', archived: false, content: rootContent },
    { name: 'child.jsonl', archived: false, content: subagentContent },
  ]

  const result = parseDailySessions(files)

  assert.equal(result.scannedFileCount, 2)
  assert.equal(result.sessions.length, 1)
  assert.equal(result.sessions[0].id, 'root-1')
  assert.deepEqual(result.sessions[0].turns.map((turn) => turn.request), ['修复登录失败', '继续检查发布状态'])
  assert.deepEqual(result.sessions[0].turns.map((turn) => turn.outcome), ['已修复并通过测试', null])
})

test('keeps archived root sessions and includes every turn in a bounded summary prompt', () => {
  const content = [
    line('session_meta', { id: 'archived-1', cwd: '/work/archived', source: 'vscode' }),
    ...Array.from({ length: 120 }, (_, index) => [
      line('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: `任务-${index}-${'很长'.repeat(2_000)}` }] }),
      line('event_msg', { type: 'task_complete', last_agent_message: `结果-${index}-${'完成'.repeat(2_000)}` }),
    ]).flat(),
  ].join('\n')
  const source = parseDailySessions([{ name: 'archived.jsonl', archived: true, content }])

  const prompt = buildSummaryPrompt('2026-09-04', source.sessions, 'zh')

  assert.equal(source.sessions[0].archived, true)
  assert.equal(source.sessions[0].turns.length, 120)
  assert.match(prompt, /任务-0-/)
  assert.match(prompt, /任务-119-/)
  assert.ok(new TextEncoder().encode(prompt).length < 100_000)
})
