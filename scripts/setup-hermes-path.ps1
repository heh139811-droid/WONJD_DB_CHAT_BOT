# One-time setup: prepend Hermes bundled Node 22 to PATH in PowerShell profile.
# Run:  powershell -ExecutionPolicy Bypass -File scripts/setup-hermes-path.ps1

$profileDir = Split-Path $PROFILE -Parent
if (-not (Test-Path $profileDir)) {
  New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

$marker = '# Hermes Agent — use bundled Node 22'
$block = @"
$marker
`$hermesNode = Join-Path `$env:LOCALAPPDATA 'hermes\node'
`$hermesBin  = Join-Path `$env:LOCALAPPDATA 'hermes\bin'
if (Test-Path `$hermesNode) {
  `$env:PATH = "`$hermesNode;`$hermesBin;`$env:PATH"
}
"@

if (Test-Path $PROFILE) {
  $existing = Get-Content $PROFILE -Raw -ErrorAction SilentlyContinue
  if ($existing -and $existing.Contains($marker)) {
    Write-Host "Already configured in: $PROFILE"
    exit 0
  }
  Add-Content -Path $PROFILE -Value "`n$block" -Encoding UTF8
} else {
  Set-Content -Path $PROFILE -Value $block -Encoding UTF8
}

Write-Host "Updated: $PROFILE"
Write-Host "Restart the terminal, then run:  node -v   (should show v22.x)"
