$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo

$env:PASEO_HOME = "$env:USERPROFILE\.paseo-dev"
$env:PASEO_LOCAL_MODELS_DIR = "$env:USERPROFILE\.paseo\models\local-speech"
$env:PATH = "$repo\node_modules\.bin;$env:PATH"

New-Item -ItemType Directory -Force -Path $env:PASEO_HOME | Out-Null
New-Item -ItemType Directory -Force -Path $env:PASEO_LOCAL_MODELS_DIR | Out-Null

$configPath = Join-Path $env:PASEO_HOME "config.json"
if (-not (Test-Path $configPath)) {
  $cfg = @{ version = 1; daemon = @{ listen = "127.0.0.1:6788"; cors = @{ allowedOrigins = @("*") } } }
  $json = $cfg | ConvertTo-Json -Depth 3
  [System.IO.File]::WriteAllText($configPath, $json, (New-Object System.Text.UTF8Encoding $false))
}

Push-Location "$repo\packages\desktop"
npm run build:main 2>&1 | Out-Null
Pop-Location

$env:EXPO_PORT = (npx get-port-cli 8081 8082 8083 8084 8085).Trim()
$env:EXPO_DEV_URL = "http://localhost:$($env:EXPO_PORT)"
$env:PASEO_ELECTRON_FLAGS = "--remote-debugging-port=9223"
$env:PASEO_CORS_ORIGINS = "*"
$env:PASEO_ELECTRON_USER_DATA_DIR = "$repo\packages\desktop\.dev\user-data"

New-Item -ItemType Directory -Force -Path $env:PASEO_ELECTRON_USER_DATA_DIR | Out-Null

Write-Host "Paseo Desktop Dev" -ForegroundColor Cyan

concurrently `
    --kill-others `
    --names "metro,electron" `
    --prefix-colors "magenta,cyan" `
    "cd `"$repo\packages\app`" && cross-env PASEO_WEB_PLATFORM=electron npx expo start --port $($env:EXPO_PORT)" `
    "npx wait-on tcp:$($env:EXPO_PORT) && npx electron `"$repo\packages\desktop`""
