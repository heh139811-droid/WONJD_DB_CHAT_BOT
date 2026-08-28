import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureSqlite3 } from './ensure-sqlite3.mjs'
import { ensureDashboard, ensureGateway } from './lib/ensure-hermes-services.mjs'
import { createProcessGroup } from './lib/process-group.mjs'
import { patchWorkspaceNewChatInterrupt } from './patch-workspace-new-chat.mjs'

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
const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
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
  process.env.HERMES_WORKSPACE?.trim() || path.join(home, 'Documents', 'hermes-workspace')
const apiUrl = (process.env.HERMES_API_URL?.trim() || 'http://127.0.0.1:8642').replace(/\/$/, '')
const dashboardUrl = (
  process.env.HERMES_DASHBOARD_URL?.trim() || 'http://127.0.0.1:9119'
).replace(/\/$/, '')

if (!fs.existsSync(path.join(workspace, 'package.json'))) {
  console.error(`[start:all] workspace not found: ${workspace}`)
  process.exit(1)
}

if (fs.existsSync(hermesNodeDir)) {
  process.env.PATH = `${hermesNodeDir}${path.delimiter}${process.env.PATH || ''}`
}

const toolsDir = path.join(ROOT, 'tools')
if (process.platform === 'win32') {
  try {
    ensureSqlite3()
  } catch (err) {
    console.error(`[start:all] failed to install sqlite3.exe: ${err?.message || err}`)
    process.exit(1)
  }
  process.env.PATH = `${toolsDir}${path.delimiter}${process.env.PATH || ''}`
}

const { track } = createProcessGroup()
const hermes = fs.existsSync(hermesBin) ? hermesBin : 'hermes'
const serviceOpts = { hermes, apiUrl, dashboardUrl, hermesNodeDir, localAppData, track, root: ROOT }

await ensureGateway(serviceOpts)
await ensureDashboard(serviceOpts)

patchWorkspaceNewChatInterrupt()

const pnpm = fs.existsSync(hermesPnpm) ? hermesPnpm : 'pnpm'
console.log(`[start:all] starting workspace: ${pnpm} dev (cwd=${workspace})`)
track(
  spawn(pnpm, ['dev'], {
    cwd: workspace,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  }),
  'workspace',
)
