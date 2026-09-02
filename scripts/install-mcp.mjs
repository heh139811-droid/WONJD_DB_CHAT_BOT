// Register wonjd-db + wonjd-wireframe with Hermes (MCP + native plugins).

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  configPath,
  dbPluginDest,
  installPluginLinks,
  upsertApiServerToolsets,
  upsertPlugins,
  wireframePluginDest,
  WIREFRAME_ROOT,
} from './install-plugin.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SERVER = path.join(ROOT, 'wonjd_mcp', 'server.py').replace(/\\/g, '/')

const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
const uv = path.join(localAppData, 'hermes', 'bin', 'uv.exe')
const hermesHome = process.env.HERMES_HOME || path.join(localAppData, 'hermes')
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

console.log('[1/6] uv sync')
run(uv, ['sync'], { cwd: ROOT })

if (!fs.existsSync(venvPython)) {
  console.error(`missing ${venvPython}`)
  process.exit(1)
}

console.log('\n[2/6] build wireframe CLI')
const wfCli = path.join(WIREFRAME_ROOT, 'packages', 'cli')
if (fs.existsSync(wfCli)) {
  run('npm', ['run', 'build'], { cwd: wfCli, shell: true })
} else {
  console.warn(`skip wireframe cli build — missing ${wfCli}`)
}

console.log('\n[3/6] install Hermes plugins (wonjd-db + wonjd-wireframe)')
installPluginLinks()

console.log('\n[4/6] update config.yaml')
let text = fs.readFileSync(configPath, 'utf8')
text = upsertMcpServer(text)
text = upsertApiServerToolsets(text)
text = upsertPlugins(text)
fs.writeFileSync(configPath, text, 'utf8')
console.log(`updated ${configPath}`)
console.log('  api_server: wonjd-db, wonjd-wireframe')

console.log('\n[5/6] hermes plugins doctor')
run('hermes', ['plugins', 'doctor', dbPluginDest, '--ci'])
run('hermes', ['plugins', 'doctor', wireframePluginDest, '--ci'])

console.log('\n[6/6] hermes gateway restart')
run('hermes', ['gateway', 'restart'])

console.log('\nDone.')
console.log('Workspace tools:')
console.log('  wonjd_db_query / wonjd_db_list_tables')
console.log('  wonjd_prd_save / wonjd_prd_list / wonjd_wireframe_build / wonjd_wireframe_render')
