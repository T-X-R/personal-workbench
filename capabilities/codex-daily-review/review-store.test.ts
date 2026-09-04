import assert from 'node:assert/strict'
import test from 'node:test'
import type { AiInvocationResult, CapabilityHost, CodexDailySessionFiles } from '../../packages/capability-contract/src/index.ts'
import { createDailyReviewStore } from './review-store.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

function sessionFiles(): CodexDailySessionFiles {
  return {
    date: '2026-09-04',
    files: [{
      name: 'root.jsonl',
      archived: false,
      content: [
        JSON.stringify({ timestamp: '2026-09-04T01:00:00.000Z', type: 'session_meta', payload: { id: 'root', cwd: '/work/project', source: 'cli' } }),
        JSON.stringify({ timestamp: '2026-09-04T01:01:00.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '修复导航后总结丢失' }] } }),
        JSON.stringify({ timestamp: '2026-09-04T01:02:00.000Z', type: 'event_msg', payload: { type: 'task_complete', last_agent_message: '已完成' } }),
      ].join('\n'),
    }],
  }
}

function createHost(
  aiResult: Promise<AiInvocationResult>,
  calls: { read: number; ai: number; documents: number },
  storedValues = new Map<string, string>(),
): CapabilityHost {
  return {
    environment: {
      getSnapshot: () => ({ language: 'zh', locale: 'zh-CN', theme: 'light' }),
      subscribe: () => () => undefined,
    },
    ai: {
      invoke: async () => {
        calls.ai += 1
        return aiResult
      },
    },
    codex: {
      sessions: {
        readTodayFiles: async () => {
          calls.read += 1
          return sessionFiles()
        },
      },
    },
    storage: {
      get: async <T>(key: string) => {
        const value = storedValues.get(key)
        return value === undefined ? null : JSON.parse(value) as T
      },
      set: async <T>(key: string, value: T) => {
        storedValues.set(key, JSON.stringify(value))
      },
      remove: async (key: string) => {
        storedValues.delete(key)
      },
    },
    documents: {
      publish: async () => {
        calls.documents += 1
      },
    },
    activity: { write: async () => undefined },
  }
}

test('continues a manual review after the page unsubscribes and restores its result', async () => {
  const ai = deferred<AiInvocationResult>()
  const calls = { read: 0, ai: 0, documents: 0 }
  const store = createDailyReviewStore(() => new Date('2026-09-04T12:00:00+08:00'))
  const host = createHost(ai.promise, calls)

  assert.equal(store.getSnapshot().phase, 'idle')
  assert.deepEqual(calls, { read: 0, ai: 0, documents: 0 })

  const unsubscribe = store.subscribe(() => undefined)
  const run = store.runReview(host, 'zh')
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(store.getSnapshot().phase, 'summarizing')
  assert.equal(store.runReview(host, 'zh'), run)

  unsubscribe()
  const remountedSnapshots: string[] = []
  const unsubscribeRemounted = store.subscribe(() => remountedSnapshots.push(store.getSnapshot().phase))
  assert.equal(store.getSnapshot().phase, 'summarizing')

  ai.resolve({ output: '导航后仍可看到的总结', provider: 'test', model: 'test-model' })
  await run

  assert.equal(store.getSnapshot().phase, 'ready')
  assert.equal(store.getSnapshot().summary?.output, '导航后仍可看到的总结')
  assert.deepEqual(remountedSnapshots, ['ready'])
  assert.deepEqual(calls, { read: 1, ai: 1, documents: 1 })
  unsubscribeRemounted()
})

test('restores today\'s completed report after the app store is recreated', async () => {
  const storedValues = new Map<string, string>()
  const calls = { read: 0, ai: 0, documents: 0 }
  const host = createHost(
    Promise.resolve({ output: '重启后仍然保留的总结', provider: 'test', model: 'test-model' }),
    calls,
    storedValues,
  )
  const now = () => new Date('2026-09-04T12:00:00+08:00')
  const firstStore = createDailyReviewStore(now)

  await firstStore.restore(host)
  await firstStore.runReview(host, 'zh')

  const restartedStore = createDailyReviewStore(now)
  assert.equal(restartedStore.getSnapshot().phase, 'idle')

  await restartedStore.restore(host)

  assert.equal(restartedStore.getSnapshot().phase, 'ready')
  assert.equal(restartedStore.getSnapshot().summary?.output, '重启后仍然保留的总结')
  assert.equal(restartedStore.getSnapshot().source?.sessions.length, 1)
  assert.deepEqual(calls, { read: 1, ai: 1, documents: 1 })
})
