<#
  Starts Veda as a desktop app: production server, Kokoro voice, and an app window.

    veda.ps1              start whatever isn't running, then open the Veda window
    veda.ps1 -NoWindow    start the services only (use this for start-at-login)
    veda.ps1 -Rebuild     force a fresh production build first
    veda.ps1 -CheckOnly   say whether the build is out of date, then exit

  Closing the window does not stop the server, so phone access keeps working.
  Run stop-veda.ps1 to stop everything.
#>
param(
  [switch]$NoWindow,
  [switch]$Rebuild,
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Port = 3000
$KokoroPort = 8880
# 127.0.0.1, not "localhost": the server listens on IPv4 only (localhost tries IPv6 first and is slow),
# and Spotify's redirect address is 127.0.0.1 too, so the app keeps a single origin.
$Url = "http://127.0.0.1:$Port"
$LogDir = Join-Path $Root 'data\logs'
$KokoroDir = Join-Path $Root 'services\kokoro'

function Say([string]$Message) { Write-Host "[Veda] $Message" }

function Test-Http([string]$Uri, [int]$TimeoutSec = 2) {
  try {
    $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec $TimeoutSec
    return $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Test-PortListening([int]$Number) {
  return [bool](Get-NetTCPConnection -LocalPort $Number -State Listen -ErrorAction SilentlyContinue)
}

# The build is stale when any source file is newer than the last finished build.
function Test-BuildStale {
  $marker = Join-Path $Root '.next\BUILD_ID'
  if (-not (Test-Path $marker)) { return $true }
  $builtAt = (Get-Item $marker).LastWriteTimeUtc

  $files = @()
  foreach ($folder in 'src', 'public') {
    $path = Join-Path $Root $folder
    if (Test-Path $path) { $files += Get-ChildItem -Path $path -Recurse -File -ErrorAction SilentlyContinue }
  }
  foreach ($name in 'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs') {
    $path = Join-Path $Root $name
    if (Test-Path $path) { $files += Get-Item $path }
  }
  return [bool]($files | Where-Object { $_.LastWriteTimeUtc -gt $builtAt } | Select-Object -First 1)
}

function Find-Browser {
  $candidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  )
  return $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

try {
  Set-Location $Root
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

  if ($CheckOnly) {
    if (Test-BuildStale) { Say 'The production build is out of date.' } else { Say 'The production build is up to date.' }
    exit 0
  }

  # 1. Production build, only when missing or out of date.
  if ($Rebuild -or (Test-BuildStale)) {
    Say 'Building Veda (this takes a minute or two)...'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "The build failed (exit code $LASTEXITCODE). Fix the errors above and run again." }
  }

  # 2. Kokoro voice: start it in parallel so it warms up while the server starts.
  if ((Test-Path (Join-Path $KokoroDir '.venv')) -and -not (Test-Http "http://127.0.0.1:$KokoroPort/health")) {
    $uv = Get-Command uv -ErrorAction SilentlyContinue
    if ($uv) {
      Say 'Starting the Kokoro voice...'
      Start-Process -FilePath $uv.Source -WindowStyle Hidden `
        -ArgumentList @('run', '--project', "`"$KokoroDir`"", 'python', "`"$(Join-Path $KokoroDir 'server.py')`"") `
        -RedirectStandardOutput (Join-Path $LogDir 'kokoro.log') -RedirectStandardError (Join-Path $LogDir 'kokoro.err.log')
    } else {
      Say 'uv was not found, so Kokoro was skipped (Veda will use a fallback voice).'
    }
  }

  # 3. The production server.
  if (-not (Test-Http "$Url/api/app-settings")) {
    if (Test-PortListening $Port) {
      throw "Port $Port is already in use by another program (a dev server, perhaps). Close it and run again."
    }
    Say 'Starting the Veda server...'
    Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'start') -WorkingDirectory $Root -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $LogDir 'server.log') -RedirectStandardError (Join-Path $LogDir 'server.err.log')

    $deadline = (Get-Date).AddSeconds(90)
    while (-not (Test-Http "$Url/api/app-settings" 3)) {
      if ((Get-Date) -gt $deadline) { throw "The server did not come up within 90 seconds. See $LogDir\server.err.log" }
      Start-Sleep -Milliseconds 700
    }
  }
  Say "Veda is running at $Url"

  # 4. The app window.
  if (-not $NoWindow) {
    $browser = Find-Browser
    if (-not $browser) {
      Say 'Edge or Chrome was not found, so Veda opened in your default browser.'
      Start-Process $Url
      exit 0
    }
    # Its own browser profile keeps Veda's microphone permission and window apart from your normal browsing.
    # It lives outside the project: the production build scans the project folder and fails on a browser's locked files.
    $profileDir = Join-Path $env:LOCALAPPDATA 'Veda\window-profile'
    $arguments = "--app=$Url --user-data-dir=`"$profileDir`" --no-first-run --no-default-browser-check --window-size=1360,880"
    Start-Process -FilePath $browser -ArgumentList $arguments
    Say 'Opened the Veda window.'
  }
} catch {
  Write-Host ''
  Write-Host "[Veda] $($_.Exception.Message)" -ForegroundColor Red
  if ([Environment]::UserInteractive -and -not $NoWindow) { [void](Read-Host 'Press Enter to close') }
  exit 1
}
