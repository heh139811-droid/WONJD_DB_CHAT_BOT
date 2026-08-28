// Install wonjd-db Hermes plugin + Workspace api_server toolset (run from install-mcp.mjs).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PLUGIN_SRC = path.join(ROOT, 'hermes', 'plugin', 'wonjd-db')
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
const hermesHome = process.env.HERMES_HOME || path.join(localAppData, 'hermes')
const configPath = path.join(hermesHome, 'config.yaml')
const pluginDest = path.join(hermesHome, 'plugins', 'wonjd-db')

export function upsertApiServerToolsets(text) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => line === '  api_server:')
  if (start === -1) return text

  let end = start + 1
  while (end < lines.length && lines[end].startsWith('    - ')) end += 1

  const items = lines
    .slice(start + 1, end)
    .filter((line) => line.trim() !== '- mcp-wonjd-db')
  if (!items.some((line) => line.trim() === '- wonjd-db')) {
    items.push('    - wonjd-db')
  }

  return [...lines.slice(0, start + 1), ...items, ...lines.slice(end)].join('\n')
}

export function upsertPlugins(text) {
  const root = ROOT.replace(/\\/g, '/')
  const enabledLine = '    - wonjd-db'
  const entriesBlock = `    wonjd-db:
      settings:
        project_root: "${root}"
`
  const pluginsBlock = `plugins:
  enabled:
${enabledLine}
  entries:
${entriesBlock}`

  const withoutPlugins = text.replace(/\n?plugins:\n[\s\S]*$/m, '').trimEnd()
  return `${withoutPlugins}\n\n${pluginsBlock}\n`
}

export function installPluginLink() {
  if (!fs.existsSync(PLUGIN_SRC)) {
    console.error(`missing plugin source: ${PLUGIN_SRC}`)
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(pluginDest), { recursive: true })
  if (fs.existsSync(pluginDest)) {
    fs.rmSync(pluginDest, { recursive: true, force: true })
  }
  const linkType = process.platform === 'win32' ? 'junction' : 'dir'
  fs.symlinkSync(PLUGIN_SRC, pluginDest, linkType)
  console.log(`linked ${pluginDest} -> ${PLUGIN_SRC}`)
}

export { pluginDest, configPath }
