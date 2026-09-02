// Install wonjd-db + wonjd-wireframe Hermes plugins (run from install-mcp.mjs).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_PLUGIN_SRC = path.join(ROOT, 'hermes', 'plugin', 'wonjd-db')
const WIREFRAME_ROOT =
  process.env.WIREFRAME_ROOT?.trim() || path.resolve(ROOT, '..', 'wireframe_dashboard')
const WIREFRAME_PLUGIN_SRC = path.join(WIREFRAME_ROOT, 'hermes', 'plugin', 'wonjd-wireframe')

const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
const hermesHome = process.env.HERMES_HOME || path.join(localAppData, 'hermes')
const configPath = path.join(hermesHome, 'config.yaml')
const dbPluginDest = path.join(hermesHome, 'plugins', 'wonjd-db')
const wireframePluginDest = path.join(hermesHome, 'plugins', 'wonjd-wireframe')

const PLUGIN_TOOLSETS = ['wonjd-db', 'wonjd-wireframe']

function linkPlugin(src, dest, label) {
  if (!fs.existsSync(src)) {
    console.error(`missing plugin source: ${src}`)
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true })
  }
  const linkType = process.platform === 'win32' ? 'junction' : 'dir'
  fs.symlinkSync(src, dest, linkType)
  console.log(`linked ${label}: ${dest} -> ${src}`)
}

export function upsertApiServerToolsets(text) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => line === '  api_server:')
  if (start === -1) return text

  let end = start + 1
  while (end < lines.length && lines[end].startsWith('    - ')) end += 1

  const existing = lines
    .slice(start + 1, end)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^-\s*/, ''))

  const merged = [...existing.filter((id) => id !== 'mcp-wonjd-db')]
  for (const id of PLUGIN_TOOLSETS) {
    if (!merged.includes(id)) merged.push(id)
  }

  const items = merged.map((id) => `    - ${id}`)
  return [...lines.slice(0, start + 1), ...items, ...lines.slice(end)].join('\n')
}

export function upsertPlugins(text) {
  const dbRoot = ROOT.replace(/\\/g, '/')
  const wfRoot = WIREFRAME_ROOT.replace(/\\/g, '/')
  const enabledLines = PLUGIN_TOOLSETS.map((id) => `    - ${id}`).join('\n')
  const entriesBlock = `    wonjd-db:
      settings:
        project_root: "${dbRoot}"
    wonjd-wireframe:
      settings:
        wireframe_root: "${wfRoot}"
`
  const pluginsBlock = `plugins:
  enabled:
${enabledLines}
  entries:
${entriesBlock}`

  const withoutPlugins = text.replace(/\n?plugins:\n[\s\S]*$/m, '').trimEnd()
  return `${withoutPlugins}\n\n${pluginsBlock}\n`
}

export function installPluginLinks() {
  linkPlugin(DB_PLUGIN_SRC, dbPluginDest, 'wonjd-db')
  linkPlugin(WIREFRAME_PLUGIN_SRC, wireframePluginDest, 'wonjd-wireframe')
}

/** @deprecated use installPluginLinks */
export function installPluginLink() {
  installPluginLinks()
}

export { dbPluginDest, wireframePluginDest, configPath, WIREFRAME_ROOT }
