import http from 'node:http'
import https from 'node:https'

export function checkHealth(url, timeoutMs = 2000) {
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

export async function waitForHealth(url, label, attempts = 30, delayMs = 1000) {
  for (let i = 0; i < attempts; i += 1) {
    if (await checkHealth(url, 2000)) {
      console.log(`[start:all] ${label} healthy at ${url}`)
      return true
    }
    await new Promise((r) => setTimeout(r, delayMs))
  }
  console.error(`[start:all] timed out waiting for ${label} at ${url}`)
  return false
}
