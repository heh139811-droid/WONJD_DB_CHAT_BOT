import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

for (const file of ['.env.local', '.env']) {
  const p = path.join(ROOT, file)
  if (!fs.existsSync(p)) continue
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i <= 0) continue
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env) || process.env[key] === '') process.env[key] = val
  }
}

const home = os.homedir()
const localAppData =
  process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
const hermesNodeDir = path.join(localAppData, 'hermes', 'node')
const hermesBin =
  process.platform === 'win32'
    ? path.join(localAppData, 'hermes', 'bin', 'hermes.exe')
    : path.join(home, '.local', 'bin', 'hermes')
const hermesPnpm =
  process.platform === 'win32'
    ? path.join(hermesNodeDir, 'pnpm.cmd')
    : path.join(hermesNodeDir, 'pnpm')

const workspace =
  process.env.HERMES_WORKSPACE?.trim() ||
  path.join(home, 'Documents', 'hermes-workspace')
const apiUrl = (
  process.env.HERMES_API_URL?.trim() || 'http://127.0.0.1:8642'
).replace(/\/$/, '')

if (!fs.existsSync(path.join(workspace, 'package.json'))) {
  console.error(`[start:all] workspace not found: ${workspace}`)
  process.exit(1)
}

if (fs.existsSync(hermesNodeDir)) {
  process.env.PATH = `${hermesNodeDir}${path.delimiter}${process.env.PATH || ''}`
}

// Hermes Workspace kanban reads ~/.hermes/kanban.db via the sqlite3 CLI.
// Windows does not ship it — use the project shim unless already installed.
const toolsDir = path.join(ROOT, 'tools')
if (process.platform === 'win32' && fs.existsSync(path.join(toolsDir, 'sqlite3.cmd'))) {
  process.env.PATH = `${toolsDir}${path.delimiter}${process.env.PATH || ''}`
}

function checkHealth(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let settled = false
    const done = (ok) => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      done(false)
      return
    }
    const lib = parsed.protocol === 'https:' ? https : http
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      res.resume()
      done(res.statusCode >= 200 && res.statusCode < 300)
    })
    req.on('timeout', () => {
      req.destroy()
      done(false)
    })
    req.on('error', () => done(false))
  })
}

const children = []
let shuttingDown = false

function stopChildren(sig = 'SIGTERM') {
  if (shuttingDown) return
  shuttingDown = true
  for (const c of children) {
    if (c.exitCode != null || c.signalCode != null) continue
    try {
      c.kill(sig)
    } catch {
      /* ignore */
    }
  }
}

function track(child, label) {
  children.push(child)
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(
      `[start:all] ${label} exited (code=${code ?? 'null'} signal=${signal ?? 'null'}); stopping others`,
    )
    stopChildren()
    process.exit(code ?? 1)
  })
  return child
}

function spawnCmd(command, args, label) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  })
  return track(child, label)
}

process.on('SIGINT', () => {
  stopChildren('SIGINT')
  process.exit(130)
})
process.on('SIGTERM', () => {
  stopChildren('SIGTERM')
  process.exit(143)
})

const healthy = await checkHealth(`${apiUrl}/health`, 2000)
if (healthy) {
  console.log(`[start:all] gateway already healthy at ${apiUrl}/health`)
} else {
  const hermes = fs.existsSync(hermesBin) ? hermesBin : 'hermes'
  console.log(`[start:all] starting gateway: ${hermes} gateway run`)
  spawnCmd(hermes, ['gateway', 'run'], 'gateway')
}

const pnpm = fs.existsSync(hermesPnpm) ? hermesPnpm : 'pnpm'
console.log(`[start:all] starting workspace: ${pnpm} dev (cwd=${workspace})`)
const ws = spawn(pnpm, ['dev'], {
  cwd: workspace,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
})
track(ws, 'workspace')