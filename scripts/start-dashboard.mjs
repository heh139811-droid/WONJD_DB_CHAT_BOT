// Start Hermes Dashboard (:9119) — required for Workspace MCP / Skills / Config UI.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
const hermesNodeDir = path.join(localAppData, 'hermes', 'node')
const hermesBin =
  process.platform === 'win32'
    ? path.join(localAppData, 'hermes', 'bin', 'hermes.exe')
    : path.join(os.homedir(), '.local', 'bin', 'hermes')

const dashboardUrl = (
  process.env.HERMES_DASHBOARD_URL?.trim() || 'http://127.0.0.1:9119'
).replace(/\/$/, '')

const webDist = path.join(
  localAppData,
  'hermes',
  'hermes-agent',
  'hermes_cli',
  'web_dist',
)

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
      parsed = new URL(`${url}/api/status`)
    } catch {
      done(false)
      return
    }
    const req = http.get(parsed, { timeout: timeoutMs }, (res) => {
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

const healthy = await checkHealth(dashboardUrl, 2000)
if (healthy) {
  console.log(`[start:dashboard] already healthy at ${dashboardUrl}/api/status`)
  process.exit(0)
}

if (!fs.existsSync(webDist)) {
  console.error('[start:dashboard] web UI not built yet.')
  console.error('One-time setup (Hermes Node 22 required):')
  console.error(`  set PATH=${hermesNodeDir};%PATH%`)
  console.error(`  cd ${path.join(localAppData, 'hermes', 'hermes-agent')}`)
  console.error('  npm install --workspace web && npm run build -w web')
  process.exit(1)
}

const env = { ...process.env }
if (fs.existsSync(hermesNodeDir)) {
  env.PATH = `${hermesNodeDir}${path.delimiter}${env.PATH || ''}`
}

const hermes = fs.existsSync(hermesBin) ? hermesBin : 'hermes'
console.log(`[start:dashboard] ${hermes} dashboard --no-open --skip-build`)

const child = spawn(hermes, ['dashboard', '--no-open', '--skip-build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env,
})

child.on('exit', (code) => process.exit(code ?? 1))
