// Patch hermes-workspace: skip cancelStreaming on /chat/new → session navigation.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspace =
  process.env.HERMES_WORKSPACE?.trim() ||
  path.join(os.homedir(), 'Documents', 'hermes-workspace')
const target = path.join(workspace, 'src', 'screens', 'chat', 'chat-screen.tsx')

const marker = 'if (prevWasNew) return'

export function patchWorkspaceNewChatInterrupt() {
  if (!fs.existsSync(target)) {
    console.warn(`[patch-workspace] skip: ${target} not found`)
    return false
  }
  const text = fs.readFileSync(target, 'utf8')
  if (text.includes(marker)) {
    return true
  }
  const patched = text.replace(
    /if \(navCancelKeyRef\.current !== navKey\) \{\r?\n\s+navCancelKeyRef\.current = navKey\r?\n\s+cancelStreaming\(\)\r?\n\s+\}/,
    `if (navCancelKeyRef.current !== navKey) {
      const prevWasNew = navCancelKeyRef.current.endsWith('::new')
      navCancelKeyRef.current = navKey
      // /chat/new → concrete session while send-stream is in flight.
      if (prevWasNew) return
      cancelStreaming()
    }`,
  )
  if (patched === text) {
    console.warn('[patch-workspace] chat-screen.tsx pattern not found; skip')
    return false
  }
  fs.writeFileSync(target, patched, 'utf8')
  console.log('[patch-workspace] fixed first-chat "Operation interrupted." race')
  return true
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  patchWorkspaceNewChatInterrupt()
}
