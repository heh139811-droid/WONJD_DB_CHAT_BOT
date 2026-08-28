// Ensure sqlite3.exe exists for Hermes Workspace kanban (execFileSync needs .exe on Windows).

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const toolsDir = path.join(ROOT, 'tools')
const exePath = path.join(toolsDir, 'sqlite3.exe')

const SQLITE_TOOLS_URL =
  process.env.SQLITE_TOOLS_URL?.trim() ||
  'https://www.sqlite.org/2024/sqlite-tools-win-x64-3460100.zip'

function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = findFile(full, name)
      if (nested) return nested
      continue
    }
    if (entry.name.toLowerCase() === name.toLowerCase()) return full
  }
  return null
}

function runPowerShell(script) {
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { stdio: 'inherit' },
  )
  if (r.status !== 0) {
    throw new Error('powershell command failed')
  }
}

export function ensureSqlite3() {
  if (process.platform !== 'win32') return exePath
  if (fs.existsSync(exePath)) return exePath

  fs.mkdirSync(toolsDir, { recursive: true })
  const zipPath = path.join(toolsDir, 'sqlite-tools.zip')
  const extractDir = path.join(toolsDir, '_sqlite-tools')

  console.log('[ensure-sqlite3] downloading official sqlite3.exe for Workspace kanban...')
  runPowerShell(
    `Invoke-WebRequest -Uri '${SQLITE_TOOLS_URL}' -OutFile '${zipPath.replace(/'/g, "''")}' -UseBasicParsing`,
  )

  fs.rmSync(extractDir, { recursive: true, force: true })
  runPowerShell(
    `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
  )

  const found = findFile(extractDir, 'sqlite3.exe')
  if (!found) {
    throw new Error('sqlite3.exe not found in downloaded sqlite-tools archive')
  }

  fs.copyFileSync(found, exePath)
  fs.rmSync(zipPath, { force: true })
  fs.rmSync(extractDir, { recursive: true, force: true })
  console.log(`[ensure-sqlite3] installed ${exePath}`)
  return exePath
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  ensureSqlite3()
}
