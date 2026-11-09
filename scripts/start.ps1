Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22.19 or later first.' }
if (-not (Test-Path -LiteralPath 'dist/index.html')) { throw 'Run npm run build first.' }
Write-Host 'Opening http://localhost:3001. Keep this terminal open.'
node --experimental-sqlite server/index.mjs
