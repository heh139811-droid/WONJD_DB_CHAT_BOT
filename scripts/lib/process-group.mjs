export function createProcessGroup() {
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

  process.on('SIGINT', () => {
    stopChildren('SIGINT')
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    stopChildren('SIGTERM')
    process.exit(143)
  })

  return { track, stopChildren }
}
