// Register wonjd-db MCP with Hermes (writes ~/.hermes/config.yaml).

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SERVER = path.join(ROOT, 'wonjd_mcp', 'server.py').replace(/\\/g, '/')

const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
const uv = path.join(localAppData, 'hermes', 'bin', 'uv.exe')
const hermesHome = process.env.HERMES_HOME || path.join(localAppData, 'hermes')
const configPath = path.join(hermesHome, 'config.yaml')
const venvPython =
  process.platform === 'win32'
    ? path.join(ROOT, '.venv', 'Scripts', 'python.exe')
    : path.join(ROOT, '.venv', 'bin', 'python')

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function upsertMcpServer(text) {
  const cmd = venvPython.replace(/\\/g, '/')
  const root = ROOT.replace(/\\/g, '/')
  const block = `mcp_servers:
  wonjd-db:
    command: "${cmd}"
    args:
      - "${SERVER}"
    cwd: "${root}"
    enabled: true
    connect_timeout: 60
    keepalive_interval: 30
    tools:
      include:
        - db_query
        - db_list_tables
`
  if (/^mcp_servers:/m.test(text)) {
    return text.replace(/^mcp_servers:[\s\S]*?(?=^# ── Security)/m, block)
  }
  return text.trimEnd() + `\n\n${block}\n`
}

function upsertApiServerToolsets(text) {
  const entry = '    - mcp-wonjd-db'
  if (text.includes('mcp-wonjd-db')) return text
  const match = text.match(/^  api_server:\n([\s\S]*?)(?=^\S)/m)
  if (!match) return text
  const lines = match[1].trimEnd()
  return text.replace(match[0], `  api_server:\n${lines}\n${entry}\n`)
}

console.log('[1/4] uv sync')
run(uv, ['sync'], { cwd: ROOT })

if (!fs.existsSync(venvPython)) {
  console.error(`missing ${venvPython}`)
  process.exit(1)
}

console.log('\n[2/4] update config.yaml')
let text = fs.readFileSync(configPath, 'utf8')
text = upsertMcpServer(text)
text = upsertApiServerToolsets(text)
fs.writeFileSync(configPath, text, 'utf8')
console.log(`updated ${configPath}`)

console.log('\n[3/4] hermes mcp test wonjd-db')
run('hermes', ['mcp', 'test', 'wonjd-db'])

console.log('\n[4/4] hermes gateway restart')
run('hermes', ['gateway', 'restart'])

console.log('\nDone.')
