import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { checkHealth, waitForHealth } from './hermes-health.mjs'

export async function ensureDashboard({ hermes, hermesNodeDir, localAppData, dashboardUrl, track, root }) {
  const webDist = path.join(localAppData, 'hermes', 'hermes-agent', 'hermes_cli', 'web_dist')
  if (await checkHealth(`${dashboardUrl}/api/status`, 2000)) {
    console.log(`[start:all] dashboard already healthy at ${dashboardUrl}/api/status`)
    return
  }
  if (!fs.existsSync(webDist)) {
    console.error('[start:all] dashboard web UI not built yet.')
    console.error('One-time setup (Hermes Node 22 required):')
    console.error(`  set PATH=${hermesNodeDir};%PATH%`)
    console.error(`  cd ${path.join(localAppData, 'hermes', 'hermes-agent')}`)
    console.error('  npm install --workspace web && npm run build -w web')
    process.exit(1)
  }
  console.log(`[start:all] starting dashboard: ${hermes} dashboard --no-open --skip-build`)
  track(
    spawn(hermes, ['dashboard', '--no-open', '--skip-build'], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    }),
    'dashboard',
  )
  if (!(await waitForHealth(`${dashboardUrl}/api/status`, 'dashboard'))) {
    process.exit(1)
  }
}

export async function ensureGateway({ hermes, apiUrl, track, root }) {
  if (await checkHealth(`${apiUrl}/health`, 2000)) {
    console.log(`[start:all] gateway already healthy at ${apiUrl}/health`)
    return
  }
  console.log(`[start:all] starting gateway: ${hermes} gateway run`)
  track(
    spawn(hermes, ['gateway', 'run'], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    }),
    'gateway',
  )
  if (!(await waitForHealth(`${apiUrl}/health`, 'gateway'))) {
    process.exit(1)
  }
}
