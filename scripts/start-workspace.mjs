import { spawn } from 'node:child_process'
import fs from 'node:fs'
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
const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
const hermesNodeDir = path.join(localAppData, 'hermes', 'node')
const hermesPnpm =
  process.platform === 'win32'
    ? path.join(hermesNodeDir, 'pnpm.cmd')
    : path.join(hermesNodeDir, 'pnpm')

const workspace =
  process.env.HERMES_WORKSPACE?.trim() ||
  path.join(home, 'Documents', 'hermes-workspace')

if (!fs.existsSync(path.join(workspace, 'package.json'))) {
  console.error(`[start:workspace] not found: ${workspace}`)
  process.exit(1)
}

if (fs.existsSync(hermesNodeDir)) {
  process.env.PATH = `${hermesNodeDir}${path.delimiter}${process.env.PATH || ''}`
}

const toolsDir = path.join(ROOT, 'tools')
if (process.platform === 'win32' && fs.existsSync(path.join(toolsDir, 'sqlite3.cmd'))) {
  process.env.PATH = `${toolsDir}${path.delimiter}${process.env.PATH || ''}`
}

const pnpm = fs.existsSync(hermesPnpm) ? hermesPnpm : 'pnpm'
const child = spawn(pnpm, ['dev'], {
  cwd: workspace,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
})
child.on('exit', (code) => process.exit(code ?? 1))
